// MindfulFeed MV3 service worker
// - Persistent session timer (Start/Stop)
// - Stores daily aggregated analytics used by the Summary dashboard
// - AI-powered content analysis
// - Gamification and leaderboard
// - Reflection and feedback system
// - Multi-tab tracking support (YouTube + Instagram simultaneously)

// Import enhanced modules
importScripts('ai-analysis.js', 'gamification.js', 'reflection-system.js');

const STATE_KEY = "mf_timer_state";
const DAILY_KEY = "mf_daily_stats";
const LAST_SESSION_KEY = "mf_last_session";
const RAW_SESSION_KEY = "mf_raw_session"; // dwell/caption snapshot from content script
const SESSION_META_KEY = "mf_session_meta"; // { sessionId, trackedTabs: [...], acceptFinalizeUntil }
const SESSION_COUNT_KEY = "mf_daily_session_count"; // Track session count per day
const SESSION_HISTORY_KEY = "mf_session_history"; // Array of recent sessions (keep last 20)
const INCREMENTAL_ANALYSIS_KEY = "mf_incremental_analysis"; // Store incremental analysis results
const PROCESSING_STATUS_KEY = "mf_processing_status"; // Processing status for UI feedback

const defaultState = {
  isTracking: false,
  startedAt: 0,   // epoch ms
  elapsedMs: 0    // accumulated when stopped
};

function getNow() {
  return Date.now();
}

function isoDate(d = new Date()) {
  // YYYY-MM-DD (local time)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeWeights(weights) {
  const sum = weights.reduce((s, w) => s + w, 0) || 1;
  return weights.map((w) => w / sum);
}

function msFromFractions(totalMs, fractions, labels) {
  const out = {};
  // allocate with rounding but preserve sum
  let allocated = 0;
  for (let i = 0; i < labels.length; i++) {
    const isLast = i === labels.length - 1;
    const ms = isLast ? (totalMs - allocated) : Math.round(totalMs * fractions[i]);
    allocated += ms;
    out[labels[i]] = ms;
  }
  return out;
}

function computeElapsed(state) {
  if (!state.isTracking) return state.elapsedMs;
  return state.elapsedMs + (getNow() - state.startedAt);
}

function getState() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STATE_KEY], (res) => {
      resolve({ ...defaultState, ...(res[STATE_KEY] || {}) });
    });
  });
}

function setState(state) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STATE_KEY]: state }, () => resolve());
  });
}

async function getDaily() {
  return new Promise((resolve) => {
    chrome.storage.local.get([DAILY_KEY], (res) => {
      resolve(res[DAILY_KEY] || {});
    });
  });
}

async function setDaily(daily) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [DAILY_KEY]: daily }, () => resolve());
  });
}

async function setLastSession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LAST_SESSION_KEY]: session }, () => resolve());
  });
}

async function getRawSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get([RAW_SESSION_KEY], (r) => resolve(r[RAW_SESSION_KEY] || null));
  });
}

async function setRawSession(raw) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [RAW_SESSION_KEY]: raw }, () => resolve());
  });
}

async function getSessionHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SESSION_HISTORY_KEY], (r) => resolve(r[SESSION_HISTORY_KEY] || []));
  });
}

async function addToSessionHistory(session) {
  const history = await getSessionHistory();

  // Add new session to beginning of array (most recent first)
  history.unshift(session);

  // Keep only last 20 sessions to save storage space
  const trimmed = history.slice(0, 20);

  return new Promise((resolve) => {
    chrome.storage.local.set({ [SESSION_HISTORY_KEY]: trimmed }, () => resolve());
  });
}

async function getIncrementalAnalysis() {
  return new Promise((resolve) => {
    chrome.storage.local.get([INCREMENTAL_ANALYSIS_KEY], (r) => resolve(r[INCREMENTAL_ANALYSIS_KEY] || { analyzedPosts: [], results: null }));
  });
}

async function getProcessingStatus() {
  return new Promise((resolve) => {
    chrome.storage.local.get([PROCESSING_STATUS_KEY], (r) => resolve(r[PROCESSING_STATUS_KEY] || null));
  });
}

async function setProcessingStatus(status) {
  console.log('[MindfulFeed] Processing status:', status);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [PROCESSING_STATUS_KEY]: status }, () => resolve());
  });
}

async function setIncrementalAnalysis(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [INCREMENTAL_ANALYSIS_KEY]: data }, () => resolve());
  });
}

async function clearIncrementalAnalysis() {
  return new Promise((resolve) => {
    chrome.storage.local.remove([INCREMENTAL_ANALYSIS_KEY], () => resolve());
  });
}

/**
 * Merge two analysis results by combining their metrics
 */
