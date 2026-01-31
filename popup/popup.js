// DOM Elements
const monitoringStatus = document.getElementById("monitoringStatus");
const sessionTime = document.getElementById("sessionTime");
const postsCount = document.getElementById("postsCount");
const dominantEmotion = document.getElementById("dominantEmotion");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const emotionChart = document.getElementById("emotionChart");
const emotionLegend = document.getElementById("emotionLegend");
const reflectionSection = document.getElementById("reflectionSection");
const reflectionPrompt = document.getElementById("reflectionPrompt");
const breakdownToggle = document.getElementById("breakdownToggle");
const breakdownContent = document.getElementById("breakdownContent");
const toggleBtn = document.getElementById("toggleBtn");
const toggleText = document.getElementById("toggleText");
const analyticsBtn = document.getElementById("analyticsBtn");
const menuBtn = document.getElementById("menuBtn");
const playIcon = document.getElementById("playIcon");
const pauseIcon = document.getElementById("pauseIcon");

let uiInterval = null;
let processingCheckInterval = null;

// Utility functions
function send(type) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type }, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve({ ok: false, error: err.message });
      resolve(res);
    });
  });
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

function formatTimeShort(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Draw donut chart
function drawEmotionDonut(emotions) {
  const { Positive = 0, Neutral = 0, Negative = 0 } = emotions;
  const total = Positive + Neutral + Negative;

  if (total === 0) {
    emotionChart.innerHTML = '';
    emotionLegend.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;">No data yet</div>';
    return;
  }

  const positivePercent = Math.round((Positive / total) * 100);
  const neutralPercent = Math.round((Neutral / total) * 100);
  const negativePercent = 100 - positivePercent - neutralPercent;

  // Draw donut chart
  const radius = 70;
  const strokeWidth = 24;
  const centerX = 100;
  const centerY = 100;
  const circumference = 2 * Math.PI * radius;

  let currentAngle = -90; // Start at top

  const segments = [
    { percent: positivePercent, color: '#5CB85C', label: 'Positive' },
    { percent: neutralPercent, color: '#F0AD4E', label: 'Neutral' },
    { percent: negativePercent, color: '#D9534F', label: 'Negative' }
  ];

  let svgContent = '';

  segments.forEach((segment, index) => {
    if (segment.percent > 0) {
      const angle = (segment.percent / 100) * 360;
      const endAngle = currentAngle + angle;

      const startRad = (currentAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1 = centerX + radius * Math.cos(startRad);
      const y1 = centerY + radius * Math.sin(startRad);
      const x2 = centerX + radius * Math.cos(endRad);
      const y2 = centerY + radius * Math.sin(endRad);

      const largeArcFlag = angle > 180 ? 1 : 0;

      const pathData = [
        `M ${centerX} ${centerY}`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        'Z'
      ].join(' ');

      svgContent += `<path d="${pathData}" fill="${segment.color}" opacity="0.9"/>`;
      currentAngle = endAngle;
    }
  });

  // Inner circle (donut hole)
  const innerRadius = radius - strokeWidth;
  svgContent += `<circle cx="${centerX}" cy="${centerY}" r="${innerRadius}" fill="white"/>`;

  // Center text
  const dominantSegment = segments.reduce((max, seg) => seg.percent > max.percent ? seg : max);
  svgContent += `
    <text x="${centerX}" y="${centerY - 8}" text-anchor="middle" font-size="32" font-weight="700" fill="${dominantSegment.color}">${dominantSegment.percent}%</text>
    <text x="${centerX}" y="${centerY + 18}" text-anchor="middle" font-size="14" fill="${dominantSegment.color}" opacity="0.8">${dominantSegment.label}</text>
  `;

  emotionChart.innerHTML = svgContent;

  // Update legend
  let legendHTML = '';
  segments.forEach(segment => {
    legendHTML += `
      <div class="legendItem">
        <div class="legendColor" style="background:${segment.color}"></div>
        <span class="legendLabel">${segment.label}</span>
        <span class="legendPercent">${segment.percent}%</span>
      </div>
    `;
  });
  emotionLegend.innerHTML = legendHTML;
}

// Update UI from state
async function updateUI() {
  const stateRes = await send("GET_STATE");
  if (!stateRes || !stateRes.ok) {
    console.error("Failed to get state:", stateRes?.error);
    return;
  }

  const { state, elapsedMs } = stateRes;
  const { isTracking } = state;

  // Update monitoring status
  if (isTracking) {
    // Get platform from session metadata
    const sessionMeta = await getStorageData('mf_session_meta');
    const platform = sessionMeta?.platform || 'instagram';
    const platformName = platform === 'youtube' ? 'YouTube' : 'Instagram';

    monitoringStatus.textContent = `Monitoring ${platformName}`;
    monitoringStatus.classList.remove("inactive");
    toggleBtn.classList.add("tracking");
    toggleText.textContent = "Stop tracking";
    playIcon.style.display = "none";
    pauseIcon.style.display = "block";
  } else {
    monitoringStatus.textContent = "Not tracking";
    monitoringStatus.classList.add("inactive");
    toggleBtn.classList.remove("tracking");
    toggleText.textContent = "Start tracking";
    playIcon.style.display = "block";
    pauseIcon.style.display = "none";
  }

  // Update session time
  sessionTime.textContent = formatTime(elapsedMs);

  // Get session data
  const rawSession = await getStorageData('mf_raw_session');
  const lastSession = await getStorageData('mf_last_session');
  const dailyStats = await getStorageData('mf_daily_stats');

  // Update posts count (handle both Instagram posts and YouTube videos)
  if (isTracking && rawSession) {
    const count = rawSession.platform === 'youtube'
      ? (rawSession.videos?.length || 0)
      : (rawSession.posts?.length || 0);
    postsCount.textContent = count;
  } else if (lastSession && lastSession.raw) {
    const count = lastSession.platform === 'youtube'
      ? (lastSession.raw.videos?.length || 0)
      : (lastSession.raw.posts?.length || 0);
    postsCount.textContent = count;
  } else {
    postsCount.textContent = "0";
  }

  // Update emotion data
  let emotions = { Positive: 0, Neutral: 0, Negative: 0 };
  let topics = {};

  if (lastSession && lastSession.emotions) {
    // Map old emotion names to new ones
    emotions = {
      Positive: lastSession.emotions.Light || 0,
      Neutral: lastSession.emotions.Neutral || 0,
      Negative: lastSession.emotions.Heavy || 0
    };
  }

  if (lastSession && lastSession.topics) {
    topics = lastSession.topics;
  }

  // Determine dominant emotion
  const maxEmotion = Object.keys(emotions).reduce((a, b) =>
    emotions[a] > emotions[b] ? a : b
  );

  const totalEmotionTime = Object.values(emotions).reduce((sum, val) => sum + val, 0);
  if (totalEmotionTime > 0) {
    dominantEmotion.textContent = maxEmotion.substring(0, 3);
  } else {
    dominantEmotion.textContent = "-";
  }

  // Draw emotion donut
  drawEmotionDonut(emotions);

  // Update daily progress
  const today = new Date().toISOString().split('T')[0];
  const dailyGoal = 60 * 60 * 1000; // 60 minutes in ms
  let todayTotal = 0;

  if (dailyStats && dailyStats[today]) {
    todayTotal = dailyStats[today].totalMs || 0;
  }

  const progressPercent = Math.min(100, (todayTotal / dailyGoal) * 100);
  const todayMinutes = Math.floor(todayTotal / 60000);
  const goalMinutes = 60;

  progressFill.style.width = `${progressPercent}%`;
  progressText.textContent = `${todayMinutes}/${goalMinutes} min`;

  // Update reflection prompt
  if (lastSession && !isTracking && elapsedMs > 120000) {
    reflectionSection.style.display = "block";
    reflectionPrompt.textContent = "Take a moment to notice how this content makes you feel.";
  } else {
    reflectionSection.style.display = "none";
  }

  // Update content breakdown
  if (Object.keys(topics).length > 0) {
    const totalMs = Object.values(topics).reduce((sum, ms) => sum + ms, 0);
    let breakdownHTML = '';
    Object.entries(topics)
      .sort(([, a], [, b]) => b - a)
      .forEach(([topic, ms]) => {
        const percentage = totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0;
        breakdownHTML += `
          <div class="topicItem">
            <span class="topicName">${topic}</span>
            <span class="topicTime">${percentage}%</span>
          </div>
        `;
      });
    breakdownContent.innerHTML = breakdownHTML;
  } else {
    breakdownContent.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:12px 0;">No data yet</div>';
  }

  // Update analytics button state
  await updateAnalyticsButton();
}

function getStorageData(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key]);
    });
  });
}

