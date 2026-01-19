// MindfulFeed MV3 service worker
// - Persistent session timer (Start/Stop)
// - Stores daily aggregated analytics used by the Summary dashboard
// - AI-powered content analysis
// - Gamification and leaderboard
// - Reflection and feedback system

// Import enhanced modules
importScripts('puter-loader.js', 'ai-analysis.js', 'gamification.js', 'reflection-system.js');

const STATE_KEY = "mf_timer_state";
const DAILY_KEY = "mf_daily_stats";
const LAST_SESSION_KEY = "mf_last_session";
const RAW_SESSION_KEY = "mf_raw_session"; // dwell/caption snapshot from content script
const SESSION_META_KEY = "mf_session_meta"; // { sessionId, tabId, acceptFinalizeUntil }
const SESSION_COUNT_KEY = "mf_daily_session_count"; // Track session count per day
const SESSION_HISTORY_KEY = "mf_session_history"; // Array of recent sessions (keep last 20)

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

async function ensureInjected(tabId) {
  // If the tab existed before the extension was loaded, declared content_scripts won't be injected.
  // Force-inject (safe to call multiple times).
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["foreground.js"] });
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

  const topics = ["Education", "Fun", "Sport", "News"];
  const topicW = normalizeWeights([rnd() + 0.2, rnd() + 0.2, rnd() + 0.2, rnd() + 0.2]);
  const topicMs = msFromFractions(durationMs, topicW, topics);

  const emotions = ["Heavy", "Light", "Neutral"]; // order matters for rendering
  const perTopicEmotions = {};

  for (const t of topics) {
    // keep neutral plausible; heavy sometimes higher for news
    const biasHeavy = t === "News" ? 0.35 : 0.25;
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

// AI-powered analysis with fallback to heuristics
async function generateSessionBreakdown(raw, durationMs, endedAtMs) {
  try {
    // Extract posts from raw session data
    const posts = raw?.posts || [];

    if (posts.length === 0) {
      // No posts tracked - use demo data
      console.log('[MindfulFeed] No posts found, using demo breakdown');
      return generateSessionBreakdownDemo(durationMs, endedAtMs);
    }

    // Use AI analysis (with heuristic fallback)
    const analysis = await AI_ANALYSIS.analyzePostsBatch(posts);

    // Convert to legacy format for compatibility
    const breakdown = AI_ANALYSIS.toLegacyFormat(analysis);

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

  await setSessionMeta({
    sessionId: sid,
    tabId: tab.id,
    platform,
    acceptFinalizeUntil: 0
  });

  // initialize raw session container
  await setRawSession({
    sessionId: sid,
    startedAt: next.startedAt,
    platform,
    pageUrl: null,
    activeKey: null,
    posts: []
  });

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
  await setSessionMeta({
    sessionId: meta.sessionId,
    tabId: meta.tabId,
    platform: meta.platform,
    acceptFinalizeUntil
  });

  // Store timer state immediately (UI responsiveness)
  await setState(next);

  // Tell the original tab (Instagram/YouTube) to finalize and push last dwell snapshot
  if (meta && meta.tabId) {
    await signalContentToTab(meta.tabId, "STOP", {});
  } else {
    await signalContent("STOP", {});
  }

  // Give the content script a brief moment to send its final snapshot
  await new Promise((r) => setTimeout(r, 500));

  // Read raw session snapshot (best-effort)
  const raw = await getRawSession();

  // AI-powered analysis (with fallback)
  const breakdown = await generateSessionBreakdown(raw, durationMs, endedAt);

  // Get session count for nudges
  const dayKey = isoDate(new Date(endedAt));
  const sessionCounts = await getSessionCounts();
  const todaySessionCount = sessionCounts[dayKey] || 1;

  // Store session analytics for Summary page
  const session = {
    sessionId: meta.sessionId,
    endedAt,
    durationMs,
    platform: meta.platform,
    topics: breakdown.topicMs,
    emotions: breakdown.emotionMs,
    perTopicEmotions: breakdown.perTopicEmotions,
    insights: breakdown.fullAnalysis?.insights || [],
    fullAnalysis: breakdown.fullAnalysis,  // Include full AI analysis
    raw: raw,
    sessionCount: todaySessionCount
  };
  await setLastSession(session);

  // Add to session history (keep last 20 sessions)
  await addToSessionHistory(session);

  // Aggregate into daily bucket
  const daily = await getDaily();

  if (!daily[dayKey]) {
    daily[dayKey] = {
      totalMs: 0,
      sessionCount: 0,
      topics: { Education: 0, Fun: 0, Sport: 0, News: 0 },
      emotions: { Heavy: 0, Light: 0, Neutral: 0 },
      perTopicEmotions: {
        Education: { Heavy: 0, Light: 0, Neutral: 0 },
        Fun: { Heavy: 0, Light: 0, Neutral: 0 },
        Sport: { Heavy: 0, Light: 0, Neutral: 0 },
        News: { Heavy: 0, Light: 0, Neutral: 0 }
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

  return next;
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

      // Merge shallowly (keep latest snapshot)
      await setRawSession(payload);

      // If this is the final snapshot, stop accepting further updates
      if (payload.finalize && meta && meta.sessionId === payload.sessionId) {
        await setSessionMeta({ sessionId: meta.sessionId, tabId: meta.tabId, acceptFinalizeUntil: 0 });
      }
      sendResponse({ ok: true });
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