function mergeAnalysisResults(result1, result2) {
  const totalDwell1 = result1.totalDwellMs || 0;
  const totalDwell2 = result2.totalDwellMs || 0;
  const combinedDwell = totalDwell1 + totalDwell2;

  if (combinedDwell === 0) return result1;

  // Weight by dwell time
  const weight1 = totalDwell1 / combinedDwell;
  const weight2 = totalDwell2 / combinedDwell;

  // Merge topics
  const mergedTopics = {};
  for (const topic of Object.keys({...result1.topics, ...result2.topics})) {
    mergedTopics[topic] = (result1.topics[topic] || 0) * weight1 + (result2.topics[topic] || 0) * weight2;
  }

  // Merge emotions
  const mergedEmotions = {};
  for (const emotion of Object.keys({...result1.emotions, ...result2.emotions})) {
    mergedEmotions[emotion] = (result1.emotions[emotion] || 0) * weight1 + (result2.emotions[emotion] || 0) * weight2;
  }

  // Merge engagement
  const mergedEngagement = {};
  for (const eng of Object.keys({...result1.engagement, ...result2.engagement})) {
    mergedEngagement[eng] = (result1.engagement[eng] || 0) * weight1 + (result2.engagement[eng] || 0) * weight2;
  }

  // Merge per-post analysis arrays (IMPORTANT: preserve individual post AI results!)
  const mergedPerPostAnalysis = [
    ...(result1.perPostAnalysis || []),
    ...(result2.perPostAnalysis || [])
  ];

  return {
    topics: mergedTopics,
    emotions: mergedEmotions,
    engagement: mergedEngagement,
    totalDwellMs: combinedDwell,
    postsAnalyzed: (result1.postsAnalyzed || 0) + (result2.postsAnalyzed || 0),
    analysisMethod: 'incremental',
    perPostAnalysis: mergedPerPostAnalysis, // Include individual post analyses
    insights: result1.insights || [] // Keep first insights for now
  };
}

