// Insights Page - Personal reflection trends and insights
// Displays reflection analytics, mood patterns, and personalized recommendations

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

document.addEventListener('DOMContentLoaded', async () => {
  await loadTheme();
  await loadInsights();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

  document.getElementById('backBtn')?.addEventListener('click', () => {
    window.location.href = 'summary.html';
  });

  // Navigation menu
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.getAttribute('data-page');
      if (page) {
        window.location.href = page;
      }
    });
  });
}

async function loadInsights() {
  try {
    // Get reflection trends from background
    const response = await chrome.runtime.sendMessage({
      type: 'GET_REFLECTION_TRENDS'
    });

    if (response && response.ok && response.data) {
      renderInsights(response.data);
    } else {
      showNoDataMessage();
    }
  } catch (error) {
    console.error('Error loading insights:', error);
    showNoDataMessage();
  }
}

function renderInsights(data) {
  const { averages, dominantMood, trends, totalReflections, insights, recent } = data;

  // Update stats overview
  document.getElementById('totalReflections').textContent = totalReflections || 0;

  if (averages) {
    document.getElementById('avgAwareness').textContent = averages.awareness
      ? averages.awareness.toFixed(1) + '/5'
      : '-';
    document.getElementById('avgValue').textContent = averages.value
      ? averages.value.toFixed(1) + '/5'
      : '-';
    document.getElementById('avgControl').textContent = averages.control
      ? averages.control.toFixed(1) + '/5'
      : '-';
  }

  // Render personalized insights
  if (insights && insights.length > 0) {
    renderPersonalizedInsights(insights);
  } else {
    showNoInsights();
  }

  // Render trend charts
  if (recent && recent.length > 0) {
    renderTrendCharts(recent, averages, trends);
  }

  // Render mood distribution
  if (recent && recent.length > 0) {
    renderMoodChart(recent, dominantMood);
  }

  // Render recent reflections
  if (recent && recent.length > 0) {
    renderRecentReflections(recent);
  } else {
    showNoReflections();
  }
}

function renderPersonalizedInsights(insights) {
  const container = document.getElementById('insightsContainer');
  const noInsightsMsg = document.getElementById('noInsights');

  container.innerHTML = '';
  noInsightsMsg.style.display = 'none';

  insights.forEach(insight => {
    const insightCard = document.createElement('div');
    insightCard.className = `insight-card insight-${insight.type}`;

    const icon = getInsightIcon(insight.type);

    insightCard.innerHTML = `
      <div class="insight-icon">${icon}</div>
      <div class="insight-content">
        <p class="insight-message">${insight.message}</p>
        ${insight.action ? `<button class="insight-action" data-action="${insight.action}">${insight.action}</button>` : ''}
      </div>
    `;

    container.appendChild(insightCard);
  });

  // Add event listeners for action buttons
  container.querySelectorAll('.insight-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      handleInsightAction(e.target.dataset.action);
    });
  });
}

function getInsightIcon(type) {
  const icons = {
    positive: '🌟',
    concern: '⚠️',
    warning: '🔔',
    suggestion: '💡'
  };
  return icons[type] || '💡';
}

function handleInsightAction(action) {
  // Handle different insight actions
  if (action === 'Set Goals' || action === 'Review Goals') {
    window.location.href = 'goals.html';
  } else if (action === 'Set Intention') {
    // Could open a modal or navigate to goals
    window.location.href = 'goals.html';
  }
}

function showNoInsights() {
  document.getElementById('insightsContainer').innerHTML = '';
  document.getElementById('noInsights').style.display = 'flex';
}

function renderTrendCharts(reflections, averages, trends) {
  // Create simple canvas-based trend lines for awareness, value, control
  renderTrendLine('awarenessChart', reflections, 'awareness', averages?.awareness, trends?.awareness);
  renderTrendLine('valueChart', reflections, 'value', averages?.value, trends?.value);
  renderTrendLine('controlChart', reflections, 'control', averages?.control, trends?.control);
}

