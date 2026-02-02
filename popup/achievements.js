// Achievements Page Logic

let allAchievements = [];
let currentFilter = 'all';

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

// Send message to background
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

// Load achievements data
async function loadAchievements() {
  try {
    // Use GET_LEADERBOARD to get consistent data (same as stats page)
    const res = await sendMessage({ type: 'GET_LEADERBOARD' });

    if (!res || !res.ok) {
      console.error('[Achievements] Failed to load data');
      return;
    }

    // Get data from leaderboard response
    const stats = res.stats || {};
    const totalPoints = res.totalPoints || 0;
    const level = res.level || { level: 1, title: 'Novice', icon: '🌱', color: '#94a3b8' };

    // Update level and points display
    updateProgress(level, totalPoints);

    // Load achievements
    const achievementsRes = await sendMessage({ type: 'GET_ACHIEVEMENTS' });
    if (achievementsRes && achievementsRes.ok) {
      allAchievements = achievementsRes.achievements || [];
    } else {
      allAchievements = [];
    }

    // Calculate stats
    const unlocked = allAchievements.filter(a => a.unlocked).length;
    const total = allAchievements.length;
    const locked = total - unlocked;
    const completion = total > 0 ? Math.round((unlocked / total) * 100) : 0;

    document.getElementById('unlockedCount').textContent = unlocked;
    document.getElementById('lockedCount').textContent = locked;
    document.getElementById('completionPercent').textContent = `${completion}%`;

    // Render achievements
    renderAchievements(currentFilter);

  } catch (error) {
    console.error('[Achievements] Error loading data:', error);
  }
}

// Update progress display
function updateProgress(level, totalPoints) {
  // Handle level object from GAMIFICATION system
  const levelNum = level.level || 1;
  const levelIcon = level.icon || '🌱';
  const levelTitle = level.title || 'Novice';

  // Update level display with icon
  const levelNumberEl = document.getElementById('levelNumber');
  if (levelNumberEl) {
    levelNumberEl.textContent = levelIcon + ' ' + levelNum;
  }

  // Update total points
  document.getElementById('totalPoints').textContent = totalPoints;

  // Use progress from level object if available
  if (level.progress) {
    const current = level.progress.current || 0;
    const required = level.progress.required || 100;
    const progressPercent = level.progress.percentage || 0;

    document.getElementById('currentPoints').textContent = current;
    document.getElementById('nextLevelPoints').textContent = required;
    document.getElementById('progressFill').style.width = `${Math.min(progressPercent, 100)}%`;
  } else {
    // Max level reached
    document.getElementById('currentPoints').textContent = totalPoints;
    document.getElementById('nextLevelPoints').textContent = totalPoints;
    document.getElementById('progressFill').style.width = '100%';
  }
}

// Render achievements
function renderAchievements(filter) {
  const grid = document.getElementById('achievementsGrid');
  const emptyState = document.getElementById('emptyState');

  // Filter achievements
  let filtered = allAchievements;

  if (filter === 'unlocked') {
    filtered = allAchievements.filter(a => a.unlocked);
  } else if (filter === 'locked') {
    filtered = allAchievements.filter(a => !a.unlocked);
  } else if (filter !== 'all') {
    // Filter by category
    filtered = allAchievements.filter(a => a.category === filter);
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  // Sort: unlocked first, then by tier (gold > silver > bronze), then by points
  const tierOrder = { gold: 3, silver: 2, bronze: 1 };
  filtered.sort((a, b) => {
    if (a.unlocked !== b.unlocked) return b.unlocked ? 1 : -1;
    if (a.tier !== b.tier) return (tierOrder[b.tier] || 0) - (tierOrder[a.tier] || 0);
    return b.points - a.points;
  });

  grid.innerHTML = filtered.map(achievement => {
    const locked = !achievement.unlocked;
    const progress = achievement.progress || 0;
    const target = achievement.target || 100;
    const progressPercent = Math.min((progress / target) * 100, 100);

    return `
      <div class="achievement-card ${locked ? 'locked' : ''}">
        <div class="tier-badge tier-${achievement.tier}">${achievement.tier}</div>
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-title">${achievement.title}</div>
        <div class="achievement-desc">${achievement.description}</div>
        <div class="achievement-points">
          <span>⭐</span>
          <span>${achievement.points} points</span>
        </div>
        ${locked && progress > 0 ? `
          <div class="achievement-progress">
            <div class="progress-label">
              <span>Progress</span>
              <span>${progress} / ${target}</span>
            </div>
            <div class="progress-track">
              <div class="progress-value" style="width: ${progressPercent}%"></div>
            </div>
          </div>
        ` : ''}
        ${!locked ? `
          <div class="achievement-progress">
            <div class="progress-label">
              <span style="color: var(--primary); font-weight: 600;">✓ Unlocked!</span>
              <span>${achievement.unlockedAt ? new Date(achievement.unlockedAt).toLocaleDateString() : ''}</span>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// Setup filter tabs
function setupFilters() {
  const tabs = document.querySelectorAll('.tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active state
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update filter and re-render
      currentFilter = tab.dataset.filter;
      renderAchievements(currentFilter);
    });
  });
}

// Back button
document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = 'summary.html';
});

// Theme toggle
document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

// Navigation buttons
document.getElementById('insightsBtn')?.addEventListener('click', () => {
  window.location.href = 'insights.html';
});

document.getElementById('goalsBtn')?.addEventListener('click', () => {
  window.location.href = 'goals.html';
});

document.getElementById('statsBtn')?.addEventListener('click', () => {
  window.location.href = 'stats.html';
});

document.getElementById('achievementsBtn')?.addEventListener('click', () => {
  window.location.href = 'achievements.html';
});

// Initialize
loadTheme();
setupFilters();
loadAchievements();

// Refresh every 30 seconds
setInterval(loadAchievements, 30000);