function newSessionId() {
  // small readable id
  return `s_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

async function getActiveInstagramTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const t = (tabs && tabs[0]) || null;
      if (!t || !t.url) return resolve(null);
      try {
        const u = new URL(t.url);
        if (u.hostname === "www.instagram.com" || u.hostname === "instagram.com") {
          resolve({ tab: t, platform: 'instagram' });
          return;
        }
        if (u.hostname === "www.youtube.com" || u.hostname === "youtube.com") {
          resolve({ tab: t, platform: 'youtube' });
          return;
        }
      } catch (_) {}
      resolve(null);
    });
  });
}

async function getSessionMeta() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SESSION_META_KEY], (r) => resolve(r[SESSION_META_KEY] || null));
  });
}

async function setSessionMeta(meta) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SESSION_META_KEY]: meta }, () => resolve());
  });
}

// Multi-tab tracking helper functions
async function addTabToTracking(tabId, platform) {
  const meta = await getSessionMeta();
  if (!meta || !meta.sessionId) {
    console.warn('[MindfulFeed] Cannot add tab: no active session');
    return false;
  }

  // Check if tab is already tracked
  const trackedTabs = meta.trackedTabs || [];
  if (trackedTabs.some(t => t.tabId === tabId)) {
    console.log(`[MindfulFeed] Tab ${tabId} already tracked`);
    return false;
  }

  // Add new tab to tracking
  const newTab = {
    tabId,
    platform,
    addedAt: getNow()
  };
  trackedTabs.push(newTab);

  await setSessionMeta({
    ...meta,
    trackedTabs
  });

  console.log(`[MindfulFeed] ✓ Added ${platform} tab ${tabId} to tracking (${trackedTabs.length} tabs total)`);

  // Initialize platform data in raw session if needed
  const raw = await getRawSession();
  if (raw && !raw.platforms) {
    // Migrate old format to new format
    const platforms = {};
    if (raw.platform === 'youtube' && raw.videos) {
      platforms.youtube = {
        videos: raw.videos,
        firstSeenAt: raw.startedAt,
        pageUrl: raw.pageUrl
      };
    } else if (raw.platform === 'instagram' && raw.posts) {
      platforms.instagram = {
        posts: raw.posts,
        firstSeenAt: raw.startedAt,
        pageUrl: raw.pageUrl
      };
    }
    await setRawSession({
      sessionId: raw.sessionId,
      startedAt: raw.startedAt,
      platforms
    });
  } else if (raw && raw.platforms && !raw.platforms[platform]) {
    // Add new platform to existing multi-platform structure
    raw.platforms[platform] = {
      [platform === 'youtube' ? 'videos' : 'posts']: [],
      firstSeenAt: getNow(),
      pageUrl: null
    };
    await setRawSession(raw);
  }

  // Send START signal to the new tab
  await signalContentToTab(tabId, "START", {
    sessionId: meta.sessionId,
    startedAt: getNow()
  });

  return true;
}

function isTabTracked(tabId, meta) {
  if (!meta || !meta.trackedTabs) return false;
  return meta.trackedTabs.some(t => t.tabId === tabId);
}

async function getSessionCounts() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SESSION_COUNT_KEY], (r) => resolve(r[SESSION_COUNT_KEY] || {}));
  });
}

async function setSessionCounts(counts) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SESSION_COUNT_KEY]: counts }, () => resolve());
  });
}

// Tab activation listener for automatic multi-tab tracking
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    // Check if we're currently tracking - CRITICAL: exit early if not tracking
    const state = await getState();
    if (!state.isTracking) return;

    // Get the activated tab details
    const tab = await chrome.tabs.get(activeInfo.tabId).catch(() => null);
    if (!tab || !tab.url) return;

    // Check if it's Instagram or YouTube
    let platform = null;
    try {
      const u = new URL(tab.url);
      if (u.hostname === "www.instagram.com" || u.hostname === "instagram.com") {
        platform = 'instagram';
      } else if (u.hostname === "www.youtube.com" || u.hostname === "youtube.com") {
        platform = 'youtube';
      }
    } catch (_) {
      return;
    }

    if (!platform) return;

    // Check if this tab is already tracked
    const meta = await getSessionMeta();
    if (!meta || !meta.sessionId) return; // No active session

    if (isTabTracked(activeInfo.tabId, meta)) {
      console.log(`[MindfulFeed] User switched to already-tracked ${platform} tab ${activeInfo.tabId}`);
      return;
    }

    // Add this tab to tracking
    console.log(`[MindfulFeed] User switched to new ${platform} tab ${activeInfo.tabId}, adding to tracking...`);
    await addTabToTracking(activeInfo.tabId, platform);
  } catch (error) {
    console.error('[MindfulFeed] Error in tab activation handler:', error);
  }
});

async function ensureInjected(tabId) {
  // If the tab existed before the extension was loaded, declared content_scripts won't be injected.
  // Force-inject appropriate script based on tab URL (safe to call multiple times).
  try {
    // Get tab info to determine which script to inject
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) return;

    const url = new URL(tab.url);
    if (url.hostname === "www.youtube.com" || url.hostname === "youtube.com") {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["foreground-youtube.js"] });
    } else if (url.hostname === "www.instagram.com" || url.hostname === "instagram.com") {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["foreground.js"] });
    }
  } catch (_) {
    // ignore (e.g., tab not accessible)
  }
}

async function signalContentToTab(tabId, action, payload = {}) {
  if (!tabId) return;
  await ensureInjected(tabId);
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "MFF_CONTROL", action, ...payload }, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

async function signalContent(action, payload = {}) {
  // Backwards-compatible helper: signal the *active* IG tab.
  const tab = await getActiveInstagramTab();
  if (!tab || !tab.id) return;
  await signalContentToTab(tab.id, action, payload);
}

// Keep old demo function for fallback
function generateSessionBreakdownDemo(durationMs, endedAtMs) {
  // Deterministic "demo" breakdown based on date + duration (so it doesn't look random each refresh)
  const seed = (endedAtMs / 1000) | 0 ^ (durationMs | 0);
  const rnd = mulberry32(seed);

  const topics = ["Educational", "Entertainment", "Social", "Informative"];
  const topicW = normalizeWeights([rnd() + 0.2, rnd() + 0.2, rnd() + 0.2, rnd() + 0.2]);
  const topicMs = msFromFractions(durationMs, topicW, topics);

  const emotions = ["Heavy", "Light", "Neutral"]; // order matters for rendering
  const perTopicEmotions = {};

  for (const t of topics) {
    // keep neutral plausible; heavy sometimes higher for informative content
    const biasHeavy = t === "Informative" ? 0.35 : 0.25;
    const w = normalizeWeights([
      rnd() + biasHeavy,
      rnd() + 0.3,
      rnd() + 0.25
    ]);
    perTopicEmotions[t] = msFromFractions(topicMs[t], w, emotions);
  }

  const emotionMs = { Heavy: 0, Light: 0, Neutral: 0 };
  for (const t of topics) {
    for (const e of emotions) emotionMs[e] += perTopicEmotions[t][e];
  }

  return { topicMs, emotionMs, perTopicEmotions };
}

/**
 * Transform YouTube videos to a format compatible with AI analysis
 * Combines title, description, and transcript into a single caption
 */
function transformYouTubeDataForAnalysis(videos) {
  return videos.map(video => {
    // Combine title, description, and transcript into a comprehensive caption
    const parts = [];

    if (video.title) {
      parts.push(`Title: ${video.title}`);
    }

    if (video.description) {
      // Limit description to first 500 chars to avoid overwhelming the AI
      const desc = video.description.length > 500
        ? video.description.substring(0, 500) + '...'
        : video.description;
      parts.push(`Description: ${desc}`);
    }

    if (video.transcript) {
      // Limit transcript to first 1000 chars
      const trans = video.transcript.length > 1000
        ? video.transcript.substring(0, 1000) + '...'
        : video.transcript;
      parts.push(`Transcript: ${trans}`);
    }

    const caption = parts.join('\n\n');

    return {
      key: video.key || video.videoId,
      href: `https://www.youtube.com/watch?v=${video.videoId}`,
      caption: caption,
      dwellMs: video.watchMs,
      // Include thumbnail for potential multimodal analysis
      imageUrl: video.thumbnail,
      // Include original video data for reference
      videoMetadata: {
        videoId: video.videoId,
        title: video.title,
        channel: video.channel,
        description: video.description,
        thumbnail: video.thumbnail
      }
    };
  });
}

