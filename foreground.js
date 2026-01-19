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

  function pushUpdate(finalize = false) {
    computeActive();

    // Send a compact snapshot (no huge payloads)
    const snapshot = {
      sessionId,
      startedAt,
      finalize,
      activeKey,
      pageUrl: location.href,
      posts: Array.from(posts.entries())
        .map(([key, p]) => ({
          key,
          href: p.href,
          caption: p.caption,
          imageUrl: p.imageUrl,  // Include image URL for vision models!
          firstSeenAt: p.firstSeenAt,
          dwellMs: p.dwellMs
        }))
        // keep only most relevant (top dwell)
        .sort((a, b) => b.dwellMs - a.dwellMs)
        .slice(0, 40)
    };

    safeSend({ type: "MFF_RAW_UPDATE", payload: snapshot });
  }

  function startTracking({ newSessionId, newStartedAt }) {
    if (tracking) return;
    tracking = true;
    sessionId = newSessionId;
    startedAt = newStartedAt;

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

  function stopTracking() {
    if (!tracking) return;
    tracking = false;

    finalizeDwell();
    pushUpdate(true);

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