function renderTrendLine(canvasId, reflections, field, average, trend) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.offsetWidth || 300;
  const height = 150;
  canvas.width = width;
  canvas.height = height;

  // Extract values
  const values = reflections
    .map(r => r.responses?.[field])
    .filter(v => typeof v === 'number');

  if (values.length === 0) {
    ctx.fillStyle = '#666';
    ctx.font = '14px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', width / 2, height / 2);
    return;
  }

  // Draw chart
  const padding = 30;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const stepX = chartWidth / Math.max(values.length - 1, 1);
  const maxY = 5; // Scale is 1-5

  // Draw grid lines
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padding + chartHeight - (i / maxY) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  // Draw line
  ctx.strokeStyle = getTrendColor(field);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  values.forEach((value, i) => {
    const x = padding + i * stepX;
    const y = padding + chartHeight - (value / maxY) * chartHeight;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  // Draw points
  values.forEach((value, i) => {
    const x = padding + i * stepX;
    const y = padding + chartHeight - (value / maxY) * chartHeight;

    ctx.fillStyle = getTrendColor(field);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Update trend badge and average
  const trendBadge = document.getElementById(`${field}Trend`);
  const avgDisplay = document.getElementById(`${field}Avg`);

  if (trendBadge) {
    trendBadge.textContent = getTrendLabel(trend);
    trendBadge.className = `trend-badge trend-${trend}`;
  }

  if (avgDisplay && average !== null) {
    avgDisplay.textContent = average.toFixed(1);
  }
}

function getTrendColor(field) {
  const colors = {
    awareness: '#4a9eff',
    value: '#9b59b6',
    control: '#2ecc71'
  };
  return colors[field] || '#4a9eff';
}

function getTrendLabel(trend) {
  const labels = {
    improving: '📈 Improving',
    declining: '📉 Declining',
    stable: '➡️ Stable',
    insufficient_data: '-'
  };
  return labels[trend] || '-';
}

function renderMoodChart(reflections, dominantMood) {
  const moodChart = document.getElementById('moodChart');
  const moodInsight = document.getElementById('moodInsight');

  if (!moodChart) return;

  // Count moods
  const moodCounts = {};
  reflections.forEach(r => {
    const mood = r.responses?.mood;
    if (mood) {
      moodCounts[mood] = (moodCounts[mood] || 0) + 1;
    }
  });

  const total = Object.values(moodCounts).reduce((sum, count) => sum + count, 0);

  if (total === 0) {
    moodChart.innerHTML = '<p style="text-align: center; color: #666;">No mood data yet</p>';
    return;
  }

  // Mood metadata
  const moodMeta = {
    energized: { emoji: '⚡', label: 'Energized', color: '#f39c12' },
    relaxed: { emoji: '😌', label: 'Relaxed', color: '#2ecc71' },
    neutral: { emoji: '😐', label: 'Neutral', color: '#95a5a6' },
    drained: { emoji: '😴', label: 'Drained', color: '#3498db' },
    anxious: { emoji: '😰', label: 'Anxious', color: '#e74c3c' }
  };

  // Render mood bars
  moodChart.innerHTML = '';

  Object.entries(moodCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([mood, count]) => {
      const meta = moodMeta[mood] || { emoji: '😐', label: mood, color: '#666' };
      const percentage = (count / total) * 100;

      const moodBar = document.createElement('div');
      moodBar.className = 'mood-bar';
      moodBar.innerHTML = `
        <div class="mood-label">
          <span class="mood-emoji">${meta.emoji}</span>
          <span class="mood-name">${meta.label}</span>
        </div>
        <div class="mood-bar-container">
          <div class="mood-bar-fill" style="width: ${percentage}%; background: ${meta.color};"></div>
        </div>
        <div class="mood-percentage">${percentage.toFixed(0)}%</div>
      `;

      moodChart.appendChild(moodBar);
    });

  // Show insight about dominant mood
  if (dominantMood && moodInsight) {
    const meta = moodMeta[dominantMood] || {};
    const percentage = ((moodCounts[dominantMood] || 0) / total * 100).toFixed(0);

    const insightMessages = {
      energized: `Great! Social media energizes you ${percentage}% of the time. You're using it in a positive way.`,
      relaxed: `You feel relaxed after most sessions (${percentage}%). Social media is helping you unwind.`,
      neutral: `You feel neutral most of the time (${percentage}%). Consider if your usage aligns with your values.`,
      drained: `Social media often leaves you drained (${percentage}% of sessions). This may be worth reflecting on.`,
      anxious: `You often feel anxious after sessions (${percentage}%). Consider setting boundaries or limiting exposure.`
    };

    moodInsight.innerHTML = `
      <div class="mood-insight-icon">${meta.emoji || '💭'}</div>
      <p>${insightMessages[dominantMood] || 'Keep tracking your mood to see patterns over time.'}</p>
    `;
  }
}

function renderRecentReflections(reflections) {
  const container = document.getElementById('recentReflections');
  const noReflectionsMsg = document.getElementById('noReflections');

  if (!container) return;

  container.innerHTML = '';
  noReflectionsMsg.style.display = 'none';

  // Show last 5 reflections
  const recent = reflections.slice(-5).reverse();

  recent.forEach(reflection => {
    const { timestamp, responses } = reflection;
    const date = new Date(timestamp);

    const reflectionCard = document.createElement('div');
    reflectionCard.className = 'reflection-card';

    // Format mood emoji
    const moodEmojis = {
      energized: '⚡',
      relaxed: '😌',
      neutral: '😐',
      drained: '😴',
      anxious: '😰'
    };
    const moodEmoji = moodEmojis[responses?.mood] || '😐';

    reflectionCard.innerHTML = `
      <div class="reflection-header">
        <div class="reflection-date">${formatDate(date)}</div>
        <div class="reflection-mood">${moodEmoji} ${capitalize(responses?.mood || 'N/A')}</div>
      </div>
      <div class="reflection-scores">
        <div class="score-item">
          <span class="score-label">Awareness:</span>
          <span class="score-value">${responses?.awareness || '-'}/5</span>
        </div>
        <div class="score-item">
          <span class="score-label">Value:</span>
          <span class="score-value">${responses?.value || '-'}/5</span>
        </div>
        <div class="score-item">
          <span class="score-label">Control:</span>
          <span class="score-value">${responses?.control || '-'}/5</span>
        </div>
      </div>
      ${responses?.notes ? `<div class="reflection-notes">"${responses.notes}"</div>` : ''}
    `;

    container.appendChild(reflectionCard);
  });
}

function showNoReflections() {
  document.getElementById('recentReflections').innerHTML = '';
  document.getElementById('noReflections').style.display = 'flex';
}

function showNoDataMessage() {
  document.getElementById('totalReflections').textContent = '0';
  document.getElementById('avgAwareness').textContent = '-';
  document.getElementById('avgValue').textContent = '-';
  document.getElementById('avgControl').textContent = '-';
  showNoInsights();
  showNoReflections();
}

function formatDate(date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today, ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday, ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
           date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