// AI-powered analysis with fallback to heuristics
async function generateSessionBreakdown(raw, durationMs, endedAtMs) {
  try {
    // Handle both old single-platform and new multi-platform formats
    let postsToAnalyze = [];

    if (raw?.platforms) {
      // New multi-platform format: merge all platforms' data
      console.log('[MindfulFeed] Multi-platform session detected');

      // Collect Instagram posts
      if (raw.platforms.instagram?.posts) {
        console.log(`[MindfulFeed] Found ${raw.platforms.instagram.posts.length} Instagram posts`);
        postsToAnalyze.push(...raw.platforms.instagram.posts);
      }

      // Collect and transform YouTube videos
      if (raw.platforms.youtube?.videos) {
        console.log(`[MindfulFeed] Found ${raw.platforms.youtube.videos.length} YouTube videos, transforming for analysis`);
        const transformedVideos = transformYouTubeDataForAnalysis(raw.platforms.youtube.videos);
        postsToAnalyze.push(...transformedVideos);
      }

      console.log(`[MindfulFeed] Total items to analyze: ${postsToAnalyze.length}`);
    } else {
      // Old single-platform format
      const platform = raw?.platform || 'instagram';
      if (platform === 'youtube' && raw?.videos) {
        console.log(`[MindfulFeed] YouTube session (old format), transforming ${raw.videos.length} videos for analysis`);
        postsToAnalyze = transformYouTubeDataForAnalysis(raw.videos);
      } else {
        postsToAnalyze = raw?.posts || [];
      }
    }

    // Check if we have incremental analysis results
    const incrementalData = await getIncrementalAnalysis();

    if (incrementalData.results && incrementalData.analyzedPosts.length > 0) {
      const allPosts = postsToAnalyze;
      console.log(`[MindfulFeed] Using incremental analysis results (${incrementalData.analyzedPosts.length} posts analyzed)`);

      // Check if there are any posts that weren't analyzed incrementally
      const analyzedHrefs = new Set(incrementalData.analyzedPosts.map(p => p.href));
      const unanalyzedPosts = allPosts.filter(p => !analyzedHrefs.has(p.href));

      if (unanalyzedPosts.length > 0) {
        console.log(`[MindfulFeed] Found ${unanalyzedPosts.length} unanalyzed posts, analyzing now...`);

        // Analyze the remaining posts
        const remainingAnalysis = await AI_ANALYSIS.analyzePostsBatch(unanalyzedPosts);

        // Merge with incremental results
        const combinedResults = mergeAnalysisResults(incrementalData.results, remainingAnalysis);

        console.log(`[MindfulFeed] Combined analysis complete: ${allPosts.length} total posts`);

        // Convert to legacy format for compatibility (pass actual session duration)
        const breakdown = AI_ANALYSIS.toLegacyFormat(combinedResults, durationMs);

        // Add full analysis for insights
        breakdown.fullAnalysis = combinedResults;

        // Clear incremental data after using it
        await clearIncrementalAnalysis();

        return breakdown;
      }

      // All posts were analyzed incrementally
      console.log(`[MindfulFeed] All posts were analyzed incrementally`);

      // Convert to legacy format for compatibility (pass actual session duration)
      const breakdown = AI_ANALYSIS.toLegacyFormat(incrementalData.results, durationMs);

      // Add full analysis for insights
      breakdown.fullAnalysis = incrementalData.results;

      // Clear incremental data after using it
      await clearIncrementalAnalysis();

      return breakdown;
    }

    // No incremental results - analyze now (fallback for when incremental analysis didn't run)
    if (postsToAnalyze.length === 0) {
      // No posts tracked - use demo data
      console.log('[MindfulFeed] No posts found, using demo breakdown');
      return generateSessionBreakdownDemo(durationMs, endedAtMs);
    }

    console.log(`[MindfulFeed] No incremental results, analyzing ${postsToAnalyze.length} items now...`);

    // Use AI analysis (with heuristic fallback)
    const analysis = await AI_ANALYSIS.analyzePostsBatch(postsToAnalyze);

    // Convert to legacy format for compatibility (pass actual session duration)
    const breakdown = AI_ANALYSIS.toLegacyFormat(analysis, durationMs);

    // Add full analysis for insights
    breakdown.fullAnalysis = analysis;

    return breakdown;
  } catch (error) {
    console.error('[MindfulFeed] Analysis error, using demo:', error);
    return generateSessionBreakdownDemo(durationMs, endedAtMs);
  }
}

async function start() {
  const state = await getState();
  if (state.isTracking) return state;

  const result = await getActiveInstagramTab();
  if (!result) {
    throw new Error("Open Instagram or YouTube and keep it as the active tab, then press Start.");
  }

  const { tab, platform } = result;
  const sid = newSessionId();
  const next = {
    ...state,
    isTracking: true,
    startedAt: getNow(),
    elapsedMs: 0  // Reset timer to 0 for new session
  };

  await setState(next);

  // Increment daily session count
  const todayKey = isoDate(new Date());
  const sessionCounts = await getSessionCounts();
  sessionCounts[todayKey] = (sessionCounts[todayKey] || 0) + 1;
  await setSessionCounts(sessionCounts);

  // Clear only incremental analysis when starting a new session (keep session history)
  console.clear(); // Clear console logs
  console.log('[Service Worker] ===== NEW SESSION STARTED (MULTI-TAB TRACKING ENABLED) =====');
  console.log(`[Service Worker] Initial platform: ${platform} (tab ${tab.id})`);
  console.log('[Service Worker] Switch to other Instagram/YouTube tabs during the session to track them automatically!');
  console.log('[Service Worker] Clearing incremental analysis for fresh start (keeping session history)');
  await chrome.storage.local.remove([INCREMENTAL_ANALYSIS_KEY]);

  // Initialize session metadata with multi-tab structure
  await setSessionMeta({
    sessionId: sid,
    trackedTabs: [
      {
        tabId: tab.id,
        platform,
        addedAt: next.startedAt
      }
    ],
    acceptFinalizeUntil: 0
  });

  // Initialize raw session container with multi-platform structure
  const rawSessionInit = {
    sessionId: sid,
    startedAt: next.startedAt,
    platforms: {
      [platform]: {
        [platform === 'youtube' ? 'videos' : 'posts']: [],
        firstSeenAt: next.startedAt,
        pageUrl: null,
        activeKey: null
      }
    }
  };

  await setRawSession(rawSessionInit);

  await signalContentToTab(tab.id, "START", { sessionId: sid, startedAt: next.startedAt });

  return next;
}

