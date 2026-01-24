// MindfulFeed foreground (content script) for YouTube
// Tracks video watch time, recommendations clicked, and content consumption

(() => {
  // Prevent multiple instances of the content script
  if (window.__MINDFUL_FEED_YOUTUBE_LOADED__) {
    console.log('[MindfulFeed YouTube] Content script already loaded, skipping duplicate injection');
    return;
  }
  window.__MINDFUL_FEED_YOUTUBE_LOADED__ = true;

  const VISIBILITY_THRESHOLD = 0.7;     // count when video player >= 70% visible
  const ACTIVE_CHECK_MS = 1000;         // check video playback state every 1s
  const PUSH_MS = 3000;                 // send updates to background every 3s

  let tracking = false;
  let sessionId = null;
  let startedAt = 0;

  /** @type {Map<string, {title: string, channel: string, videoId: string, description: string, thumbnail: string, transcript: string, firstSeenAt: number, watchMs: number, isAd: boolean}>} */
  const videos = new Map();

  /** @type {string|null} Current video being watched */
  let currentVideoId = null;
  let previousVideoId = null; // Track previous video to validate title changes
  let lastCheckTime = 0;
  let currentVideoVisible = false;

  let activeCheckTimer = null;
  let pushTimer = null;
  let visibilityObserver = null;

  function now() {
    return Date.now();
  }

  function safeSend(msg) {
    try {
      chrome.runtime.sendMessage(msg, () => {
        void chrome.runtime.lastError;
      });
    } catch (_) {}
  }

  /**
   * Extract video ID from YouTube URL
   */
  function getVideoIdFromUrl(url = location.href) {
    try {
      const urlObj = new URL(url);
      // Watch page: /watch?v=VIDEO_ID
      if (urlObj.pathname === '/watch') {
        return urlObj.searchParams.get('v');
      }
      // Shorts: /shorts/VIDEO_ID
      if (urlObj.pathname.startsWith('/shorts/')) {
        return urlObj.pathname.split('/')[2];
      }
    } catch (_) {}
    return null;
  }

  /**
   * Get video metadata including description, thumbnail, and transcript
   */
  function getVideoMetadata() {
    const videoId = getVideoIdFromUrl();
    if (!videoId) return null;

    // Title (multiple selectors for robustness)
    let title = '';
    const titleEl = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string') ||
                    document.querySelector('h1.title yt-formatted-string') ||
                    document.querySelector('#title h1');
    if (titleEl) {
      title = titleEl.textContent?.trim() || '';
    }

    // Channel name
    let channel = '';
    const channelEl = document.querySelector('ytd-channel-name a') ||
                      document.querySelector('#channel-name a') ||
                      document.querySelector('#upload-info a');
    if (channelEl) {
      channel = channelEl.textContent?.trim() || '';
    }

    // Video description
    let description = '';
    const descriptionEl = document.querySelector('ytd-text-inline-expander#description yt-attributed-string span') ||
                         document.querySelector('#description yt-formatted-string') ||
                         document.querySelector('#description-inline-expander yt-formatted-string');
    if (descriptionEl) {
      description = descriptionEl.textContent?.trim() || '';
    }

    // Video thumbnail (high quality)
    // Always use constructed URL from videoId for reliability in SPA navigation
    const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : '';

    // Check if it's an ad - only check within the player/video area
    // Look for ad indicators specifically in the video player
    const player = document.querySelector('#movie_player');
    const isAd = player ? (
      player.classList.contains('ad-showing') ||
      player.classList.contains('ad-interrupting') ||
      player.querySelector('.ytp-ad-player-overlay') !== null ||
      player.querySelector('.ytp-ad-text') !== null ||
      document.querySelector('.ytp-ad-skip-button-modern') !== null
    ) : false;

    return { videoId, title, channel, description, thumbnail, isAd };
  }

  /**
   * Extract video transcript/captions (asynchronous)
   * Returns a promise that resolves to transcript text or empty string
   */
  async function extractTranscript(videoId) {
    try {
      // Check if transcript button exists
      const transcriptButton = document.querySelector('button[aria-label*="transcript" i], button[aria-label*="Show transcript" i]');

      if (!transcriptButton) {
        console.log('[MindfulFeed YouTube] No transcript available for video:', videoId);
        return '';
      }

      // Open transcript panel if not already open
      const transcriptPanel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
      if (!transcriptPanel || transcriptPanel.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN') {
        transcriptButton.click();
        // Wait for panel to open
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Extract transcript segments
      const segments = document.querySelectorAll('ytd-transcript-segment-renderer');
      if (!segments || segments.length === 0) {
        console.log('[MindfulFeed YouTube] Transcript panel opened but no segments found');
        return '';
      }

      // Combine all text segments
      const transcriptText = Array.from(segments)
        .map(seg => {
          const textEl = seg.querySelector('yt-formatted-string.segment-text');
          return textEl ? textEl.textContent?.trim() : '';
        })
        .filter(text => text.length > 0)
        .join(' ');

      console.log(`[MindfulFeed YouTube] Extracted transcript (${transcriptText.length} chars) for video:`, videoId);
      return transcriptText;

    } catch (error) {
      console.error('[MindfulFeed YouTube] Error extracting transcript:', error);
      return '';
    }
  }

  /**
   * Get video player element
   */
  function getVideoPlayer() {
    // Try multiple selectors for better reliability
    return document.querySelector('video.html5-main-video') ||
           document.querySelector('video.video-stream') ||
           document.querySelector('video') ||
           document.querySelector('#movie_player video');
  }

  /**
   * Check if video is currently playing
   */
  function isVideoPlaying() {
    const player = getVideoPlayer();
    if (!player) return false;
    return !player.paused && !player.ended && player.readyState > 2;
  }

  /**
   * Ensure video entry exists in tracking map
   */
  function ensureVideo(metadata) {
    if (!metadata || !metadata.videoId) return null;

    const key = metadata.videoId;
    if (!videos.has(key)) {
      console.log('[MindfulFeed YouTube] New video tracked:', {
        videoId: metadata.videoId,
        title: metadata.title,
        channel: metadata.channel,
        isAd: metadata.isAd
      });

      if (metadata.isAd) {
        console.log('[MindfulFeed YouTube] ⚠️ Video marked as ad - will be filtered from analytics');
      }

      videos.set(key, {
        videoId: metadata.videoId,
        title: metadata.title,
        channel: metadata.channel,
        description: metadata.description || '',
        thumbnail: metadata.thumbnail || '',
        transcript: '', // Will be extracted asynchronously
        isAd: metadata.isAd,
        firstSeenAt: now(),
        watchMs: 0
      });

      // Extract transcript asynchronously (don't block)
      if (metadata.videoId && !metadata.isAd) {
        extractTranscript(metadata.videoId).then(transcript => {
          const video = videos.get(key);
          if (video) {
            video.transcript = transcript;
            console.log(`[MindfulFeed YouTube] Transcript stored for ${key}:`, transcript.substring(0, 100) + '...');
          }
        }).catch(err => {
          console.error('[MindfulFeed YouTube] Failed to extract transcript:', err);
        });
      }
    } else {
      // Update metadata if it was incomplete before OR if new metadata is better
      const v = videos.get(key);
      if (v) {
        const shouldUpdate = !v.title || v.title.length < 5 ||
                            (metadata.title && metadata.title.length > v.title.length);

        if (shouldUpdate && metadata.title && metadata.title.length > 5) {
          // Validate: don't update with a title from a different video
          const isDifferentFromPrevious = !previousVideoId ||
                                         !videos.get(previousVideoId)?.title ||
                                         metadata.title !== videos.get(previousVideoId).title;

          if (isDifferentFromPrevious) {
            console.log(`[MindfulFeed YouTube] Updating metadata for ${key}`, {
              oldTitle: v.title,
              newTitle: metadata.title
            });

            v.title = metadata.title;
            v.channel = metadata.channel || v.channel;
            v.description = metadata.description || v.description;
            v.thumbnail = metadata.thumbnail || v.thumbnail;

            console.log(`[MindfulFeed YouTube] ✓ Metadata updated: "${v.title}"`);
          } else {
            console.log(`[MindfulFeed YouTube] ⚠️ Rejecting stale title (matches previous video)`);
          }
        }
      }
    }
    return key;
  }

  /**
   * Setup visibility observer for video player
   */
  function setupVisibilityObserver() {
    const player = getVideoPlayer();
    if (!player) {
      console.warn('[MindfulFeed YouTube] Video player not found, assuming visible');
      // Assume visible if we can't find the player (failsafe to allow tracking)
      currentVideoVisible = true;
      return;
    }

    if (visibilityObserver) {
      visibilityObserver.disconnect();
    }

    visibilityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const wasVisible = currentVideoVisible;
          currentVideoVisible = entry.intersectionRatio >= VISIBILITY_THRESHOLD;
          if (!wasVisible && currentVideoVisible) {
            console.log('[MindfulFeed YouTube] Video player became visible');
          }
        }
      },
      {
        root: null,
        threshold: [0, 0.25, 0.5, 0.7, 1]
      }
    );

    visibilityObserver.observe(player);
    console.log('[MindfulFeed YouTube] Visibility observer set up for player');
  }

  /**
   * Active check - accumulate watch time for currently playing video
   */
  function activeCheck() {
    const t = now();

    // Get current video metadata
    const metadata = getVideoMetadata();
    if (!metadata || !metadata.videoId) {
      currentVideoId = null;
      return;
    }

    // Check if video changed
    if (currentVideoId !== metadata.videoId) {
      console.log('[MindfulFeed YouTube] Video changed to:', metadata.videoId, metadata.title);

      // Store previous video ID to validate title changes
      previousVideoId = currentVideoId;
      currentVideoId = metadata.videoId;

      // Get the previous video's title for validation
      const previousTitle = previousVideoId ? videos.get(previousVideoId)?.title : null;

      // Multi-step metadata extraction with validation
      // Try multiple times with increasing delays to ensure DOM is updated
      let attempt = 0;
      const maxAttempts = 3;
      const attemptDelays = [800, 1500, 2500]; // Progressive delays

      const tryExtractMetadata = () => {
        const freshMetadata = getVideoMetadata();

        if (!freshMetadata || freshMetadata.videoId !== currentVideoId) {
          return; // Video changed again, abort
        }

        // Validate: title should be different from previous video's title
        const titleChanged = !previousTitle || freshMetadata.title !== previousTitle;
        const hasValidTitle = freshMetadata.title && freshMetadata.title.length > 5;

        if (hasValidTitle && titleChanged) {
          ensureVideo(freshMetadata);
          console.log('[MindfulFeed YouTube] ✓ Fresh metadata captured (attempt ' + (attempt + 1) + '):', {
            videoId: freshMetadata.videoId,
            title: freshMetadata.title,
            titleChanged: titleChanged
          });
        } else {
          // Title hasn't changed yet or is invalid - retry if we have attempts left
          attempt++;
          if (attempt < maxAttempts) {
            console.log('[MindfulFeed YouTube] ⚠️ Title not ready (attempt ' + attempt + '), retrying...', {
              hasValidTitle,
              titleChanged,
              currentTitle: freshMetadata.title,
              previousTitle: previousTitle
            });
            setTimeout(tryExtractMetadata, attemptDelays[attempt]);
          } else {
            // Last attempt - accept whatever we have
            console.log('[MindfulFeed YouTube] ⚠️ Using metadata after max attempts:', freshMetadata.title);
            ensureVideo(freshMetadata);
          }
        }
      };

      // Start first attempt after initial delay
      setTimeout(tryExtractMetadata, attemptDelays[0]);

      setupVisibilityObserver();
      lastCheckTime = t;
      return;
    }

    // Accumulate watch time if video is playing and visible
    const playing = isVideoPlaying();
    const visible = currentVideoVisible;

    if (playing && visible && lastCheckTime > 0) {
      const elapsed = t - lastCheckTime;
      const video = videos.get(currentVideoId);
      if (video && !video.isAd) { // Don't count ad watch time
        video.watchMs += elapsed;
        if (video.watchMs % 5000 < 1000) { // Log every ~5 seconds
          console.log(`[MindfulFeed YouTube] Accumulating watch time for ${video.videoId}: ${Math.round(video.watchMs / 1000)}s`);
        }

        // Retry metadata extraction if title is missing or might be stale (every ~10 seconds while playing)
        // Only retry in the first 30 seconds of watching
        if (video.watchMs < 30000 && video.watchMs % 10000 < 1000) {
          const previousTitle = previousVideoId ? videos.get(previousVideoId)?.title : null;
          const mightBeStale = previousTitle && video.title === previousTitle;

          if (!video.title || video.title.length < 5 || mightBeStale) {
            console.log(`[MindfulFeed YouTube] Retrying metadata extraction:`, {
              reason: !video.title ? 'missing' : video.title.length < 5 ? 'too short' : 'might be stale',
              currentTitle: video.title,
              previousTitle: previousTitle
            });
            ensureVideo(metadata);
          }
        }
      }
    }

    lastCheckTime = t;
  }

  /**
   * Send update to background service worker
   */
  function pushUpdate(finalize = false) {
    const allVideos = Array.from(videos.entries());
    const nonAdVideos = allVideos.filter(([_, v]) => !v.isAd);

    const snapshot = {
      sessionId,
      startedAt,
      finalize,
      currentVideoId,
      pageUrl: location.href,
      platform: 'youtube',
      videos: nonAdVideos
        .map(([key, v]) => ({
          key,
          videoId: v.videoId,
          title: v.title,
          channel: v.channel,
          description: v.description,
          thumbnail: v.thumbnail,
          transcript: v.transcript,
          firstSeenAt: v.firstSeenAt,
          watchMs: v.watchMs
        }))
        .sort((a, b) => b.watchMs - a.watchMs)
        .slice(0, 40) // Keep top 40 videos
    };

    console.log(`[MindfulFeed YouTube] Pushing update: ${snapshot.videos.length} videos (${allVideos.length} total, ${allVideos.length - nonAdVideos.length} ads filtered), finalize=${finalize}`);
    if (snapshot.videos.length > 0) {
      console.log('[MindfulFeed YouTube] Top video:', {
        videoId: snapshot.videos[0].videoId,
        title: snapshot.videos[0].title,
        watchMs: snapshot.videos[0].watchMs
      });
    } else {
      console.log('[MindfulFeed YouTube] No videos tracked yet. Current video:', currentVideoId, 'Tracking:', tracking);
    }

    safeSend({ type: "MFF_RAW_UPDATE", payload: snapshot });
  }

  /**
   * Start tracking YouTube session
   */
  function startTracking({ newSessionId, newStartedAt }) {
    if (tracking) return;
    tracking = true;
    sessionId = newSessionId;
    startedAt = newStartedAt;

    // Reset tracking state
    videos.clear();
    currentVideoId = null;
    lastCheckTime = now();
    // Assume visible initially to allow immediate tracking
    currentVideoVisible = true;

    // Initialize with current video (with slight delay to ensure DOM is ready)
    setTimeout(() => {
      const metadata = getVideoMetadata();
      if (metadata && metadata.videoId) {
        currentVideoId = metadata.videoId;
        ensureVideo(metadata);
        console.log('[MindfulFeed YouTube] Initial video captured:', {
          videoId: metadata.videoId,
          title: metadata.title
        });
      }
    }, 300); // Small delay to ensure DOM is ready

    // Setup visibility tracking (this will update currentVideoVisible)
    setupVisibilityObserver();

    // Start timers
    activeCheckTimer = setInterval(activeCheck, ACTIVE_CHECK_MS);
    pushTimer = setInterval(() => pushUpdate(false), PUSH_MS);

    // Listen for URL changes (SPA navigation)
    setupNavigationListener();

    // Initial push
    pushUpdate(false);

    console.log('[MindfulFeed YouTube] Tracking started');
  }

  /**
   * Stop tracking YouTube session
   */
  function stopTracking() {
    if (!tracking) return;
    tracking = false;

    // Final accumulation
    activeCheck();

    // Send final snapshot
    pushUpdate(true);

    // Clear timers
    if (activeCheckTimer) clearInterval(activeCheckTimer);
    if (pushTimer) clearInterval(pushTimer);
    activeCheckTimer = null;
    pushTimer = null;

    // Disconnect observer
    if (visibilityObserver) {
      visibilityObserver.disconnect();
      visibilityObserver = null;
    }

    console.log('[MindfulFeed YouTube] Tracking stopped');
  }

  /**
   * Setup listener for YouTube SPA navigation
   */
  function setupNavigationListener() {
    // YouTube is a SPA - URL changes without page reload
    let lastUrl = location.href;

    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        console.log('[MindfulFeed YouTube] Navigation detected:', lastUrl, '->', location.href);
        lastUrl = location.href;

        // Don't extract metadata here - let activeCheck handle it with proper delay
        // This prevents race conditions where we capture old video's title with new video's ID
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // Message listener for control commands
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

  console.log('[MindfulFeed YouTube] Content script loaded');
})();
