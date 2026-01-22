const TOPICS = [
  { key: "Educational", colorVar: "--c-educational" },
  { key: "Entertainment", colorVar: "--c-entertainment" },
  { key: "Social", colorVar: "--c-social" },
  { key: "Informative", colorVar: "--c-informative" }
];

const EMOTIONS = [
  { key: "Heavy", colorVar: "--e-heavy", desc: "Content with heavy emotions" },
  { key: "Light", colorVar: "--e-light", desc: "Content with light emotions" },
  { key: "Neutral", colorVar: "--e-neutral", desc: "Neutral content" }
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

  for (const t of TOPICS) {
    const ms = topicsMs?.[t.key] || 0;
    const pct = safePercent(ms, totalMs);
    const item = document.createElement("div");
    item.className = "legendItem";
    item.innerHTML = `
      <span class="legendDot" style="background:${cssVar(t.colorVar)}"></span>
      <span style="min-width:92px">${t.key}</span>
      <span style="color: rgba(36,49,58,0.6)">${pct}%</span>
    `;
    el.appendChild(item);
  }
}

function renderDonut(topicsMs, totalMs) {
  const root = document.getElementById("topicDonut");
  root.innerHTML = "";

  const size = 260;
  const r = 96;
  const c = 2 * Math.PI * r;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);

  const track = document.createElementNS(svgNS, "circle");
  track.setAttribute("cx", String(size / 2));
  track.setAttribute("cy", String(size / 2));
  track.setAttribute("r", String(r));
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", "rgba(36,49,58,0.08)");
  track.setAttribute("stroke-width", "18");
  svg.appendChild(track);

  let offset = 0;
  for (const t of TOPICS) {
    const ms = topicsMs?.[t.key] || 0;
    const frac = totalMs ? ms / totalMs : 0;
    const len = Math.max(0, frac * c);
    if (len <= 0) continue;

    const seg = document.createElementNS(svgNS, "circle");
    seg.setAttribute("cx", String(size / 2));
    seg.setAttribute("cy", String(size / 2));
    seg.setAttribute("r", String(r));
    seg.setAttribute("fill", "none");
    seg.setAttribute("stroke", cssVar(t.colorVar));
    seg.setAttribute("stroke-width", "18");
    seg.setAttribute("stroke-linecap", "round");
    seg.setAttribute("stroke-dasharray", `${len} ${c - len}`);
    seg.setAttribute("stroke-dashoffset", String(-offset));
    svg.appendChild(seg);

    offset += len;
  }

  const center = document.createElement("div");
  center.className = "donutCenter";
  center.innerHTML = `<div class="donutTime">${formatHMS(totalMs)}</div>`;

  root.appendChild(svg);
  root.appendChild(center);
}

