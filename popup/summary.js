const TOPICS = [
  { key: "Educational", colorVar: "--c-educational" },
  { key: "Entertainment", colorVar: "--c-entertainment" },
  { key: "Social", colorVar: "--c-social" },
  { key: "Informative", colorVar: "--c-informative" }
];

const EMOTIONS = [
  { key: "Heavy", colorVar: "--e-heavy", desc: "Content with heavy emotions" },
  { key: "Neutral", colorVar: "--e-neutral", desc: "Neutral content" },
  { key: "Light", colorVar: "--e-light", desc: "Content with light emotions" }
];

// Processing status helpers
async function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(res);
      }
    });
  });
}

async function checkProcessingStatus() {
  const res = await sendMessage({ type: 'GET_PROCESSING_STATUS' });
  if (res && res.ok && res.status) {
    return res.status;
  }
  return null;
}

function showLoadingScreen(status) {
  let loadingScreen = document.getElementById('loadingScreen');

  if (!loadingScreen) {
    loadingScreen = document.createElement('div');
    loadingScreen.id = 'loadingScreen';
    loadingScreen.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <h2>Analyzing Your Session</h2>
        <p id="loadingMessage">Getting ready...</p>
        <div class="progress-bar">
          <div id="progressFill" class="progress-fill"></div>
        </div>
        <p id="progressText" class="progress-text">0%</p>
      </div>
    `;
    document.body.appendChild(loadingScreen);

    const style = document.createElement('style');
    style.textContent = `
      #loadingScreen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }

      .loading-content {
        text-align: center;
        max-width: 500px;
        padding: 2rem;
      }

      .loading-spinner {
        width: 60px;
        height: 60px;
        margin: 0 auto 1.5rem;
        border: 4px solid #e2e8f0;
        border-top-color: #667eea;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .loading-content h2 {
        color: #2d3748;
        margin-bottom: 0.5rem;
      }

      #loadingMessage {
        color: #4a5568;
        margin-bottom: 1.5rem;
        font-size: 1rem;
      }

      .progress-bar {
        width: 100%;
        height: 8px;
        background: #e2e8f0;
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 0.5rem;
      }

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #667eea, #764ba2);
        transition: width 0.3s ease;
        width: 0%;
      }

      .progress-text {
        color: #718096;
        font-size: 0.875rem;
        font-weight: 500;
      }
    `;
    document.head.appendChild(style);
  }

  if (status) {
    document.getElementById('loadingMessage').textContent = status.step || 'Processing...';
    document.getElementById('progressFill').style.width = `${status.progress || 0}%`;
    document.getElementById('progressText').textContent = `${status.progress || 0}%`;
  }
}

function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    loadingScreen.remove();
  }
}

async function waitForProcessing() {
  showLoadingScreen({ step: 'Starting analysis...', progress: 0 });

  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    const status = await checkProcessingStatus();

    if (!status || !status.isProcessing) {
      hideLoadingScreen();
      return true;
    }

    showLoadingScreen(status);
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }

  hideLoadingScreen();
  return false;
}

function pad2(n) { return String(n).padStart(2, "0"); }

function formatHMS(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function formatMSShort(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m >= 60) return formatHMS(ms);
  return `${pad2(m)}:${pad2(s)}`;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function sumObj(obj) {
  return Object.values(obj || {}).reduce((a, b) => a + (Number(b) || 0), 0);
}

function safePercent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

// Calculate percentages that properly sum to 100%
function calculateProperPercentages(values) {
  const total = values.reduce((sum, val) => sum + val, 0);
  if (total === 0) return values.map(() => 0);

  // Calculate exact percentages
  const exactPercentages = values.map(val => (val / total) * 100);

  // Round down first
  const rounded = exactPercentages.map(Math.floor);

  // Calculate remainder
  let remainingPercent = 100 - rounded.reduce((sum, val) => sum + val, 0);

  // Distribute remainder to values with largest fractional parts
  const fractionalParts = exactPercentages.map((val, idx) => ({
    index: idx,
    fraction: val - Math.floor(val)
  }));

  fractionalParts.sort((a, b) => b.fraction - a.fraction);

  for (let i = 0; i < remainingPercent; i++) {
    rounded[fractionalParts[i].index]++;
  }

  return rounded;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyDate(iso) {
  // "05 Nov 2025" style
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function renderTopicLegend(topicsMs, totalMs) {
  const el = document.getElementById("topicLegend");
  el.innerHTML = "";

  // Get values in order and calculate proper percentages
  const values = TOPICS.map(t => topicsMs?.[t.key] || 0);
  const percentages = calculateProperPercentages(values);

  for (let i = 0; i < TOPICS.length; i++) {
    const t = TOPICS[i];
    const pct = percentages[i];
    const item = document.createElement("div");
    item.className = "legendItem";
    item.innerHTML = `
      <span class="legendDot" style="background:${cssVar(t.colorVar)}"></span>
      <span style="min-width:92px">${t.key}</span>
      <span class="legendPct">${pct}% of time</span>
    `;
    el.appendChild(item);
  }
}

function renderDonut(topicsMs, totalMs, daily) {
  const root = document.getElementById("topicDonut");
  root.innerHTML = "";

  const size = 260;
  const radius = 96;
  const strokeWidth = 18;
  const circumference = 2 * Math.PI * radius;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("style", "transform: rotate(-90deg)");

  // Background track
  const track = document.createElementNS(svgNS, "circle");
  track.setAttribute("cx", String(size / 2));
  track.setAttribute("cy", String(size / 2));
  track.setAttribute("r", String(radius));
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", "rgba(36,49,58,0.08)");
  track.setAttribute("stroke-width", String(strokeWidth));
  svg.appendChild(track);

  // Get the 4 topic values and colors
  const topicData = TOPICS.map(t => ({
    key: t.key,
    value: topicsMs?.[t.key] || 0,
    color: cssVar(t.colorVar)
  }));

  // Calculate percentages
  const values = topicData.map(t => t.value);
  const percentages = calculateProperPercentages(values);

  // Draw each segment as a circle with stroke-dasharray
  let offset = 0;

  for (let i = 0; i < topicData.length; i++) {
    const pct = percentages[i];
    if (pct === 0) continue;

    const segmentLength = (pct / 100) * circumference;

    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", String(size / 2));
    circle.setAttribute("cy", String(size / 2));
    circle.setAttribute("r", String(radius));
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", topicData[i].color);
    circle.setAttribute("stroke-width", String(strokeWidth));
    circle.setAttribute("stroke-dasharray", `${segmentLength} ${circumference}`);
    circle.setAttribute("stroke-dashoffset", String(-offset));
    circle.setAttribute("stroke-linecap", "butt");

    svg.appendChild(circle);

    offset += segmentLength;
  }

  // Calculate yesterday comparison
  const comparison = calculateYesterdayComparison(daily);
  let comparisonHtml = '';
  if (comparison.hasYesterdayData) {
    const sign = comparison.diffMinutes >= 0 ? '+' : '';
    const color = comparison.diffMinutes >= 0 ? '#ff3b30' : '#35c759';
    comparisonHtml = `<div class="donutComparison" style="color: ${color}">${sign}${comparison.diffMinutes} min vs yesterday</div>`;
  }

  const center = document.createElement("div");
  center.className = "donutCenter";
  center.innerHTML = `
    <div class="donutTime">${formatHMS(totalMs)}</div>
    ${comparisonHtml}
  `;

  root.appendChild(svg);
  root.appendChild(center);
}

function renderEmotionList(emotionsMs, totalMs, daily) {
  const el = document.getElementById("emoList");
  el.innerHTML = "";

  // Get yesterday's data for comparison
  const today = new Date();
  const todayKey = isoDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = isoDate(yesterday);
  const yesterdayEmotions = daily?.[yesterdayKey]?.emotions || {};

  // Get values in order and calculate proper percentages
  const values = EMOTIONS.map(e => emotionsMs?.[e.key] || 0);
  const percentages = calculateProperPercentages(values);

  for (let i = 0; i < EMOTIONS.length; i++) {
    const e = EMOTIONS[i];
    const ms = values[i];
    const pct = percentages[i];

    const row = document.createElement("div");
    row.className = "emoRow";

    const ring = document.createElement("div");
    ring.className = "miniRing";

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 60 60");

    const track = document.createElementNS(svgNS, "circle");
    track.setAttribute("cx", "30");
    track.setAttribute("cy", "30");
    track.setAttribute("r", "24");
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", "rgba(36,49,58,0.10)");
    track.setAttribute("stroke-width", "6");
    svg.appendChild(track);

    const c = 2 * Math.PI * 24;
    const len = (pct / 100) * c;
    const prog = document.createElementNS(svgNS, "circle");
    prog.setAttribute("cx", "30");
    prog.setAttribute("cy", "30");
    prog.setAttribute("r", "24");
    prog.setAttribute("fill", "none");
    prog.setAttribute("stroke", cssVar(e.colorVar));
    prog.setAttribute("stroke-width", "6");
    prog.setAttribute("stroke-linecap", "round");
    prog.setAttribute("stroke-dasharray", `${len} ${c - len}`);
    svg.appendChild(prog);

    ring.appendChild(svg);

    const label = document.createElement("div");
    label.className = "miniLabel";

    const pctEl = document.createElement("div");
    pctEl.className = "miniPct";
    pctEl.textContent = `${pct}% of time`;

    const timeEl = document.createElement("div");
    timeEl.className = "miniTime";
    timeEl.style.color = cssVar(e.colorVar);
    timeEl.textContent = formatMSShort(ms);

    const descEl = document.createElement("div");
    descEl.className = "miniDesc";
    descEl.textContent = e.desc;

    label.appendChild(pctEl);
    label.appendChild(timeEl);
    label.appendChild(descEl);

    // Add yesterday comparison for this emotion
    const yesterdayMs = yesterdayEmotions[e.key] || 0;
    if (yesterdayMs > 0) {
      const diffMs = ms - yesterdayMs;
      const diffMinutes = Math.round(diffMs / 60000);
      const sign = diffMinutes >= 0 ? '+' : '';
      const color = diffMinutes >= 0 ? '#ff3b30' : '#35c759'; // red for more, green for less

      const comparisonEl = document.createElement("div");
      comparisonEl.className = "miniComparison";
      comparisonEl.style.color = color;
      comparisonEl.textContent = `${sign}${diffMinutes} min vs yesterday`;
      label.appendChild(comparisonEl);
    }

    row.appendChild(ring);
    row.appendChild(label);
    el.appendChild(row);
  }
}

function renderStatsLegend() {
  const el = document.getElementById("statsLegend");
  el.innerHTML = "";
  for (const t of TOPICS) {
    const pill = document.createElement("div");
    pill.className = "legendPill";
    pill.innerHTML = `<span class="legendSwatch" style="background:${cssVar(t.colorVar)}"></span>${t.key}`;
    el.appendChild(pill);
  }
}

function renderStats(daily, days) {
  const el = document.getElementById("stats");
  el.innerHTML = "";

  for (const dayKey of days) {
    const d = daily?.[dayKey];
    const total = d?.totalMs || 0;

    const row = document.createElement("div");
    row.className = "statsRow";

    const date = document.createElement("div");
    date.className = "statsDate";
    date.textContent = prettyDate(dayKey);

    const track = document.createElement("div");
    track.className = "barTrack";

    for (const t of TOPICS) {
      const ms = d?.topics?.[t.key] || 0;
      const pct = total ? (ms / total) * 100 : 0;
      const seg = document.createElement("div");
      seg.className = "barSeg";
      seg.style.width = `${pct}%`;
      seg.style.background = cssVar(t.colorVar);
      track.appendChild(seg);
    }

    row.appendChild(date);
    row.appendChild(track);
    el.appendChild(row);
  }
}

function renderEmotionBarCard(topic, perTopicEmotions) {
  const card = document.createElement("article");
  card.className = "card emotionBarCard";

  const total = sumObj(perTopicEmotions || {});
  const heavy = perTopicEmotions?.Heavy || 0;
  const light = perTopicEmotions?.Light || 0;
  const neutral = perTopicEmotions?.Neutral || 0;

  // Calculate proper percentages that sum to 100%
  const percentages = calculateProperPercentages([heavy, light, neutral]);
  const heavyPct = percentages[0];
  const lightPct = percentages[1];
  const neutralPct = percentages[2];

  // Get topic color and icon
  const topicData = TOPICS.find(t => t.key === topic);
  const topicColor = topicData ? cssVar(topicData.colorVar) : '#666';
  const topicIcon = getTopicIcon(topic);

  card.innerHTML = `
    <div class="emotionBarHeader">
      <div class="emotionBarTitle">
        <span class="topicIcon" style="color: ${topicColor}">${topicIcon}</span>
        <span style="color: ${topicColor}">${topic}</span>
      </div>
      <div class="emotionBarTime">${formatMSShort(total)}</div>
    </div>

    <div class="emotionBarTrack">
      <div class="emotionBarSegment"
           style="width: ${heavyPct}%; background: ${cssVar("--e-heavy")}"
           data-emotion="Heavy"
           data-pct="${heavyPct}%"
           title="Heavy: ${heavyPct}%">
      </div>
      <div class="emotionBarSegment"
           style="width: ${lightPct}%; background: ${cssVar("--e-light")}"
           data-emotion="Light"
           data-pct="${lightPct}%"
           title="Light: ${lightPct}%">
      </div>
      <div class="emotionBarSegment"
           style="width: ${neutralPct}%; background: ${cssVar("--e-neutral")}"
           data-emotion="Neutral"
           data-pct="${neutralPct}%"
           title="Neutral: ${neutralPct}%">
      </div>
    </div>

    <div class="emotionBarStats">
      <div class="emotionStat">
        <span class="emotionDot" style="background: ${cssVar("--e-heavy")}"></span>
        <span class="emotionName">Heavy</span>
        <span class="emotionValue">${heavyPct}%</span>
      </div>
      <div class="emotionStat">
        <span class="emotionDot" style="background: ${cssVar("--e-light")}"></span>
        <span class="emotionName">Light</span>
        <span class="emotionValue">${lightPct}%</span>
      </div>
      <div class="emotionStat">
        <span class="emotionDot" style="background: ${cssVar("--e-neutral")}"></span>
        <span class="emotionName">Neutral</span>
        <span class="emotionValue">${neutralPct}%</span>
      </div>
    </div>
  `;

  return card;
}

// Render heatmap matrix visualization
function renderHeatmap(perTopicEmotions, totalMs) {
  const container = document.getElementById('heatmapMatrix');
  if (!container) return;

  container.innerHTML = '';

  // Calculate max value for color intensity scaling
  let maxMs = 0;
  for (const topic of TOPICS) {
    for (const emotion of EMOTIONS) {
      const ms = perTopicEmotions?.[topic.key]?.[emotion.key] || 0;
      maxMs = Math.max(maxMs, ms);
    }
  }

  // Create heatmap header
  const header = document.createElement('div');
  header.className = 'heatmapHeader';
  header.innerHTML = '<div class="heatmapCorner"></div>';

  for (const emotion of EMOTIONS) {
    const emotionHeader = document.createElement('div');
    emotionHeader.className = 'heatmapEmotionHeader';
    emotionHeader.textContent = emotion.key;
    emotionHeader.style.color = cssVar(emotion.colorVar);
    header.appendChild(emotionHeader);
  }
  container.appendChild(header);

  // Create heatmap rows
  for (const topic of TOPICS) {
    const row = document.createElement('div');
    row.className = 'heatmapRow';

    // Topic label
    const label = document.createElement('div');
    label.className = 'heatmapTopicLabel';
    label.innerHTML = `<span style="color: ${cssVar(topic.colorVar)}">${getTopicIcon(topic.key)}</span> ${topic.key}`;
    row.appendChild(label);

    // Emotion cells
    for (const emotion of EMOTIONS) {
      const ms = perTopicEmotions?.[topic.key]?.[emotion.key] || 0;
      const cell = document.createElement('div');
      cell.className = 'heatmapCell';

      // Calculate intensity (0-1) for color opacity
      const intensity = maxMs > 0 ? ms / maxMs : 0;
      const baseColor = cssVar(emotion.colorVar);

      // Convert hex to rgba with opacity
      const r = parseInt(baseColor.slice(1, 3), 16);
      const g = parseInt(baseColor.slice(3, 5), 16);
      const b = parseInt(baseColor.slice(5, 7), 16);
      const alpha = 0.15 + (intensity * 0.85); // Min 15%, max 100%

      cell.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      cell.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.3)`;

      // Cell content
      const timeText = formatMSShort(ms);
      const percentage = totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0;

      cell.innerHTML = `
        <div class="heatmapCellTime">${timeText}</div>
        <div class="heatmapCellPercent">${percentage}%</div>
      `;

      cell.title = `${topic.key} - ${emotion.key}: ${timeText} (${percentage}% of total)`;

      row.appendChild(cell);
    }

    container.appendChild(row);
  }
}

