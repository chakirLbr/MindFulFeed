const toggleBtn = document.getElementById("toggleBtn");
const analyticsBtn = document.getElementById("analyticsBtn");
const closeBtn = document.getElementById("closeBtn");

const timeEl = document.getElementById("time");
const statusEl = document.getElementById("status");
const startTitleEl = document.getElementById("startTitle");

const playIcon = document.getElementById("playIcon");
const pauseIcon = document.getElementById("pauseIcon");

let uiInterval = null;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

function send(type) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type }, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve({ ok: false, error: err.message });
      resolve(res);
    });
  });
}

function render({ isTracking, elapsedMs }) {
  timeEl.textContent = formatTime(elapsedMs);

  if (isTracking) {
    statusEl.textContent = "Tracking your feed...";
    statusEl.classList.add("tracking");
    startTitleEl.textContent = "Stop Extension";

    playIcon.style.display = "none";
    pauseIcon.style.display = "block";
    toggleBtn.classList.add("tracking");
    toggleBtn.setAttribute("aria-label", "Stop tracking");
  } else {
    statusEl.textContent = elapsedMs > 0 ? "Stopped" : "Not tracking";
    statusEl.classList.remove("tracking");
    startTitleEl.textContent = "Start Extension";

    playIcon.style.display = "block";
    pauseIcon.style.display = "none";
    toggleBtn.classList.remove("tracking");
    toggleBtn.setAttribute("aria-label", "Start tracking");
  }
}

function showError(message) {
  statusEl.textContent = message;
  statusEl.classList.remove("tracking");
  console.error("MindfulFeed popup error:", message);
}

async function refreshFromBackground() {
  const res = await send("GET_STATE");
  if (!res || !res.ok) {
    showError(res?.error || "Background not responding");
    return;
  }
  render({ isTracking: res.state.isTracking, elapsedMs: res.elapsedMs });
}

function startUiTicking() {
  if (uiInterval) return;
  uiInterval = setInterval(refreshFromBackground, 500);
}

function stopUiTicking() {
  if (!uiInterval) return;
  clearInterval(uiInterval);
  uiInterval = null;
}

toggleBtn.addEventListener("click", async () => {
  const stateRes = await send("GET_STATE");
  if (!stateRes || !stateRes.ok) {
    showError(stateRes?.error || "Background not responding");
    return;
  }

  if (stateRes.state.isTracking) {
    const res = await send("STOP");
    if (!res || !res.ok) return showError(res?.error || "Failed to stop");
    render({ isTracking: res.state.isTracking, elapsedMs: res.elapsedMs });
    stopUiTicking();

    // Optionally open reflection page (if session was longer than 2 minutes)
    if (res.elapsedMs > 120000) {
      setTimeout(() => {
        const reflectionUrl = chrome.runtime.getURL("popup/reflection.html");
        window.open(reflectionUrl, "_blank");
      }, 500);
    }
  } else {
    const res = await send("START");
    if (!res || !res.ok) return showError(res?.error || "Failed to start");
    render({ isTracking: res.state.isTracking, elapsedMs: res.elapsedMs });
    startUiTicking();
  }
});

analyticsBtn.addEventListener("click", () => {
  // Open in a normal tab (dashboard needs space). No tabs permission required.
  const url = chrome.runtime.getURL("popup/summary.html");
  window.open(url, "_blank");
});

closeBtn.addEventListener("click", () => window.close());

// Init
(async () => {
  await refreshFromBackground();
  const res = await send("GET_STATE");
  if (!res || !res.ok) return;
  if (res.state.isTracking) startUiTicking();
})();
