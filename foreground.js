// MindfulFeed foreground (content script) for Instagram Home Feed
// Tracks which feed post is visible and for how long (dwell time).
// Sends periodic updates to the MV3 service worker.

(() => {
  const VISIBILITY_THRESHOLD = 0.6;     // count dwell when >= 60% visible
  const ACTIVE_MIN_RATIO = 0.15;       // candidate for "active" post
  const TICK_MS = 250;                 // internal timing tick
  const PUSH_MS = 2000;                // send updates to background

  let tracking = false;
  let sessionId = null;
  let startedAt = 0;

  /** @type {Map<string, {href: string, caption: string, firstSeenAt: number, dwellMs: number}>} */
  const posts = new Map();
  /** @type {Map<string, number>} */
  const ratios = new Map();
  /** @type {Map<string, number>} */
  const visibleSince = new Map();

  let activeKey = null;
  let io = null;
  let mo = null;
  let tickTimer = null;
  let pushTimer = null;
  let observing = new WeakSet();

  function now() {
    return Date.now();
  }

  function safeSend(msg) {
    try {
      chrome.runtime.sendMessage(msg, () => {
        // ignore response; avoid spamming errors
        void chrome.runtime.lastError;
      });
    } catch (_) {}
  }

  function normalizeKey(href) {
    try {
      const u = new URL(href, location.href);
      return u.origin + u.pathname.replace(/\/$/, "");
    } catch {
      return String(href);
    }
  }

  function getPostLink(article) {
    // Homefeed posts usually have /p/… ; sometimes /reel/ appears in feed as well.
    return (
      article.querySelector('a[href*="/p/"]') ||
      article.querySelector('a[href*="/reel/"]') ||
      article.querySelector('a[href^="/p/"]') ||
      article.querySelector('a[href^="/reel/"]')
    );
  }

  function extractImageUrl(article) {
    // Try to find the main image in the Instagram post
    // Instagram uses <img> tags for images and videos have poster images

    // Try main post image first (highest quality)
    const img = article.querySelector('img[srcset]') || article.querySelector('img[src]');

    if (img) {
      // Prefer srcset for higher quality, fallback to src
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        // srcset format: "url1 width1, url2 width2, ..."
        // Get the highest resolution URL (last one usually)
        const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
        return urls[urls.length - 1] || img.src;
      }
      return img.src;
    }

    return null; // No image found
  }

  /**
   * Convert an image element to base64 data URI
   * This runs in the content script context where we have access to Instagram's images
   * @param {HTMLImageElement} img - Image element from DOM
   * @returns {string|null} Base64 data URI or null if failed
   */
  function convertImageToBase64(img) {
    try {
      // Resize image to reduce payload size and prevent VRAM exhaustion
      const MAX_WIDTH = 640;  // Smaller size to prevent memory issues
      const MAX_HEIGHT = 640;

      let width = img.naturalWidth || img.width || 640;
      let height = img.naturalHeight || img.height || 640;

      // Calculate scaled dimensions while maintaining aspect ratio
      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Create a canvas with the scaled dimensions
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      // Draw the resized image on canvas
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Convert canvas to base64 (JPEG format with lower quality for smaller size)
      // Lower quality (50%) to prevent VRAM exhaustion in vision models
      return canvas.toDataURL('image/jpeg', 0.5);
    } catch (error) {
      console.error('[MindfulFeed] Error converting image to base64:', error);
      return null;
    }
  }

  /**
   * Extract image element and convert to base64
   * @param {HTMLElement} article - Instagram post article element
   * @returns {string|null} Base64 data URI or null if failed
   */
  function extractImageBase64(article) {
    try {
      const img = article.querySelector('img[srcset]') || article.querySelector('img[src]');
      if (!img) return null;

      // Check if image is loaded
      if (!img.complete || !img.naturalWidth) {
        console.log('[MindfulFeed] Image not fully loaded yet, skipping base64 conversion');
        return null;
      }

      return convertImageToBase64(img);
    } catch (error) {
      console.error('[MindfulFeed] Error extracting image base64:', error);
      return null;
    }
  }

  function extractCaption(article) {
    // Instagram DOM changes a lot. Use a resilient heuristic:
    // Try to expand "more" button first to get full caption
    const moreButton = article.querySelector('[role="button"]');
    if (moreButton && (moreButton.textContent === 'more' || moreButton.textContent === '...more')) {
      try {
        // Click the "more" button to expand caption
        moreButton.click();
        // Give it a tiny moment to expand (synchronous is fine, just DOM update)
      } catch (e) {
        // Ignore click errors
      }
    }

    // collect visible text spans and keep a longer caption
    const spans = Array.from(article.querySelectorAll('span[dir="auto"]'));
    const texts = [];
    const seen = new Set();

    for (const s of spans) {
      const t = (s.textContent || "").trim();
      if (!t) continue;
      if (t.length < 2) continue;

      // filter very common UI labels and navigation text
      if (/^(like|likes|comment|comments|share|save|follow|following|more|\.\.\.more|view|replies)$/i.test(t)) continue;

      // Skip duplicate text
      if (seen.has(t)) continue;

      seen.add(t);
      texts.push(t);

      // Collect up to 20 text spans for longer captions
      if (texts.length >= 20) break;
    }

    // Join texts and clean up
    let caption = texts.join(" ").replace(/\s+/g, " ").trim();

    // Remove trailing "...more" or "more" if it slipped through
    caption = caption.replace(/\.\.\.more\s*$/i, '').replace(/\s+more\s*$/i, '').trim();

    // Increase limit to 1000 characters for better analysis
    return caption.slice(0, 1000);
  }

  function ensurePost(article) {
    const link = getPostLink(article);
    if (!link) return null;
    const href = link.href || (link.getAttribute("href") ? new URL(link.getAttribute("href"), location.href).href : "");
    if (!href) return null;

    const key = normalizeKey(href);
    if (!posts.has(key)) {
      posts.set(key, {
        href,
        caption: extractCaption(article),
        imageUrl: extractImageUrl(article),
        firstSeenAt: now(),
        dwellMs: 0
      });
    } else {
      // keep caption and imageUrl updated if they were empty earlier
      const p = posts.get(key);
      if (p) {
        if (!p.caption || p.caption.length < 5) {
          p.caption = extractCaption(article);
        }
        if (!p.imageUrl) {
          p.imageUrl = extractImageUrl(article);
        }
      }
    }
    return key;
  }

  function observeArticles() {
    if (!io) return;
    const articles = Array.from(document.querySelectorAll("article"));
    for (const a of articles) {
      if (observing.has(a)) continue;
      const key = ensurePost(a);
      if (!key) continue;
      observing.add(a);
      io.observe(a);
    }
  }

  function computeActive() {
    let bestKey = null;
    let bestRatio = 0;
    for (const [k, r] of ratios.entries()) {
      if (r >= ACTIVE_MIN_RATIO && r > bestRatio) {
        bestKey = k;
        bestRatio = r;
      }
    }
    activeKey = bestKey;
  }

  function tick() {
    const t = now();

    // Update dwell for posts above threshold
    for (const [k, r] of ratios.entries()) {
      if (r >= VISIBILITY_THRESHOLD) {
        if (!visibleSince.has(k)) visibleSince.set(k, t);
      } else {
        if (visibleSince.has(k)) {
          const start = visibleSince.get(k);
          visibleSince.delete(k);
          const p = posts.get(k);
          if (p) p.dwellMs += Math.max(0, t - start);
        }
      }
    }
  }

  function finalizeDwell() {
    const t = now();
    for (const [k, start] of visibleSince.entries()) {
      const p = posts.get(k);
      if (p) p.dwellMs += Math.max(0, t - start);
    }
    visibleSince.clear();
  }

  async function pushUpdate(finalize = false) {
    computeActive();

    // Get top posts by dwell time (will be analyzed by AI)
    // Limit to 10 for vision models to prevent VRAM exhaustion
    const MAX_POSTS = finalize ? 10 : 50; // Only convert 10 images, but send 50 posts for text analysis
    const topPosts = Array.from(posts.entries())
      .sort((a, b) => b[1].dwellMs - a[1].dwellMs)
      .slice(0, MAX_POSTS);

    // Convert images to base64 ONLY when finalizing (end of session)
    // This avoids expensive conversions during regular tracking
    let postsData;
    if (finalize) {
      console.log('[MindfulFeed] Finalizing session - converting images to base64...');
      postsData = await Promise.all(
        topPosts.map(async ([key, p]) => {
          // Find the article element for this post to get the image
          const articles = Array.from(document.querySelectorAll("article"));
          let imageBase64 = null;

          for (const article of articles) {
            const link = getPostLink(article);
            if (link && normalizeKey(link.href) === key) {
              imageBase64 = extractImageBase64(article);
              break;
            }
          }

          return {
            key,
            href: p.href,
            caption: p.caption,
            imageUrl: p.imageUrl,
            imageBase64: imageBase64,  // Base64 data for vision models!
            firstSeenAt: p.firstSeenAt,
            dwellMs: p.dwellMs
          };
        })
      );
      const successCount = postsData.filter(p => p.imageBase64).length;
      console.log(`[MindfulFeed] Converted ${successCount}/${postsData.length} images to base64`);
    } else {
      // Regular updates during tracking - no base64 conversion
      postsData = topPosts.map(([key, p]) => ({
        key,
        href: p.href,
        caption: p.caption,
        imageUrl: p.imageUrl,
        firstSeenAt: p.firstSeenAt,
        dwellMs: p.dwellMs
      }));
    }

    // Send a compact snapshot
    const snapshot = {
      sessionId,
      startedAt,
      finalize,
      activeKey,
      pageUrl: location.href,
      posts: postsData
    };

    safeSend({ type: "MFF_RAW_UPDATE", payload: snapshot });
  }

  function startTracking({ newSessionId, newStartedAt }) {
    if (tracking) return;
    tracking = true;
    sessionId = newSessionId;
    startedAt = newStartedAt;

    // Clear console logs for fresh start
    console.clear();
    console.log('[MindfulFeed] ===== NEW SESSION STARTED =====');
    console.log('[MindfulFeed] Session ID:', sessionId);

    // reset local structures
    posts.clear();
    ratios.clear();
    visibleSince.clear();
    activeKey = null;
    observing = new WeakSet();

    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const article = e.target;
          const key = ensurePost(article);
          if (!key) continue;
          ratios.set(key, e.intersectionRatio || 0);
        }
      },
      {
        root: null,
        threshold: [0, 0.05, 0.15, 0.3, 0.6, 0.75, 0.9, 1]
      }
    );

    observeArticles();

    mo = new MutationObserver(() => {
      // feed is infinite; keep observing new posts
      observeArticles();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    tickTimer = setInterval(tick, TICK_MS);
    pushTimer = setInterval(() => pushUpdate(false), PUSH_MS);

    // immediate push so background knows session started
    pushUpdate(false);
  }

  async function stopTracking() {
    if (!tracking) return;
    tracking = false;

    finalizeDwell();
    await pushUpdate(true);  // Wait for image conversion to complete

    if (tickTimer) clearInterval(tickTimer);
    if (pushTimer) clearInterval(pushTimer);
    tickTimer = null;
    pushTimer = null;

    if (io) io.disconnect();
    if (mo) mo.disconnect();
    io = null;
    mo = null;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "MFF_CONTROL") return;

    if (msg.action === "START") {
      startTracking({ newSessionId: msg.sessionId, newStartedAt: msg.startedAt });
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "STOP") {
      stopTracking();
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unknown action" });
  });

  // Optional: if the page loads while tracking already active,
  // background can re-signal. (We don't auto-start without explicit message.)
})();