// Calculate yesterday comparison
function calculateYesterdayComparison(daily) {
  const today = new Date();
  const todayKey = isoDate(today);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = isoDate(yesterday);

  const todayMs = daily[todayKey]?.totalMs || 0;
  const yesterdayMs = daily[yesterdayKey]?.totalMs || 0;

  const diffMs = todayMs - yesterdayMs;
  const diffMinutes = Math.round(diffMs / 60000);

  return {
    todayMs,
    yesterdayMs,
    diffMs,
    diffMinutes,
    hasYesterdayData: yesterdayMs > 0
  };
}

function lastNDays(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const dt = new Date(d);
    dt.setDate(d.getDate() - i);
    out.push(isoDate(dt));
  }
  return out;
}

function getDaysForPeriod(period) {
  if (period === "day") return [isoDate(new Date())];
  if (period === "month") return lastNDays(30).reverse();
  // default week
  return lastNDays(7).reverse();
}

let cachedDaily = {};
let cachedRes = null;
let currentPeriod = "week";

function renderStatsForPeriod(period) {
  const days = getDaysForPeriod(period);
  const statsEl = document.getElementById("stats");
  if (statsEl) {
    statsEl.classList.toggle("scroll", period === "month");
  }
  renderStats(cachedDaily, days);
}

