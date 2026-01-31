// Achievements Page Logic

let allAchievements = [];
let currentFilter = 'all';

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
    const res = await sendMessage({ type: 'GET_DASHBOARD' });

    if (!res || !res.ok) {
      console.error('[Achievements] Failed to load data');
      return;
    }

    // Get achievement data
    const achievementsData = res.achievements || {};
    const stats = res.stats || {};
    const totalPoints = res.totalPoints || 0;
    const level = res.level || 1;

    // Update level and points display
    updateProgress(level, totalPoints);

    // Load all achievements from backend
    allAchievements = Object.values(achievementsData);

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
  document.getElementById('levelNumber').textContent = level;
  document.getElementById('totalPoints').textContent = totalPoints;

  // Calculate next level (100 points per level)
  const pointsPerLevel = 100;
  const currentLevelPoints = (level - 1) * pointsPerLevel;
  const nextLevelPoints = level * pointsPerLevel;
  const pointsInCurrentLevel = totalPoints - currentLevelPoints;
  const progressPercent = (pointsInCurrentLevel / pointsPerLevel) * 100;

  document.getElementById('currentPoints').textContent = pointsInCurrentLevel;
  document.getElementById('nextLevelPoints').textContent = pointsPerLevel;
  document.getElementById('progressFill').style.width = `${Math.min(progressPercent, 100)}%`;
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
document.getElementById('themeToggle')?.addEventListener('click', async () => {
  const isDark = document.body.classList.contains('dark-mode');
  const newTheme = isDark ? 'light' : 'dark';
  await chrome.storage.local.set({ mf_theme: newTheme });
  document.body.classList.toggle('dark-mode');
  const toggleBtn = document.getElementById('themeToggle');
  if (toggleBtn) {
    toggleBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    toggleBtn.title = newTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
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

// Initialize
setupFilters();
loadAchievements();

// Refresh every 30 seconds
setInterval(loadAchievements, 30000);