async function stop() {
  const state = await getState();
  if (!state.isTracking) return state;

  const endedAt = getNow();
  const durationMs = computeElapsed(state);

  const next = {
    isTracking: false,
    startedAt: 0,
    elapsedMs: durationMs
  };

  // Mark a short window where we still accept the final raw snapshot even after isTracking becomes false.
  const meta = (await getSessionMeta()) || {};
  const acceptFinalizeUntil = getNow() + 5000;

  // Preserve tracked tabs array in metadata
  await setSessionMeta({
    ...meta,
    acceptFinalizeUntil
  });

  // Store timer state immediately (UI responsiveness)
  await setState(next);

  // Tell ALL tracked tabs to finalize and push last snapshot
  const trackedTabs = meta.trackedTabs || [];
  console.log(`[MindfulFeed] Sending STOP signal to ${trackedTabs.length} tracked tab(s)...`);

  if (trackedTabs.length > 0) {
    // Send STOP to all tracked tabs
    for (const trackedTab of trackedTabs) {
      try {
        await signalContentToTab(trackedTab.tabId, "STOP", {});
        console.log(`[MindfulFeed] ✓ Sent STOP to ${trackedTab.platform} tab ${trackedTab.tabId}`);
      } catch (error) {
        console.warn(`[MindfulFeed] Failed to signal tab ${trackedTab.tabId}:`, error);
      }
    }
  } else {
    // Fallback to old behavior (broadcast STOP)
    await signalContent("STOP", {});
  }

  // Set processing status for UI feedback
  await setProcessingStatus({
    isProcessing: true,
    step: 'Collecting final data...',
    progress: 10,
    startedAt: getNow()
  });

  // Process in background (non-blocking)
  processSessionInBackground(meta, endedAt, durationMs).catch(err => {
    console.error('[MindfulFeed] Background processing error:', err);
    setProcessingStatus({
      isProcessing: false,
      error: err.message,
      completedAt: getNow()
    });
  }).finally(() => {
    // Ensure processing status is cleared even if something goes wrong
    setTimeout(async () => {
      const status = await getProcessingStatus();
      if (status && status.isProcessing && (Date.now() - status.startedAt > 120000)) {
        // If still showing as processing after 2 minutes, force clear
        console.warn('[MindfulFeed] Forcing processing status clear after timeout');
        await setProcessingStatus({
          isProcessing: false,
          step: 'Complete',
          progress: 100,
          completedAt: Date.now()
        });
      }
    }, 120000); // 2 minute timeout
  });

  // Return immediately to unblock UI
  return next;
}