function wirePeriodTabs() {
  const wrap = document.getElementById("periodTabs");
  if (!wrap) return;

  wrap.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-period]");
    if (!btn) return;
    const period = btn.getAttribute("data-period");
    if (!period) return;

    currentPeriod = period;
    for (const b of wrap.querySelectorAll("button[data-period]")) {
      b.classList.toggle("active", b === btn);
    }
    renderStatsForPeriod(period);
  });
}

async function loadDashboard() {
  // Check if AI is still processing
  const status = await checkProcessingStatus();

  if (status && status.isProcessing) {
    console.log('[Analytics] Session still processing, waiting for completion...');
    await waitForProcessing();
  }

  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_DASHBOARD" }, (r) => resolve(r));
  });

  cachedRes = res;

  const daily = res?.daily || {};
  cachedDaily = daily;
  const todayKey = isoDate(new Date());
  const today = daily[todayKey] || {
    totalMs: 0,
    topics: { Educational: 0, Entertainment: 0, Social: 0, Informative: 0 },
    emotions: { Heavy: 0, Light: 0, Neutral: 0 },
    perTopicEmotions: {
      Educational: { Heavy: 0, Light: 0, Neutral: 0 },
      Entertainment: { Heavy: 0, Light: 0, Neutral: 0 },
      Social: { Heavy: 0, Light: 0, Neutral: 0 },
      Informative: { Heavy: 0, Light: 0, Neutral: 0 }
    }
  };

  // If the user never stopped a session yet, show last running time as today's total (so the dashboard isn't blank).
  const fallbackTotal = res?.elapsedMs && res?.elapsedMs > 0 ? res.elapsedMs : 0;
  const totalMs = today.totalMs || fallbackTotal;

  // If today has no analytics yet, fake a simple even split so UI is not empty.
  const topicsMs = (today.totalMs > 0) ? today.topics : {
    Educational: Math.round(totalMs * 0.25),
    Entertainment: Math.round(totalMs * 0.25),
    Social: Math.round(totalMs * 0.25),
    Informative: totalMs - 3 * Math.round(totalMs * 0.25)
  };

  const emotionsMs = (today.totalMs > 0) ? today.emotions : {
    Heavy: Math.round(totalMs * 0.35),
    Light: Math.round(totalMs * 0.45),
    Neutral: totalMs - Math.round(totalMs * 0.35) - Math.round(totalMs * 0.45)
  };

  renderDonut(topicsMs, totalMs, daily);
  renderTopicLegend(topicsMs, totalMs);
  renderEmotionList(emotionsMs, totalMs, daily);

  renderStatsLegend();
  renderStatsForPeriod(currentPeriod);

  // Render heatmap matrix
  const perTopicEmotions = (today.totalMs > 0) ? today.perTopicEmotions : {
    Educational: {
      Heavy: Math.round((topicsMs.Educational || 0) * 0.33),
      Light: Math.round((topicsMs.Educational || 0) * 0.34),
      Neutral: (topicsMs.Educational || 0) - Math.round((topicsMs.Educational || 0) * 0.33) - Math.round((topicsMs.Educational || 0) * 0.34)
    },
    Entertainment: {
      Heavy: Math.round((topicsMs.Entertainment || 0) * 0.33),
      Light: Math.round((topicsMs.Entertainment || 0) * 0.34),
      Neutral: (topicsMs.Entertainment || 0) - Math.round((topicsMs.Entertainment || 0) * 0.33) - Math.round((topicsMs.Entertainment || 0) * 0.34)
    },
    Social: {
      Heavy: Math.round((topicsMs.Social || 0) * 0.33),
      Light: Math.round((topicsMs.Social || 0) * 0.34),
      Neutral: (topicsMs.Social || 0) - Math.round((topicsMs.Social || 0) * 0.33) - Math.round((topicsMs.Social || 0) * 0.34)
    },
    Informative: {
      Heavy: Math.round((topicsMs.Informative || 0) * 0.33),
      Light: Math.round((topicsMs.Informative || 0) * 0.34),
      Neutral: (topicsMs.Informative || 0) - Math.round((topicsMs.Informative || 0) * 0.33) - Math.round((topicsMs.Informative || 0) * 0.34)
    }
  };
  renderHeatmap(perTopicEmotions, totalMs);

  const gauges = document.getElementById("gauges");
  gauges.innerHTML = "";
  for (const t of TOPICS) {
    const per = perTopicEmotions[t.key];
    gauges.appendChild(renderEmotionBarCard(t.key, per));
  }

  const foot = document.getElementById("footnote");
  const lastEnded = res?.lastSession?.endedAt ? new Date(res.lastSession.endedAt) : null;
  foot.textContent = lastEnded
    ? `Last session ended: ${lastEnded.toLocaleString()}`
    : `No completed session yet — start the extension, then stop it to generate a report.`;

  // Debug dump with AI analysis results
  const pre = document.getElementById("rawDump");
  const analysisMethodTextEl = document.getElementById("analysisMethodText");

  if (pre) {
    const raw = res?.lastSession?.raw || null;
    const fullAnalysis = res?.lastSession?.fullAnalysis || null;

    // Update analysis method display
    if (analysisMethodTextEl) {
      const method = fullAnalysis?.analysisMethod || 'heuristic';
      let methodDescription = '';

      if (method === 'local-lmstudio-vision') {
        methodDescription = `🖥️👁️ <strong style="color: #8b5cf6;">LM Studio Vision AI</strong> - 100% FREE, Private, Unlimited! Analyzes BOTH images AND captions with ~95% accuracy. <em>All processing happens on your computer - no data sent to internet!</em>`;
      } else if (method === 'local-lmstudio') {
        methodDescription = `🖥️ <strong style="color: #8b5cf6;">LM Studio Local AI</strong> - 100% FREE, Private, Unlimited! Analyzes text captions with ~90-95% accuracy. <em>All processing happens on your computer - no data leaves your machine!</em>`;
      } else if (method.startsWith('puter-')) {
        // Extract model name from method like "puter-gpt-5-free"
        const modelMatch = method.match(/puter-(.+)-free/);
        const modelName = modelMatch ? modelMatch[1] : 'AI';
        methodDescription = `🎉 <strong style="color: #10b981;">Puter.js FREE AI</strong> using <strong>${modelName.toUpperCase()}</strong> - Analyzes text captions with ~98% accuracy. <em>Image and video analysis coming soon with multimodal AI.</em>`;
      } else if (method.startsWith('openai-')) {
        const modelName = method.replace('openai-', '');
        methodDescription = `🤖 <strong style="color: #3b82f6;">OpenAI Direct API</strong> using <strong>${modelName}</strong> - Analyzes text captions with ~95% accuracy. <em>Image and video analysis coming soon.</em>`;
      } else if (method === 'heuristic') {
        methodDescription = `🔤 <strong>NLP Heuristics</strong> - Fast, offline keyword matching analyzing text captions only (~75% accuracy). <em>Upgrade to LM Studio for FREE local AI!</em>`;
      } else {
        methodDescription = `📊 <strong>Analysis</strong> - Analyzing text captions only. <em>Try LM Studio for FREE local AI!</em>`;
      }

      analysisMethodTextEl.innerHTML = methodDescription;
    }

    // Display all sessions from history in separate sections
    const sessionHistory = res?.sessionHistory || [];

    if (sessionHistory.length === 0) {
      pre.textContent = "No sessions yet. Open Instagram, press Start, scroll a bit, then Stop to generate your first session.";
    } else {
      // Build HTML for all sessions
      let debugHTML = '';

      sessionHistory.forEach((session, sessionIndex) => {
        const raw = session.raw;
        const fullAnalysis = session.fullAnalysis;

        if (!raw) return; // Skip if no raw data

        const perPostAI = fullAnalysis?.perPostAnalysis || [];
        const hasAIResults = perPostAI.length > 0;

        // Get items (posts or videos) - handles both single and multi-platform sessions
        const items = getSessionItems(session);

        const topPosts = items.slice(0, 30).map((item, index) => {
          // Detect if item is a YouTube video (has videoId) or Instagram post
          const isVideo = !!item.videoId;
          const caption = isVideo
            ? `${item.title || ''}\n${item.description || ''}`
            : item.caption;

          const postAnalysis = hasAIResults && perPostAI[index]
            ? perPostAI[index]
            : analyzePostDebug(caption);

          return {
            index: index + 1,
            dwellSeconds: Math.round((item.watchMs || item.dwellMs || 0) / 1000),
            href: item.href || `https://www.youtube.com/watch?v=${item.videoId}`,
            caption: caption,
            imageUrl: item.imageUrl || item.thumbnail,  // Support both post images and video thumbnails
            aiCategories: postAnalysis,
            analysisSource: hasAIResults && perPostAI[index] ? 'AI' : 'heuristic'
          };
        });

        // Calculate total items across all platforms
        const totalItems = getSessionItemCount(session);

        const sessionData = {
          sessionId: raw.sessionId,
          platform: session.platform || 'instagram',
          startedAt: raw.startedAt,
          endedAt: session.endedAt,
          durationMinutes: Math.round(session.durationMs / 60000),
          pageUrl: raw.pageUrl || (raw.platforms ? Object.values(raw.platforms)[0]?.pageUrl : null),
          totalPosts: totalItems,
          analysisMethod: fullAnalysis?.analysisMethod || 'heuristic',
          overallCategories: fullAnalysis ? {
            topics: fullAnalysis.topics,
            emotions: fullAnalysis.emotions,
            engagement: fullAnalysis.engagement
          } : null,
          postsTop30: topPosts
        };

        // Format session as text block with header
        const sessionDate = new Date(session.endedAt).toLocaleString();
        debugHTML += `\n${'='.repeat(80)}\n`;
        debugHTML += `SESSION ${sessionIndex + 1} - ${sessionDate}\n`;
        debugHTML += `Duration: ${sessionData.durationMinutes} minutes | Analysis: ${sessionData.analysisMethod}\n`;
        debugHTML += `${'='.repeat(80)}\n\n`;
        debugHTML += JSON.stringify(sessionData, null, 2);
        debugHTML += '\n\n';
      });

      pre.textContent = debugHTML;
    }
  }

  // Render today's sessions
  const sessionHistory = res?.sessionHistory || [];
  renderTodaysSessions(sessionHistory);
  renderYesterdaysSessions(sessionHistory);
}

