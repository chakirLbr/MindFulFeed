const TOPICS = [
  { key: "Education", colorVar: "--c-edu" },
  { key: "Fun", colorVar: "--c-fun" },
  { key: "Sport", colorVar: "--c-sport" },
  { key: "News", colorVar: "--c-news" }
];

const EMOTIONS = [
  { key: "Heavy", colorVar: "--e-heavy", desc: "Content with heavy emotions" },
  { key: "Light", colorVar: "--e-light", desc: "Content with light emotions" },
  { key: "Neutral", colorVar: "--e-neutral", desc: "Neutral content" }
];

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
  const largeArc = endAngle - startAngle <= Math.PI ? 0 : 1;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
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
  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_DASHBOARD" }, (r) => resolve(r));
  });

  cachedRes = res;

  const daily = res?.daily || {};
  cachedDaily = daily;
  const todayKey = isoDate(new Date());
  const today = daily[todayKey] || {
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

  // If the user never stopped a session yet, show last running time as today's total (so the dashboard isn't blank).
  const fallbackTotal = res?.elapsedMs && res?.elapsedMs > 0 ? res.elapsedMs : 0;
  const totalMs = today.totalMs || fallbackTotal;

  // If today has no analytics yet, fake a simple even split so UI is not empty.
  const topicsMs = (today.totalMs > 0) ? today.topics : {
    Education: Math.round(totalMs * 0.25),
    Fun: Math.round(totalMs * 0.25),
    Sport: Math.round(totalMs * 0.25),
    News: totalMs - 3 * Math.round(totalMs * 0.25)
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

  // Temporary debug dump (remove later)
  const pre = document.getElementById("rawDump");
  if (pre) {
    const raw = res?.lastSession?.raw || null;
    if (!raw) {
      pre.textContent = "No raw session data yet. Open Instagram Home Feed, press Start, scroll a bit, then Stop.";
    } else {
      const topPosts = (raw.posts || []).slice(0, 10).map((p) => ({
        dwellMs: p.dwellMs,
        href: p.href,
        caption: p.caption
      }));
      pre.textContent = JSON.stringify({
        sessionId: raw.sessionId,
        startedAt: raw.startedAt,
        pageUrl: raw.pageUrl,
        activeKey: raw.activeKey,
        postsTop10: topPosts
      }, null, 2);
    }
  }
}

document.getElementById("refreshBtn")?.addEventListener("click", loadDashboard);

wirePeriodTabs();

loadDashboard();