// Background processing function
async function processSessionInBackground(meta, endedAt, durationMs) {
  console.log('[MindfulFeed] Starting background session processing...');

  // Give content scripts a brief moment to send their final snapshots
  await new Promise((r) => setTimeout(r, 500));

  // Update status
  await setProcessingStatus({
    isProcessing: true,
    step: 'Reading session data...',
    progress: 20,
    startedAt: Date.now()
  });

  // Read raw session snapshot (best-effort)
  const raw = await getRawSession();

  // Handle both old format (single platform) and new format (multi-platform)
  let platforms = {};
  let primaryPlatform = 'instagram';

  if (raw?.platforms) {
    // New multi-platform format
    platforms = raw.platforms;
    // Determine primary platform (first one with data, or first tracked)
    const trackedTabs = meta.trackedTabs || [];
    if (trackedTabs.length > 0) {
      primaryPlatform = trackedTabs[0].platform;
    } else {
      // Fallback: first platform with data
      primaryPlatform = Object.keys(platforms)[0] || 'instagram';
    }
  } else if (raw) {
    // Old single-platform format - migrate on the fly
    const oldPlatform = raw.platform || 'instagram';
    primaryPlatform = oldPlatform;
    platforms[oldPlatform] = {
      [oldPlatform === 'youtube' ? 'videos' : 'posts']: oldPlatform === 'youtube' ? raw.videos : raw.posts,
      firstSeenAt: raw.startedAt,
      pageUrl: raw.pageUrl
    };
  }

  // Count total items across all platforms
  let totalItems = 0;
  let platformSummary = [];

  for (const [platform, data] of Object.entries(platforms)) {
    const itemCount = platform === 'youtube'
      ? (data.videos?.length || 0)
      : (data.posts?.length || 0);
    totalItems += itemCount;
    if (itemCount > 0) {
      platformSummary.push(`${itemCount} ${platform === 'youtube' ? 'videos' : 'posts'} (${platform})`);
    }
  }

  const summaryText = platformSummary.length > 0 ? platformSummary.join(', ') : 'no items';
  console.log(`[MindfulFeed] Analyzing ${totalItems} items: ${summaryText}`);
  console.log('[MindfulFeed] Multi-platform session data:', {
    platforms: Object.keys(platforms),
    totalItems,
    primaryPlatform,
    sessionId: raw?.sessionId
  });

  // Update status
  await setProcessingStatus({
    isProcessing: true,
    step: `Analyzing ${totalItems} items with AI...`,
    progress: 30,
    itemCount: totalItems,
    startedAt: Date.now()
  });

  // AI-powered analysis (with fallback)
  const breakdown = await generateSessionBreakdown(raw, durationMs, endedAt);

  console.log('[MindfulFeed] AI analysis complete');

  // Update status
  await setProcessingStatus({
    isProcessing: true,
    step: 'Saving results...',
    progress: 80,
    startedAt: Date.now()
  });

  // Get session count for nudges
  const dayKey = isoDate(new Date(endedAt));
  const sessionCounts = await getSessionCounts();
  const todaySessionCount = sessionCounts[dayKey] || 1;

  // Store session analytics for Summary page
  // For multi-platform sessions, use primary platform (first tracked tab)
  // For single-platform sessions, use that platform
  const actualPlatform = primaryPlatform;

  // List all platforms used in this session
  const platformsUsed = Object.keys(platforms).filter(p => {
    const itemCount = p === 'youtube'
      ? (platforms[p].videos?.length || 0)
      : (platforms[p].posts?.length || 0);
    return itemCount > 0;
  });

  const session = {
    sessionId: meta.sessionId,
    endedAt,
    durationMs,
    platform: actualPlatform,  // Primary platform for display
    platforms: platformsUsed,  // All platforms used (for multi-platform sessions)
    isMultiPlatform: platformsUsed.length > 1,
    topics: breakdown.topicMs,
    emotions: breakdown.emotionMs,
    perTopicEmotions: breakdown.perTopicEmotions,
    insights: breakdown.fullAnalysis?.insights || [],
    fullAnalysis: breakdown.fullAnalysis,  // Include full AI analysis
    raw: raw,
    sessionCount: todaySessionCount
  };

  console.log('[MindfulFeed] Saving session to history:', {
    sessionId: session.sessionId,
    platform: session.platform,
    isMultiPlatform: session.isMultiPlatform,
    platforms: session.platforms,
    durationMs: session.durationMs,
    hasTopics: !!session.topics,
    hasEmotions: !!session.emotions
  });

  await setLastSession(session);

  // Add to session history (keep last 20 sessions)
  await addToSessionHistory(session);
  console.log('[MindfulFeed] Session added to history successfully');

  // Aggregate into daily bucket
  const daily = await getDaily();

  if (!daily[dayKey]) {
    daily[dayKey] = {
      totalMs: 0,
      sessionCount: 0,
      topics: { Educational: 0, Entertainment: 0, Social: 0, Informative: 0 },
      emotions: { Heavy: 0, Light: 0, Neutral: 0 },
      perTopicEmotions: {
        Educational: { Heavy: 0, Light: 0, Neutral: 0 },
        Entertainment: { Heavy: 0, Light: 0, Neutral: 0 },
        Social: { Heavy: 0, Light: 0, Neutral: 0 },
        Informative: { Heavy: 0, Light: 0, Neutral: 0 }
      },
      engagement: { Mindful: 0, Mindless: 0, Engaging: 0 }
    };
  }

  daily[dayKey].totalMs += durationMs;
  daily[dayKey].sessionCount = todaySessionCount;

  for (const k of Object.keys(breakdown.topicMs)) {
    daily[dayKey].topics[k] += breakdown.topicMs[k];
  }
  for (const k of Object.keys(breakdown.emotionMs)) {
    daily[dayKey].emotions[k] += breakdown.emotionMs[k];
  }
  for (const t of Object.keys(breakdown.perTopicEmotions)) {
    for (const e of Object.keys(breakdown.perTopicEmotions[t])) {
      daily[dayKey].perTopicEmotions[t][e] += breakdown.perTopicEmotions[t][e];
    }
  }

  // Add engagement data if available
  if (breakdown.fullAnalysis?.engagement) {
    for (const [k, v] of Object.entries(breakdown.fullAnalysis.engagement)) {
      daily[dayKey].engagement[k] = (daily[dayKey].engagement[k] || 0) + (v * durationMs);
    }
  }

  await setDaily(daily);

  // Update status
  await setProcessingStatus({
    isProcessing: true,
    step: 'Checking achievements...',
    progress: 90,
    startedAt: Date.now()
  });

  // Check for achievements and update gamification stats
  try {
    const reflections = await REFLECTION_SYSTEM.getReflections();
    const stats = await GAMIFICATION.calculateStats(daily, reflections);
    const newAchievements = await GAMIFICATION.checkAchievements(stats);

    if (newAchievements.length > 0) {
      // Store notification about new achievements
      session.newAchievements = newAchievements;
      await setLastSession(session);
    }

    // Check for reflection nudges
    const nudges = await REFLECTION_SYSTEM.checkNudges(session, breakdown.fullAnalysis);
    if (nudges.length > 0) {
      session.nudges = nudges;
      await setLastSession(session);
    }
  } catch (error) {
    console.error('[MindfulFeed] Gamification error:', error);
  }

  // Clear raw session snapshot after saving into last session
  await setRawSession(null);
  await setSessionMeta(null);

  // Mark as complete
  await setProcessingStatus({
    isProcessing: false,
    step: 'Complete!',
    progress: 100,
    completedAt: getNow()
  });

  console.log('[MindfulFeed] Background session processing complete');

  // Open reflection page after analysis completes
  // First check if a reflection page is already open to avoid duplicates
  try {
    const reflectionUrl = chrome.runtime.getURL('popup/reflection.html');
    const existingTabs = await chrome.tabs.query({ url: reflectionUrl });

    if (existingTabs.length > 0) {
      // Reflection page already open - just focus it
      console.log('[MindfulFeed] Reflection page already open, focusing existing tab');
      await chrome.tabs.update(existingTabs[0].id, { active: true });
    } else {
      // Open new reflection page
      await chrome.tabs.create({
        url: reflectionUrl,
        active: true
      });
      console.log('[MindfulFeed] Reflection page opened');
    }
  } catch (error) {
    console.error('[MindfulFeed] Failed to open reflection page:', error);
  }
}