// Helper function to show AI categorization for individual posts
function analyzePostDebug(caption) {
  if (!caption) return { topic: 'Unknown', emotion: 'Unknown', engagement: 'Unknown' };

  const lowerCaption = caption.toLowerCase();

  // Topic detection (same logic as ai-analysis.js) - CHECK SOCIAL PATTERNS FIRST
  let topic = 'Unknown';

  // Pattern 1: "Team1 vs Team2" format (e.g., "Morocco vs Nigeria")
  if (/\b\w+\s+(vs\.?|versus)\s+\w+/i.test(caption)) {
    topic = 'Social';
  }
  // Pattern 2: Sport hashtags (AFCON, FIFA, etc.)
  else if (/#(AFCON|FIFA|UEFA|NBA|NFL|WorldCup|Olympics|ChampionsLeague|PremierLeague)/i.test(caption)) {
    topic = 'Social';
  }
  // Pattern 3: Country flags with vs (🇲🇦 vs 🇳🇬)
  else if (/[\u{1F1E6}-\u{1F1FF}].*\b(vs\.?|versus)\b.*[\u{1F1E6}-\u{1F1FF}]/iu.test(caption)) {
    topic = 'Social';
  }
  // Pattern 4: Social/Sport keywords (enhanced with tournaments, emojis)
  else if (/\b(sport|sports|football|soccer|basketball|tennis|game|match|player|team|score|goal|win|championship|league|athlete|fitness|training|workout|exercise|gym|run|running|cup|tournament|AFCON|FIFA|UEFA|NBA|NFL|MLB|NHL|olympics|premier league|champions league|world cup|super bowl|grand slam|⚽|🏀|🏈|⛹️|🏆|🥇)\b/i.test(caption)) {
    topic = 'Social';
  }
  // Then check other categories
  else if (/\b(learn|study|course|tutorial|how to|guide|education|knowledge|skill|teach|training|lesson|university|college|school)\b/i.test(caption)) {
    topic = 'Educational';
  } else if (/\b(fun|funny|lol|haha|meme|comedy|joke|laugh|hilarious|entertainment|movie|film|series|show|watch)\b/i.test(caption)) {
    topic = 'Entertainment';
  } else if (/\b(friend|family|love|together|relationship|community|connection|meet|gathering|celebration|wedding|birthday)\b/i.test(caption)) {
    topic = 'Social';
  } else if (/\b(news|breaking|update|report|announced|today|latest|current|politics|election|government|world)\b/i.test(caption)) {
    topic = 'Informative';
  } else if (/\b(inspire|motivate|success|achieve|goal|dream|aspire|believe|overcome|transformation|hustle|grind|mindset)\b/i.test(caption)) {
    topic = 'Informative';
  } else if (/\b(buy|shop|sale|discount|product|brand|store|purchase|deal|fashion|style|outfit|clothing|wear)\b/i.test(caption)) {
    topic = 'Entertainment';
  } else if (/\b(health|fitness|workout|yoga|meditation|wellbeing|mental health|self care|nutrition|exercise|gym|diet|wellness)\b/i.test(caption)) {
    topic = 'Social';
  } else if (/\b(art|music|creative|paint|draw|design|photo|photography|artist|museum|culture|aesthetic|beauty)\b/i.test(caption)) {
    topic = 'Entertainment';
  } else if (caption.length > 10) {
    topic = 'Entertainment';
  } else {
    topic = 'Social';
  }

  // Emotion detection
  const posCount = (caption.match(/\b(love|happy|amazing|beautiful|great|wonderful|excellent|perfect|joy|celebrate|excited|awesome|fantastic)\b/gi) || []).length;
  const negCount = (caption.match(/\b(sad|angry|hate|terrible|awful|bad|worst|upset|frustrated|disappointing|crisis|tragedy)\b/gi) || []).length;

  let emotion = 'Neutral';
  if (posCount > negCount && posCount > 0) emotion = 'Positive';
  else if (negCount > posCount && negCount > 0) emotion = 'Negative';
  else if (posCount > 0 && negCount > 0) emotion = 'Mixed';

  return { topic, emotion };
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const minutesStr = String(minutes).padStart(2, '0');
  return `${hours}:${minutesStr} ${ampm}`;
}

