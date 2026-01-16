// MindfulFeed MV3 service worker
// - Persistent session timer (Start/Stop)
// - Stores daily aggregated analytics used by the Summary dashboard

const STATE_KEY = "mf_timer_state";
const DAILY_KEY = "mf_daily_stats";
const LAST_SESSION_KEY = "mf_last_session";
const RAW_SESSION_KEY = "mf_raw_session"; // dwell/caption snapshot from content script
const SESSION_META_KEY = "mf_session_meta"; // { sessionId, tabId, acceptFinalizeUntil }

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
          resolve(t);
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

function generateSessionBreakdown(durationMs, endedAtMs) {
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

async function start() {
  const state = await getState();
  if (state.isTracking) return state;

  const tab = await getActiveInstagramTab();
  if (!tab || !tab.id) {
    throw new Error("Open Instagram Home Feed (instagram.com) and keep it as the active tab, then press Start.");
  }

  const sid = newSessionId();
  const next = {
    ...state,
    isTracking: true,
    startedAt: getNow()
  };

  await setState(next);

  await setSessionMeta({ sessionId: sid, tabId: tab.id, acceptFinalizeUntil: 0 });

  // initialize raw session container
  await setRawSession({ sessionId: sid, startedAt: next.startedAt, pageUrl: null, activeKey: null, posts: [] });
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
    acceptFinalizeUntil
  });

  // Store timer state immediately (UI responsiveness)
  await setState(next);

  // Tell the original Instagram tab (from START) to finalize and push last dwell snapshot
  if (meta && meta.tabId) {
    await signalContentToTab(meta.tabId, "STOP", {});
  } else {
    await signalContent("STOP", {});
  }

  // Give the content script a brief moment to send its final snapshot
  await new Promise((r) => setTimeout(r, 500));

  // Read raw session snapshot (best-effort)
  const raw = await getRawSession();

  // Store demo analytics for Summary page
  const breakdown = generateSessionBreakdown(durationMs, endedAt);
  const session = {
    endedAt,
    durationMs,
    topics: breakdown.topicMs,
    emotions: breakdown.emotionMs,
    perTopicEmotions: breakdown.perTopicEmotions,
    raw: raw
  };
  await setLastSession(session);

  // Aggregate into daily bucket
  const dayKey = isoDate(new Date(endedAt));
  const daily = await getDaily();

  if (!daily[dayKey]) {
    daily[dayKey] = {
      totalMs: 0,
      topics: { Education: 0, Fun: 0, Sport: 0, News: 0 },
      emotions: { Heavy: 0, Light: 0, Neutral: 0 },
      perTopicEmotions: {
        Education: { Heavy: 0, Light: 0, Neutral: 0 },
        Fun: { Heavy: 0, Light: 0, Neutral: 0 },
        Sport: { Heavy: 0, Light: 0, Neutral: 0 },
        News: { Heavy: 0, Light: 0, Neutral: 0 }
      }
    };
  }

  daily[dayKey].totalMs += durationMs;

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

  await setDaily(daily);

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
      const [state, daily, last] = await Promise.all([
        getState(),
        getDaily(),
        new Promise((resolve) => chrome.storage.local.get([LAST_SESSION_KEY], (r) => resolve(r[LAST_SESSION_KEY] || null)))
      ]);
      sendResponse({ ok: true, state, elapsedMs: computeElapsed(state), daily, lastSession: last });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();

  return true;
});