async function reset() {
  const next = { ...defaultState };
  await setState(next);
  return next;
}

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  await setState(state);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
    if (!msg || !msg.type) {
      sendResponse({ ok: false, error: "Missing message type" });
      return;
    }

    if (msg.type === "GET_STATE") {
      const state = await getState();
      sendResponse({ ok: true, state, elapsedMs: computeElapsed(state) });
      return;
    }

    if (msg.type === "START") {
      const state = await start();
      sendResponse({ ok: true, state, elapsedMs: computeElapsed(state) });
      return;
    }

    if (msg.type === "STOP") {
      const state = await stop();
      sendResponse({ ok: true, state, elapsedMs: state.elapsedMs });
      return;
    }

    if (msg.type === "GET_PROCESSING_STATUS") {
      const status = await getProcessingStatus();
      sendResponse({ ok: true, status });
      return;
    }

    // Foreground -> background: raw tracking snapshot
    if (msg.type === "MFF_RAW_UPDATE") {
      const payload = msg.payload || null;
      if (!payload || !payload.sessionId) {
        sendResponse({ ok: false, error: "Invalid payload" });
        return;
      }
      // Accept updates if we're tracking OR we're within the stop-finalize window for the same session.
      const [state, meta] = await Promise.all([getState(), getSessionMeta()]);
      const inFinalizeWindow =
        meta &&
        meta.sessionId === payload.sessionId &&
        meta.acceptFinalizeUntil &&
        getNow() <= meta.acceptFinalizeUntil;

      if (!state.isTracking && !inFinalizeWindow) {
        sendResponse({ ok: true, ignored: true });
        return;
      }

      // Detect platform from payload
      const platform = payload.platform || (payload.videos ? 'youtube' : 'instagram');
      const itemCount = platform === 'youtube'
        ? (payload.videos?.length || 0)
        : (payload.posts?.length || 0);
      console.log(`[Service Worker] Received ${payload.finalize ? 'FINAL' : 'update'} from ${platform}: ${itemCount} items`);

      // Get existing raw session
      let raw = await getRawSession();

      // Handle migration from old format to new multi-platform format
      if (raw && !raw.platforms) {
        console.log('[Service Worker] Migrating raw session to multi-platform format...');
        const oldPlatform = raw.platform || 'instagram';
        const platforms = {};

        if (oldPlatform === 'youtube' && raw.videos) {
          platforms.youtube = {
            videos: raw.videos,
            firstSeenAt: raw.startedAt,
            pageUrl: raw.pageUrl,
            activeKey: raw.activeKey
          };
        } else if (oldPlatform === 'instagram' && raw.posts) {
          platforms.instagram = {
            posts: raw.posts,
            firstSeenAt: raw.startedAt,
            pageUrl: raw.pageUrl,
            activeKey: raw.activeKey
          };
        }

        raw = {
          sessionId: raw.sessionId,
          startedAt: raw.startedAt,
          platforms
        };
      }

      // Ensure platforms structure exists
      if (!raw || !raw.platforms) {
        raw = {
          sessionId: payload.sessionId,
          startedAt: payload.startedAt || getNow(),
          platforms: {}
        };
      }

      // Update platform-specific data
      if (platform === 'youtube') {
        raw.platforms.youtube = {
          videos: payload.videos || [],
          firstSeenAt: raw.platforms.youtube?.firstSeenAt || getNow(),
          pageUrl: payload.pageUrl || null,
          activeKey: payload.activeKey || null
        };
      } else if (platform === 'instagram') {
        raw.platforms.instagram = {
          posts: payload.posts || [],
          firstSeenAt: raw.platforms.instagram?.firstSeenAt || getNow(),
          pageUrl: payload.pageUrl || null,
          activeKey: payload.activeKey || null
        };
      }

      // Mark if this is final snapshot for this platform
      if (payload.finalize) {
        if (!raw.platforms[platform]) raw.platforms[platform] = {};
        raw.platforms[platform].finalized = true;
        console.log(`[Service Worker] Platform ${platform} finalized`);
      }

      await setRawSession(raw);

      // If this is a final snapshot, check if ALL tracked platforms are finalized
      if (payload.finalize && meta && meta.sessionId === payload.sessionId) {
        const trackedTabs = meta.trackedTabs || [];
        const trackedPlatforms = new Set(trackedTabs.map(t => t.platform));

        let allFinalized = true;
        for (const p of trackedPlatforms) {
          if (!raw.platforms[p]?.finalized) {
            allFinalized = false;
            break;
          }
        }

        if (allFinalized) {
          console.log('[Service Worker] All platforms finalized, closing finalize window');
          await setSessionMeta({ ...meta, acceptFinalizeUntil: 0 });
        }
      }

      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "MFF_INCREMENTAL_ANALYSIS") {
      const payload = msg.payload || null;
      if (!payload || !payload.sessionId || !payload.posts) {
        sendResponse({ ok: false, error: "Invalid payload" });
        return;
      }

      const state = await getState();
      if (!state.isTracking) {
        sendResponse({ ok: true, ignored: true });
        return;
      }

      console.log(`[Service Worker] Received incremental analysis for ${payload.posts.length} posts`);

      try {
        // Analyze these posts
        const analysis = await AI_ANALYSIS.analyzePostsBatch(payload.posts);

        // Get existing incremental results
        const incrementalData = await getIncrementalAnalysis();

        // Merge with existing results (append new posts)
        incrementalData.analyzedPosts.push(...payload.posts);

        // Store aggregate analysis results
        if (!incrementalData.results) {
          incrementalData.results = analysis;
        } else {
          // Merge analysis results (combine topic/emotion distributions)
          incrementalData.results = mergeAnalysisResults(incrementalData.results, analysis);
        }

        await setIncrementalAnalysis(incrementalData);

        console.log(`[Service Worker] Incremental analysis complete. Total analyzed: ${incrementalData.analyzedPosts.length}`);

        sendResponse({ ok: true, totalAnalyzed: incrementalData.analyzedPosts.length });
      } catch (error) {
        console.error('[Service Worker] Incremental analysis error:', error);
        sendResponse({ ok: false, error: error.message });
      }
      return;
    }

    if (msg.type === "RESET") {
      const state = await reset();
      sendResponse({ ok: true, state, elapsedMs: 0 });
      return;
    }

    // Optional: dashboard fetch helper
    if (msg.type === "GET_DASHBOARD") {
      const [state, daily, last, history, reflections] = await Promise.all([
        getState(),
        getDaily(),
        new Promise((resolve) => chrome.storage.local.get([LAST_SESSION_KEY], (r) => resolve(r[LAST_SESSION_KEY] || null))),
        getSessionHistory(),
        REFLECTION_SYSTEM.getReflections()
      ]);

      // Calculate gamification data
      const stats = await GAMIFICATION.calculateStats(daily, reflections);
      const totalPoints = await GAMIFICATION.calculateTotalPoints();
      const level = GAMIFICATION.calculateLevel(totalPoints);
      const achievements = await GAMIFICATION.getAchievements();
      const reflectionTrends = await REFLECTION_SYSTEM.analyzeReflectionTrends();

      sendResponse({
        ok: true,
        state,
        elapsedMs: computeElapsed(state),
        daily,
        lastSession: last,
        sessionHistory: history,  // Include session history
        gamification: {
          stats,
          level,
          totalPoints,
          achievements
        },
        reflectionTrends
      });
      return;
    }

    // Reflection system
    if (msg.type === "SAVE_REFLECTION") {
      const reflection = await REFLECTION_SYSTEM.saveReflection(msg.sessionId, msg.responses);
      sendResponse({ ok: true, reflection });
      return;
    }

    if (msg.type === "GET_REFLECTION_PROMPTS") {
      sendResponse({ ok: true, prompts: REFLECTION_SYSTEM.REFLECTION_PROMPTS });
      return;
    }

    // Gamification
    if (msg.type === "GET_LEADERBOARD") {
      const daily = await getDaily();
      const reflections = await REFLECTION_SYSTEM.getReflections();
      const stats = await GAMIFICATION.calculateStats(daily, reflections);
      const totalPoints = await GAMIFICATION.calculateTotalPoints();
      const level = GAMIFICATION.calculateLevel(totalPoints);
      const leaderboardData = await GAMIFICATION.updateLeaderboard(stats, level);

      sendResponse({ ok: true, ...leaderboardData });
      return;
    }

    if (msg.type === "SET_USERNAME") {
      await GAMIFICATION.setUsername(msg.username);
      sendResponse({ ok: true });
      return;
    }

    // Goals
    if (msg.type === "SAVE_GOAL") {
      const goal = await REFLECTION_SYSTEM.saveGoal(msg.goal);
      sendResponse({ ok: true, goal });
      return;
    }

    if (msg.type === "GET_GOALS") {
      const goals = await REFLECTION_SYSTEM.getGoals();
      sendResponse({ ok: true, goals });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();

  return true;
});