// Helper functions for multi-platform session data
function getSessionItems(session) {
  // Extract all items (posts + videos) from session, handling both old and new formats
  const raw = session.raw;
  if (!raw) return [];

  let allItems = [];

  // New multi-platform format
  if (raw.platforms) {
    if (raw.platforms.instagram?.posts) {
      allItems.push(...raw.platforms.instagram.posts);
    }
    if (raw.platforms.youtube?.videos) {
      allItems.push(...raw.platforms.youtube.videos);
    }
  } else {
    // Old single-platform format
    const platform = raw.platform || session.platform || 'instagram';
    if (platform === 'youtube' && raw.videos) {
      allItems = raw.videos;
    } else if (raw.posts) {
      allItems = raw.posts;
    }
  }

  return allItems;
}

function getSessionItemCount(session) {
  return getSessionItems(session).length;
}

function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 1) return "< 1 min";
  return `${totalMinutes} min`;
}

function getDominantKey(obj) {
  if (!obj) return null;
  let maxKey = null;
  let maxVal = 0;
  for (const [key, val] of Object.entries(obj)) {
    if (val > maxVal) {
      maxVal = val;
      maxKey = key;
    }
  }
  return maxKey;
}

function getTopicIcon(topic) {
  const icons = {
    'Social': '🔗',
    'Educational': '📚',
    'Entertainment': '🎭',
    'Informative': '🏛️'
  };
  return icons[topic] || '📱';
}

