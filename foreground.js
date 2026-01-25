// MindfulFeed foreground (content script) for Instagram Home Feed
// Tracks which feed post is visible and for how long (dwell time).
// Sends periodic updates to the MV3 service worker.

(() => {
  // Exit if extension context is invalidated (after extension reload)
  if (!chrome || !chrome.runtime || !chrome.runtime.id) {
    console.log('[MindfulFeed] Extension context invalidated, content script exiting');
    return;
  }

  const VISIBILITY_THRESHOLD = 0.6;     // count dwell when >= 60% visible
  const ACTIVE_MIN_RATIO = 0.15;       // candidate for "active" post
  const TICK_MS = 250;                 // internal timing tick
  const PUSH_MS = 2000;                // send updates to background
  const ANALYZE_MS = 10000;            // analyze posts every 10 seconds

  let tracking = false;
  let sessionId = null;
  let startedAt = 0;

  /** @type {Map<string, {href: string, caption: string, imageUrl: string, firstSeenAt: number, dwellMs: number}>} */
  const posts = new Map();
  /** @type {Map<string, number>} */
  const ratios = new Map();
  /** @type {Map<string, number>} */
  const visibleSince = new Map();
  /** @type {Set<string>} */
  const analyzedPosts = new Set();     // Track which posts have been analyzed

  let activeKey = null;
  let io = null;
  let mo = null;
  let tickTimer = null;
  let pushTimer = null;
  let analyzeTimer = null;             // Timer for incremental analysis
  let observing = new WeakSet();

  function now() {
    return Date.now();
  }

  function safeSend(msg) {
    try {
      // Check if extension context is still valid
      if (!chrome || !chrome.runtime || !chrome.runtime.id) {
        console.warn('[MindfulFeed] Cannot send message: extension context invalidated');
        return;
      }
      chrome.runtime.sendMessage(msg, () => {
        // ignore response; avoid spamming errors
        void chrome.runtime.lastError;
      });
    } catch (err) {
      console.warn('[MindfulFeed] Error sending message:', err.message);
    }
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

  /**
   * Extract optimal image size for vision model analysis
   * Takes medium-resolution image (640w) from srcset instead of highest quality
   * @param {HTMLElement} article - Instagram post article element
   * @returns {HTMLImageElement|null} Image element or null if not found
   */
  function extractOptimalImageElement(article) {
    const img = article.querySelector('img[srcset]') || article.querySelector('img[src]');
    if (!img) return null;

    const srcset = img.getAttribute('srcset');
    if (srcset) {
      // srcset format: "url1 width1, url2 width2, ..."
      // Parse into array of {url, width}
      const sources = srcset.split(',').map(s => {
        const parts = s.trim().split(' ');
        return {
          url: parts[0],
          width: parts[1] ? parseInt(parts[1]) : 0
        };
      });

      // Find image closest to 640px (ideal for vision models)
      // Prefer slightly larger over smaller for quality
      const TARGET_WIDTH = 640;
      let best = sources[0];
      let bestDiff = Math.abs(best.width - TARGET_WIDTH);

      for (const source of sources) {
        const diff = Math.abs(source.width - TARGET_WIDTH);
        // Prefer this source if it's closer to target, or same distance but larger
        if (diff < bestDiff || (diff === bestDiff && source.width > best.width)) {
          best = source;
          bestDiff = diff;
        }
      }

      // Create a temporary image element with the optimal size
      const optimalImg = new Image();
      optimalImg.src = best.url;
      return optimalImg;
    }

    return img;
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
   * Uses Instagram's optimal-sized image (640w) to avoid unnecessary resizing
   * @param {HTMLImageElement} img - Image element from DOM
   * @returns {Promise<string|null>} Base64 data URI or null if failed
   */
  async function convertImageToBase64(img) {
    return new Promise((resolve) => {
      try {
        // Wait for image to load if it's not ready
        if (!img.complete) {
          img.onload = () => processImage(img, resolve);
          img.onerror = () => {
            console.error('[MindfulFeed] Image failed to load');
            resolve(null);
          };
          // Timeout after 3 seconds
          setTimeout(() => resolve(null), 3000);
        } else {
          processImage(img, resolve);
        }
      } catch (error) {
        console.error('[MindfulFeed] Error converting image to base64:', error);
        resolve(null);
      }
    });
  }

  function processImage(img, resolve) {
    try {
      const MAX_SIZE = 640;
      let width = img.naturalWidth || img.width || 640;
      let height = img.naturalHeight || img.height || 640;

      // Only resize if larger than 640px (Instagram 640w images shouldn't need resizing)
      if (width > MAX_SIZE || height > MAX_SIZE) {
        const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // 60% quality for good balance between size and visual quality
      const base64 = canvas.toDataURL('image/jpeg', 0.6);
      resolve(base64);
    } catch (error) {
      console.error('[MindfulFeed] Error processing image:', error);
      resolve(null);
    }
  }

  /**
   * Extract optimal-sized image and convert to base64
   * Uses Instagram's 640w image from srcset for efficiency
   * @param {HTMLElement} article - Instagram post article element
   * @returns {Promise<string|null>} Base64 data URI or null if failed
   */
  async function extractImageBase64(article) {
    try {
      // Get optimal-sized image (640w from srcset)
      const img = extractOptimalImageElement(article);
      if (!img) return null;

      return await convertImageToBase64(img);
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

    // IMPORTANT: Only analyze posts the user actually SAW (meaningful dwell time)
    // Filter out posts that were just loaded in DOM but not viewed
    const MIN_DWELL_MS = 2000; // 2 seconds minimum - user must have actually seen the post

    const viewedPosts = Array.from(posts.entries())
      .filter(([key, p]) => p.dwellMs >= MIN_DWELL_MS) // Only posts actually viewed
      .sort((a, b) => b[1].dwellMs - a[1].dwellMs);

    console.log(`[MindfulFeed] Total posts in DOM: ${posts.size}, Actually viewed (>2s): ${viewedPosts.length}`);

    // Get top posts by dwell time (will be analyzed by AI)
    // Limit to 10 for vision models to prevent VRAM exhaustion
    const MAX_POSTS = finalize ? 10 : 50;
    const topPosts = viewedPosts.slice(0, Math.min(viewedPosts.length, MAX_POSTS));

    if (topPosts.length === 0) {
      console.log('[MindfulFeed] No posts with meaningful dwell time yet');
      // Send empty snapshot
      safeSend({
        type: "MFF_RAW_UPDATE",
        payload: {
          sessionId,
          startedAt,
          finalize,
          activeKey,
          pageUrl: location.href,
          posts: []
        }
      });
      return;
    }

    // Convert images to base64 ONLY when finalizing (end of session)
    // This avoids expensive conversions during regular tracking
    let postsData;
    if (finalize) {
      console.log(`[MindfulFeed] Finalizing session - analyzing ${topPosts.length} viewed posts...`);
      console.log('[MindfulFeed] Converting images to base64...');
      postsData = await Promise.all(
        topPosts.map(async ([key, p]) => {
          // Find the article element for this post to get the image
          const articles = Array.from(document.querySelectorAll("article"));
          let imageBase64 = null;

          for (const article of articles) {
            const link = getPostLink(article);
            if (link && normalizeKey(link.href) === key) {
              imageBase64 = await extractImageBase64(article);
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

  /**
   * Incremental analysis - analyze new posts while user scrolls
   * Runs every 10 seconds to analyze posts that haven't been analyzed yet
   */
  async function analyzeNewPosts() {
    if (!tracking) return;

    const MIN_DWELL_MS = 2000; // Only analyze posts user actually viewed

    // Find posts that haven't been analyzed yet but have meaningful dwell time
    const newPosts = Array.from(posts.entries())
      .filter(([key, p]) => p.dwellMs >= MIN_DWELL_MS && !analyzedPosts.has(key))
      .sort((a, b) => b[1].dwellMs - a[1].dwellMs)
      .slice(0, 5); // Analyze 5 posts at a time

    if (newPosts.length === 0) {
      console.log('[MindfulFeed] No new posts to analyze');
      return;
    }

    console.log(`[MindfulFeed] Analyzing ${newPosts.length} new posts incrementally...`);

    // Convert images for these posts
    const postsWithImages = await Promise.all(
      newPosts.map(async ([key, p]) => {
        const articles = Array.from(document.querySelectorAll("article"));
        let imageBase64 = null;

        for (const article of articles) {
          const link = getPostLink(article);
          if (link && normalizeKey(link.href) === key) {
            imageBase64 = await extractImageBase64(article);
            break;
          }
        }

        // Mark as analyzed
        analyzedPosts.add(key);

        return {
          key,
          href: p.href,
          caption: p.caption,
          imageUrl: p.imageUrl,
          imageBase64: imageBase64,
          firstSeenAt: p.firstSeenAt,
          dwellMs: p.dwellMs
        };
      })
    );

    const successCount = postsWithImages.filter(p => p.imageBase64).length;
    console.log(`[MindfulFeed] Incremental: Converted ${successCount}/${postsWithImages.length} images`);

    // Send for incremental analysis
    safeSend({
      type: "MFF_INCREMENTAL_ANALYSIS",
      payload: {
        sessionId,
        posts: postsWithImages,
        isIncremental: true
      }
    });
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
    analyzedPosts.clear();       // Clear analyzed posts for new session
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
    analyzeTimer = setInterval(() => analyzeNewPosts(), ANALYZE_MS); // Analyze every 10s

    // immediate push so background knows session started
    pushUpdate(false);

    console.log('[MindfulFeed] Incremental analysis enabled - analyzing posts every 10 seconds');
  }

  async function stopTracking() {
    if (!tracking) return;
    tracking = false;

    finalizeDwell();
    await pushUpdate(true);  // Wait for image conversion to complete

    if (tickTimer) clearInterval(tickTimer);
    if (pushTimer) clearInterval(pushTimer);
    if (analyzeTimer) clearInterval(analyzeTimer);
    tickTimer = null;
    pushTimer = null;
    analyzeTimer = null;

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