async function updateAnalyticsButton() {
  const statusRes = await send("GET_PROCESSING_STATUS");

  if (statusRes && statusRes.ok && statusRes.status && statusRes.status.isProcessing) {
    analyticsBtn.disabled = true;
    analyticsBtn.style.opacity = '0.5';
    analyticsBtn.title = 'Please wait, analyzing session...';
  } else {
    analyticsBtn.disabled = false;
    analyticsBtn.style.opacity = '1';
    analyticsBtn.title = 'View your session dashboard';
    stopProcessingCheck();
  }
}

function startUiTicking() {
  if (uiInterval) return;
  uiInterval = setInterval(updateUI, 1000);
}

function stopUiTicking() {
  if (!uiInterval) return;
  clearInterval(uiInterval);
  uiInterval = null;
}

function startProcessingCheck() {
  if (processingCheckInterval) return;
  processingCheckInterval = setInterval(updateAnalyticsButton, 1000);
}

function stopProcessingCheck() {
  if (!processingCheckInterval) return;
  clearInterval(processingCheckInterval);
  processingCheckInterval = null;
}

// Event listeners
toggleBtn.addEventListener("click", async () => {
  const stateRes = await send("GET_STATE");
  if (!stateRes || !stateRes.ok) {
    console.error("Failed to get state");
    return;
  }

  if (stateRes.state.isTracking) {
    const res = await send("STOP");
    if (!res || !res.ok) {
      console.error("Failed to stop");
      return;
    }
    stopUiTicking();

    // Update UI immediately to show "Start" button
    await updateUI();

    startProcessingCheck();
    await updateAnalyticsButton();

    // Open reflection page if session was longer than 2 minutes
    if (res.elapsedMs > 120000) {
      const reflectionUrl = chrome.runtime.getURL("popup/reflection.html");
      window.open(reflectionUrl, "_blank");
    }
  } else {
    const res = await send("START");
    if (!res || !res.ok) {
      console.error("Failed to start");
      return;
    }
    startUiTicking();
  }

  await updateUI();
});

analyticsBtn.addEventListener("click", () => {
  const url = chrome.runtime.getURL("popup/summary.html");
  window.open(url, "_blank");
});

breakdownToggle.addEventListener("click", () => {
  breakdownToggle.classList.toggle("open");
  breakdownContent.classList.toggle("open");
});

menuBtn.addEventListener("click", () => {
  // Open settings or show menu
  const url = chrome.runtime.getURL("settings/settings.html");
  window.open(url, "_blank");
});

// Initialize
(async () => {
  await updateUI();
  const res = await send("GET_STATE");
  if (!res || !res.ok) return;

  if (res.state.isTracking) {
    startUiTicking();
  } else {
    const statusRes = await send("GET_PROCESSING_STATUS");
    if (statusRes && statusRes.ok && statusRes.status && statusRes.status.isProcessing) {
      startProcessingCheck();
    }
  }
})();