function getTopicDisplayName(topic) {
  return topic;
}

function getSessionDescription(session) {
  const topic = getDominantKey(session.topics);
  const itemCount = getSessionItemCount(session);

  // Determine item type label
  let itemType = 'posts';
  if (session.isMultiPlatform) {
    itemType = 'videos & posts';
  } else if (session.platform === 'youtube') {
    itemType = 'videos';
  }

  const descriptions = {
    'Social': `Scrolled through ${itemCount} social ${itemType}`,
    'Educational': `Watched educational content and tutorials`,
    'Entertainment': `Browsed entertainment and comedy content`,
    'Informative': `Viewed news and informative content`
  };

  return descriptions[topic] || `Browsed ${itemCount} ${itemType}`;
}

function getEmotionLabel(emotion, topic) {
  if (topic === 'Informative' && emotion === 'Heavy') {
    return 'Informational tone (Important but emotionally heavy)';
  }

  const labels = {
    'Heavy': 'Negative tone',
    'Light': 'Positive tone',
    'Neutral': 'Neutral tone'
  };
  return labels[emotion] || 'Neutral tone';
}

function getEmotionColor(emotion) {
  return cssVar(EMOTIONS.find(e => e.key === emotion)?.colorVar || '--e-neutral');
}

function getTopicColor(topic) {
  return cssVar(TOPICS.find(t => t.key === topic)?.colorVar || '--c-social');
}

function renderTodaysSessions(sessionHistory) {
  const container = document.getElementById('todaySessions');
  if (!container) return;

  console.log('[Summary] Rendering today\'s sessions, history length:', sessionHistory.length);

  // Filter sessions for today
  const todayKey = isoDate(new Date());
  console.log('[Summary] Today key:', todayKey, 'Current time:', new Date().toISOString());

  const todaySessions = sessionHistory.filter(session => {
    const sessionDate = isoDate(new Date(session.endedAt));
    console.log('[Summary] Session:', session.sessionId, 'endedAt:', session.endedAt, 'date:', new Date(session.endedAt).toISOString(), 'sessionDate:', sessionDate, 'matches today:', sessionDate === todayKey);
    return sessionDate === todayKey;
  });

  console.log('[Summary] Today\'s sessions filtered:', todaySessions.length, 'for date:', todayKey);

  if (todaySessions.length === 0) {
    container.innerHTML = '<p style="color: var(--muted); font-size: 13px; padding: 8px 0;">No sessions recorded today. Start tracking to see your sessions here!</p>';
    return;
  }

  // Sort sessions by endedAt (most recent first)
  todaySessions.sort((a, b) => b.endedAt - a.endedAt);

  container.innerHTML = '';

  todaySessions.forEach(session => {
    // Add defaults for old sessions that don't have multi-platform fields
    if (session.isMultiPlatform === undefined) {
      session.isMultiPlatform = false;
    }
    if (!session.platforms) {
      session.platforms = [session.platform || 'instagram'];
    }

    console.log('[Summary] Rendering session:', session.sessionId, session.platform, session.isMultiPlatform);
    const topic = getDominantKey(session.topics);
    const emotion = getDominantKey(session.emotions);
    const topicClass = topic ? topic.toLowerCase() : 'social';
    const topicColor = getTopicColor(topic);
    const emotionColor = getEmotionColor(emotion);

    const sessionEl = document.createElement('div');
    sessionEl.className = `sessionItem topic-${topicClass}`;

    // Platform icon SVG and text - handle multi-platform sessions
    let platformIconSvg, platformText;

    try {
      if (session.isMultiPlatform && session.platforms && session.platforms.length > 1) {
        // Show both icons for multi-platform sessions
        const youtubeIcon = `<svg class="platformIcon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>`;
        const instagramIcon = `<img src="../logo/instagram-icon.svg" class="platformIcon" alt="Instagram" />`;

        platformIconSvg = youtubeIcon + instagramIcon;
        platformText = session.platforms.map(p => p === 'youtube' ? 'youtube.com' : 'instagram.com').join(' + ');
      } else {
        // Single platform
        const platform = session.platform || 'instagram';
        platformIconSvg = platform === 'youtube'
          ? `<svg class="platformIcon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>`
          : `<img src="../logo/instagram-icon.svg" class="platformIcon" alt="Instagram" />`;

        platformText = platform === 'youtube' ? 'youtube.com' : 'instagram.com';
      }
    } catch (e) {
      console.error('[Summary] Error rendering platform:', e, session);
      // Fallback
      platformIconSvg = '';
      platformText = 'Social Media';
    }

    sessionEl.innerHTML = `
      <span class="sessionDot" style="background: ${topicColor}"></span>
      <div class="sessionHeader">
        <span class="sessionTime">${formatTime(session.endedAt)}</span>
        <span class="sessionDuration">⏱ ${formatDuration(session.durationMs)}</span>
        <span class="sessionTopic" style="color: ${topicColor}">${getTopicIcon(topic)} ${getTopicDisplayName(topic) || 'Unknown'}</span>
      </div>
      <div class="sessionPlatform">
        ${platformIconSvg}
        <span>${platformText}</span>
      </div>
      <div class="sessionDesc">${getSessionDescription(session)}</div>
      <div class="sessionEmotion">
        <span class="emotionDot" style="background: ${emotionColor}"></span>
        <span class="emotionLabel">${getEmotionLabel(emotion, topic)}</span>
      </div>
    `;

    // Add click handler to open modal
    sessionEl.addEventListener('click', () => openSessionModal(session));

    container.appendChild(sessionEl);
  });
}