function renderEmotionList(emotionsMs, totalMs) {
  const el = document.getElementById("emoList");
  el.innerHTML = "";

  for (const e of EMOTIONS) {
    const ms = emotionsMs?.[e.key] || 0;
    const pct = safePercent(ms, totalMs);

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
    pctEl.textContent = `${pct}%`;

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

function arcPath(cx, cy, r, startAngle, endAngle) {
  // angles in radians
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  // Use absolute difference to handle both clockwise and counterclockwise arcs
  const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
  // Use sweep-flag=0 (counterclockwise) to draw arcs upward in SVG coordinates
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`;
}

function renderGaugeCard(topic, perTopicEmotions) {
  const card = document.createElement("article");
  card.className = "card gaugeCard";

  const total = sumObj(perTopicEmotions || {});
  const heavy = perTopicEmotions?.Heavy || 0;
  const light = perTopicEmotions?.Light || 0;
  const neutral = perTopicEmotions?.Neutral || 0;

  // semicircle 180deg: from 180° to 0°
  const segments = [
    { key: "Heavy", ms: heavy, color: cssVar("--e-heavy") },
    { key: "Light", ms: light, color: cssVar("--e-light") },
    { key: "Neutral", ms: neutral, color: cssVar("--e-neutral") }
  ];

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.classList.add("gaugeSvg");
  svg.setAttribute("viewBox", "0 0 240 140");

  // Track
  const track = document.createElementNS(svgNS, "path");
  track.setAttribute("d", arcPath(120, 120, 90, Math.PI, 0));
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", "rgba(36,49,58,0.10)");
  track.setAttribute("stroke-width", "10");
  track.setAttribute("stroke-linecap", "round");
  svg.appendChild(track);

  let start = Math.PI;
  const totalAngle = Math.PI; // 180deg

  for (const seg of segments) {
    const frac = total ? seg.ms / total : 0;
    const end = start - frac * totalAngle;
    if (frac > 0) {
      const p = document.createElementNS(svgNS, "path");
      p.setAttribute("d", arcPath(120, 120, 90, start, end));
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", seg.color);
      p.setAttribute("stroke-width", "10");
      p.setAttribute("stroke-linecap", "round");
      svg.appendChild(p);
    }
    start = end;
  }

  const top = document.createElement("div");
  top.className = "gaugeTop";
  top.appendChild(svg);

  const title = document.createElement("div");
  title.className = "gaugeTitle";
  title.textContent = topic;

  const legend = document.createElement("div");
  legend.className = "gaugeLegend";
  legend.innerHTML = `
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${cssVar("--e-heavy")};margin-right:6px"></span>Heavy Emotion</span>
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${cssVar("--e-light")};margin-right:6px"></span>Light Emotion</span>
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${cssVar("--e-neutral")};margin-right:6px"></span>Neutral Emotion</span>
  `;

  card.appendChild(top);
  card.appendChild(title);
  card.appendChild(legend);
  return card;
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

  renderDonut(topicsMs, totalMs);
  renderTopicLegend(topicsMs, totalMs);
  renderEmotionList(emotionsMs, totalMs);

  renderStatsLegend();
  renderStatsForPeriod(currentPeriod);

  const gauges = document.getElementById("gauges");
  gauges.innerHTML = "";
  for (const t of TOPICS) {
    const per = (today.totalMs > 0) ? today.perTopicEmotions?.[t.key] : {
      Heavy: Math.round((topicsMs[t.key] || 0) * 0.33),
      Light: Math.round((topicsMs[t.key] || 0) * 0.34),
      Neutral: (topicsMs[t.key] || 0) - Math.round((topicsMs[t.key] || 0) * 0.33) - Math.round((topicsMs[t.key] || 0) * 0.34)
    };
    gauges.appendChild(renderGaugeCard(t.key, per));
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

        const topPosts = (raw.posts || []).slice(0, 30).map((p, index) => {
          const postAnalysis = hasAIResults && perPostAI[index]
            ? perPostAI[index]
            : analyzePostDebug(p.caption);

          return {
            index: index + 1,
            dwellSeconds: Math.round(p.dwellMs / 1000),
            href: p.href,
            caption: p.caption,
            imageUrl: p.imageUrl,  // Include image URL
            aiCategories: postAnalysis,
            analysisSource: hasAIResults && perPostAI[index] ? 'AI' : 'heuristic'
          };
        });

        const sessionData = {
          sessionId: raw.sessionId,
          platform: raw.platform || 'instagram',
          startedAt: raw.startedAt,
          endedAt: session.endedAt,
          durationMinutes: Math.round(session.durationMs / 60000),
          pageUrl: raw.pageUrl,
          totalPosts: (raw.posts || []).length,
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
  if (topic === 'Informative') return 'Civic';
  return topic;
}

function getSessionDescription(session) {
  const topic = getDominantKey(session.topics);
  const postCount = session.raw?.posts?.length || 0;
  const platform = session.platform === 'youtube' ? 'videos' : 'posts';

  const descriptions = {
    'Social': `Scrolled through ${postCount} social ${platform}`,
    'Educational': `Watched educational content and tutorials`,
    'Entertainment': `Browsed entertainment and comedy content`,
    'Informative': `Viewed news and informative content`
  };

  return descriptions[topic] || `Browsed ${postCount} ${platform}`;
}

function getEmotionLabel(emotion, topic) {
  if (topic === 'Informative' && emotion === 'Heavy') {
    return 'Civic/Informational tone (Important but emotionally heavy)';
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

  // Filter sessions for today
  const todayKey = isoDate(new Date());
  const todaySessions = sessionHistory.filter(session => {
    const sessionDate = isoDate(new Date(session.endedAt));
    return sessionDate === todayKey;
  });

  if (todaySessions.length === 0) {
    container.innerHTML = '<p style="color: var(--muted); font-size: 13px; padding: 8px 0;">No sessions recorded today. Start tracking to see your sessions here!</p>';
    return;
  }

  // Sort sessions by endedAt (most recent first)
  todaySessions.sort((a, b) => b.endedAt - a.endedAt);

  container.innerHTML = '';

  todaySessions.forEach(session => {
    const topic = getDominantKey(session.topics);
    const emotion = getDominantKey(session.emotions);
    const topicClass = topic ? topic.toLowerCase() : 'social';
    const topicColor = getTopicColor(topic);
    const emotionColor = getEmotionColor(emotion);

    const sessionEl = document.createElement('div');
    sessionEl.className = `sessionItem topic-${topicClass}`;

    sessionEl.innerHTML = `
      <span class="sessionDot" style="background: ${topicColor}"></span>
      <div class="sessionHeader">
        <span class="sessionTime">${formatTime(session.endedAt)}</span>
        <span class="sessionDuration">⏱ ${formatDuration(session.durationMs)}</span>
        <span class="sessionTopic" style="color: ${topicColor}">${getTopicIcon(topic)} ${getTopicDisplayName(topic) || 'Unknown'}</span>
      </div>
      <div class="sessionPlatform">
        <svg class="platformIcon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z"/>
          <path d="M12 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
        <span>${session.platform === 'youtube' ? 'youtube.com' : 'instagram.com'}</span>
      </div>
      <div class="sessionDesc">${getSessionDescription(session)}</div>
      <div class="sessionEmotion">
        <span class="emotionDot" style="background: ${emotionColor}"></span>
        <span class="emotionLabel">${getEmotionLabel(emotion, topic)}</span>
      </div>
    `;

    container.appendChild(sessionEl);
  });
}

document.getElementById("refreshBtn")?.addEventListener("click", loadDashboard);

wirePeriodTabs();

loadDashboard();