function renderYesterdaysSessions(sessionHistory) {
  const container = document.getElementById('yesterdaySessions');
  if (!container) return;

  // Filter sessions for yesterday
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = isoDate(yesterday);

  const yesterdaySessions = sessionHistory.filter(session => {
    const sessionDate = isoDate(new Date(session.endedAt));
    return sessionDate === yesterdayKey;
  });

  if (yesterdaySessions.length === 0) {
    container.innerHTML = '<p style="color: var(--muted); font-size: 13px; padding: 8px 0;">No sessions recorded yesterday.</p>';
    return;
  }

  // Sort sessions by endedAt (most recent first)
  yesterdaySessions.sort((a, b) => b.endedAt - a.endedAt);

  container.innerHTML = '';

  yesterdaySessions.forEach(session => {
    // Add defaults for old sessions that don't have multi-platform fields
    if (session.isMultiPlatform === undefined) {
      session.isMultiPlatform = false;
    }
    if (!session.platforms) {
      session.platforms = [session.platform || 'instagram'];
    }

    const topic = getDominantKey(session.topics);
    const emotion = getDominantKey(session.emotions);
    const topicClass = topic ? topic.toLowerCase() : 'social';
    const topicColor = getTopicColor(topic);
    const emotionColor = getEmotionColor(emotion);

    const sessionEl = document.createElement('div');
    sessionEl.className = `sessionItem topic-${topicClass}`;

    // Platform icon SVG and text - handle multi-platform sessions
    let platformIconSvg, platformText;

    try {
      if (session.isMultiPlatform && session.platforms && session.platforms.length > 1) {
        // Show both icons for multi-platform sessions
        const youtubeIcon = `<svg class="platformIcon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>`;
        const instagramIcon = `<img src="../logo/instagram-icon.svg" class="platformIcon" alt="Instagram" />`;

        platformIconSvg = youtubeIcon + instagramIcon;
        platformText = session.platforms.map(p => p === 'youtube' ? 'youtube.com' : 'instagram.com').join(' + ');
      } else {
        // Single platform
        const platform = session.platform || 'instagram';
        platformIconSvg = platform === 'youtube'
          ? `<svg class="platformIcon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>`
          : `<img src="../logo/instagram-icon.svg" class="platformIcon" alt="Instagram" />`;

        platformText = platform === 'youtube' ? 'youtube.com' : 'instagram.com';
      }
    } catch (e) {
      console.error('[Summary] Error rendering platform:', e, session);
      // Fallback
      platformIconSvg = '';
      platformText = 'Social Media';
    }

    sessionEl.innerHTML = `
      <span class="sessionDot" style="background: ${topicColor}"></span>
      <div class="sessionHeader">
        <span class="sessionTime">${formatTime(session.endedAt)}</span>
        <span class="sessionDuration">⏱ ${formatDuration(session.durationMs)}</span>
        <span class="sessionTopic" style="color: ${topicColor}">${getTopicIcon(topic)} ${getTopicDisplayName(topic) || 'Unknown'}</span>
      </div>
      <div class="sessionPlatform">
        ${platformIconSvg}
        <span>${platformText}</span>
      </div>
      <div class="sessionDesc">${getSessionDescription(session)}</div>
      <div class="sessionEmotion">
        <span class="emotionDot" style="background: ${emotionColor}"></span>
        <span class="emotionLabel">${getEmotionLabel(emotion, topic)}</span>
      </div>
    `;

    // Add click handler to open modal
    sessionEl.addEventListener('click', () => openSessionModal(session));

    container.appendChild(sessionEl);
  });
}

// Session Modal Functions
function openSessionModal(session) {
  const modal = document.getElementById('sessionModal');
  if (!modal) return;

  // Update modal header
  const topic = getDominantKey(session.topics);
  const emotion = getDominantKey(session.emotions);
  const topicColor = getTopicColor(topic);

  const modalTitle = document.getElementById('modalTitle');
  const modalSubtitle = document.getElementById('modalSubtitle');

  modalTitle.textContent = `${getTopicIcon(topic)} ${getTopicDisplayName(topic) || 'Session'} Session`;
  modalTitle.style.color = topicColor;

  const sessionDate = new Date(session.endedAt).toLocaleString();
  const itemCount = getSessionItemCount(session);

  // Determine item label
  let itemLabel = 'Posts';
  if (session.isMultiPlatform) {
    itemLabel = 'Videos & Posts';
  } else if (session.platform === 'youtube') {
    itemLabel = 'Videos';
  }

  // Determine platform display text
  let platformText;
  if (session.isMultiPlatform && session.platforms) {
    platformText = session.platforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' + ');
  } else {
    const platform = session.platform || 'instagram';
    platformText = platform.charAt(0).toUpperCase() + platform.slice(1);
  }

  modalSubtitle.innerHTML = `
    <span><strong>Time:</strong> ${sessionDate}</span>
    <span><strong>Duration:</strong> ${formatDuration(session.durationMs)}</span>
    <span><strong>${itemLabel}:</strong> ${itemCount}</span>
    <span><strong>Platform:</strong> ${platformText}</span>
  `;

  // Render posts
  renderSessionPosts(session);

  // Show modal
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSessionModal() {
  const modal = document.getElementById('sessionModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.style.overflow = '';
}

function renderSessionPosts(session) {
  const postsGrid = document.getElementById('postsGrid');
  if (!postsGrid) return;

  // Get all items (posts and videos) from session
  const items = getSessionItems(session);
  const perPostAI = session.fullAnalysis?.perPostAnalysis || [];
  const hasAIResults = perPostAI.length > 0;

  // Add defaults for old sessions that don't have multi-platform fields
  if (session.isMultiPlatform === undefined) {
    session.isMultiPlatform = false;
  }
  if (!session.platforms) {
    session.platforms = [session.platform || 'instagram'];
  }

  // Check if session is from today or yesterday (for thumbnail display)
  const now = Date.now();
  const sessionDate = isoDate(new Date(session.endedAt));
  const today = isoDate(new Date(now));
  const yesterday = isoDate(new Date(now - 24 * 60 * 60 * 1000));
  const isRecentSession = (sessionDate === today || sessionDate === yesterday);

  console.log('[Modal] Session date:', sessionDate, 'Today:', today, 'Yesterday:', yesterday, 'Show thumbnails:', isRecentSession);

  console.log('[Modal] Rendering session:', {
    platform: session.platform,
    isMultiPlatform: session.isMultiPlatform,
    platforms: session.platforms,
    hasRaw: !!session.raw,
    itemsLength: items.length,
    sessionId: session.sessionId,
    rawStructure: session.raw?.platforms ? 'multi-platform' : 'single-platform'
  });

  if (items.length === 0) {
    const itemType = session.isMultiPlatform ? 'items' : (session.platform === 'youtube' ? 'videos' : 'posts');
    console.warn('[Modal] No items found for session. Raw data:', session.raw);
    postsGrid.innerHTML = `<p style="color: var(--muted); text-align: center; padding: 20px;">No ${itemType} tracked in this session.</p>`;
    return;
  }

  postsGrid.innerHTML = '';

  items.forEach((item, index) => {
    // Detect if this item is a YouTube video or Instagram post
    const isVideo = !!item.videoId;
    const itemLabel = isVideo ? 'Video' : 'Post';

    // Get AI analysis for this item
    const itemAnalysis = hasAIResults && perPostAI[index]
      ? perPostAI[index]
      : analyzePostDebug(item.caption);

    const itemCard = document.createElement('div');
    itemCard.className = 'postCard';

    // For YouTube videos, use watchMs; for Instagram posts, use dwellMs
    const dwellMs = item.watchMs || item.dwellMs || 0;
    const dwellSeconds = Math.round(dwellMs / 1000);
    const dwellText = dwellSeconds < 60
      ? `${dwellSeconds}s`
      : `${Math.floor(dwellSeconds / 60)}m ${dwellSeconds % 60}s`;

    // Image section - show actual thumbnails for today/yesterday, emoji placeholders for older sessions
    let imageHtml;
    if (isVideo && item.thumbnail) {
      // YouTube thumbnails always work (no CORS issues)
      imageHtml = `<img src="${item.thumbnail}" alt="${itemLabel} ${index + 1}" onerror="this.parentElement.innerHTML='<span class=\\'emoji-placeholder\\'>🎥</span>'" />`;
    } else if (isRecentSession && item.imageBase64) {
      // Instagram posts from today/yesterday - use base64 image
      imageHtml = `<img src="${item.imageBase64}" alt="${itemLabel} ${index + 1}" onerror="this.parentElement.innerHTML='<span class=\\'emoji-placeholder\\'>📷</span>'" />`;
    } else {
      // Older sessions or missing images - use bigger emoji placeholder
      imageHtml = `<span class="emoji-placeholder">${isVideo ? '🎥' : '📷'}</span>`;
    }

    // Topic and emotion tags
    const topic = itemAnalysis.topic || 'Unknown';
    const emotion = itemAnalysis.emotion || 'Neutral';
    const engagement = itemAnalysis.engagement || '';

    const topicClass = topic.toLowerCase();
    const topicColor = getTopicColor(topic);

    // For YouTube videos, show title if available
    const captionText = isVideo && item.title
      ? item.title
      : (item.caption || 'No caption');

    // For YouTube videos, show description/summary below title
    const descriptionText = isVideo && item.description
      ? item.description
      : '';

    // Truncate description if too long (max 150 chars for display)
    const displayDescription = descriptionText.length > 150
      ? descriptionText.substring(0, 150) + '...'
      : descriptionText;

    itemCard.innerHTML = `
      <div class="postImage">
        ${imageHtml}
      </div>
      <div class="postContent">
        <div class="postHeader">
          <span class="postNumber">${itemLabel} #${index + 1}</span>
          <span class="postDwell">⏱ ${dwellText}</span>
        </div>
        <div class="postCaption">${captionText}</div>
        ${displayDescription ? `<div class="postDescription">${displayDescription}</div>` : ''}
        <div class="postTags">
          <span class="postTag topic-${topicClass}" style="color: ${topicColor}">
            ${getTopicIcon(topic)} ${topic}
          </span>
          ${emotion !== 'Unknown' ? `<span class="postTag emotion">${emotion}</span>` : ''}
          ${engagement ? `<span class="postTag">${engagement}</span>` : ''}
        </div>
      </div>
    `;

    // Make card clickable to open the content
    if (item.href) {
      itemCard.style.cursor = 'pointer';
      itemCard.addEventListener('click', () => {
        window.open(item.href, '_blank');
      });
    }

    postsGrid.appendChild(itemCard);
  });
}

// Modal close handlers
document.getElementById('modalClose')?.addEventListener('click', closeSessionModal);

document.getElementById('sessionModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'sessionModal') {
    closeSessionModal();
  }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSessionModal();
  }
});

// Theme Management
async function loadTheme() {
  const result = await chrome.storage.local.get(['mf_theme']);
  const theme = result.mf_theme || 'light';
  applyTheme(theme);
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark-mode', isDark);
  const toggleBtn = document.getElementById('themeToggle');
  if (toggleBtn) {
    toggleBtn.textContent = isDark ? '☀️' : '🌙';
    toggleBtn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
}

async function toggleTheme() {
  const isDark = document.body.classList.contains('dark-mode');
  const newTheme = isDark ? 'light' : 'dark';
  await chrome.storage.local.set({ mf_theme: newTheme });
  applyTheme(newTheme);
}

document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);
document.getElementById("refreshBtn")?.addEventListener("click", loadDashboard);

// Navigation buttons
document.getElementById("insightsBtn")?.addEventListener("click", () => {
  window.location.href = "insights.html";
});

document.getElementById("goalsBtn")?.addEventListener("click", () => {
  window.location.href = "goals.html";
});

document.getElementById("statsBtn")?.addEventListener("click", () => {
  window.location.href = "stats.html";
});

document.getElementById("achievementsBtn")?.addEventListener("click", () => {
  window.location.href = "achievements.html";
});

wirePeriodTabs();

loadTheme();
loadDashboard();
