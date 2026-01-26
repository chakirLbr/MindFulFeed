// Stats & Achievements Page - Gamification dashboard
// Displays user level, points, achievements, and leaderboard

let userStats = null;
let allAchievements = [];
let unlockedAchievements = [];
let leaderboardData = null;
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  await loadPlayerStats();
  await loadAchievements();
  await loadLeaderboard();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('backBtn')?.addEventListener('click', () => {
    window.location.href = 'summary.html';
  });

  // Achievement filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderAchievements();
    });
  });
}

async function loadPlayerStats() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LEADERBOARD' });

    if (response && response.ok) {
      userStats = response.stats || {};
      const totalPoints = response.totalPoints || 0;
      const level = response.level || { level: 1, title: 'Novice', icon: '🌱' };
      const username = response.username || 'Anonymous Player';

      renderPlayerCard(username, totalPoints, level, userStats);
    }
  } catch (error) {
    console.error('Error loading player stats:', error);
  }
}

function renderPlayerCard(username, totalPoints, level, stats) {
  // Update player name
  document.getElementById('playerName').textContent = username;

  // Update avatar icon based on level
  document.getElementById('avatarIcon').textContent = level.icon || '🧘';

  // Update level display
  const levelEl = document.getElementById('playerLevel');
  if (levelEl) {
    levelEl.innerHTML = `
      <span class="level-icon">${level.icon || '🌱'}</span>
      <span class="level-text">Level ${level.level} - ${level.title}</span>
    `;
    levelEl.style.color = level.color || '#94a3b8';
  }

  // Update total points
  document.getElementById('totalPoints').textContent = totalPoints;

  // Update level progress
  if (level.progress) {
    const percentage = level.progress.percentage || 0;
    document.getElementById('levelProgressFill').style.width = `${percentage}%`;
    document.getElementById('currentProgress').textContent = level.progress.current || 0;
    document.getElementById('requiredProgress').textContent = level.progress.required || 0;
    document.getElementById('levelProgressText').style.display = 'flex';
  } else {
    // Max level reached
    document.getElementById('levelProgressFill').style.width = '100%';
    document.getElementById('levelProgressText').innerHTML = '<span>🎉 Max Level Reached!</span>';
  }

  // Update quick stats
  document.getElementById('trackingStreak').textContent = stats.trackingStreak || 0;
  document.getElementById('sessionsCompleted').textContent = stats.sessionsCompleted || 0;
  document.getElementById('mindfulSessions').textContent = stats.mindfulSessions || 0;
  document.getElementById('reflectionsCompleted').textContent = stats.reflectionsCompleted || 0;
}

async function loadAchievements() {
  try {
    // Get all achievement definitions
    const achievementDefinitions = {
      // Awareness achievements
      mindful_master: {
        id: 'mindful_master',
        title: 'Mindful Master',
        description: 'Complete 10 highly mindful sessions (80%+ mindful engagement)',
        icon: '🧘',
        points: 100,
        tier: 'gold',
        category: 'awareness'
      },
      awareness_streak_7: {
        id: 'awareness_streak_7',
        title: 'Week of Awareness',
        description: 'Track your usage for 7 consecutive days',
        icon: '🔥',
        points: 50,
        tier: 'silver',
        category: 'consistency'
      },
      awareness_streak_30: {
        id: 'awareness_streak_30',
        title: 'Month of Mindfulness',
        description: 'Track your usage for 30 consecutive days',
        icon: '🏆',
        points: 200,
        tier: 'gold',
        category: 'consistency'
      },
      time_saver: {
        id: 'time_saver',
        title: 'Time Saver',
        description: 'Reduce your average daily time by 30%',
        icon: '⏰',
        points: 75,
        tier: 'silver',
        category: 'control'
      },
      quick_sessions: {
        id: 'quick_sessions',
        title: 'Quick & Intentional',
        description: 'Complete 10 sessions under 10 minutes',
        icon: '⚡',
        points: 50,
        tier: 'bronze',
        category: 'control'
      },
      goal_achiever: {
        id: 'goal_achiever',
        title: 'Goal Achiever',
        description: 'Meet your daily goal 5 days in a row',
        icon: '🎯',
        points: 100,
        tier: 'gold',
        category: 'control'
      },
      reflective_thinker: {
        id: 'reflective_thinker',
        title: 'Reflective Thinker',
        description: 'Complete 20 post-session reflections',
        icon: '💭',
        points: 60,
        tier: 'silver',
        category: 'reflection'
      },
      insight_seeker: {
        id: 'insight_seeker',
        title: 'Insight Seeker',
        description: 'Write 10 detailed reflection notes',
        icon: '📝',
        points: 40,
        tier: 'bronze',
        category: 'reflection'
      },
      positive_vibes: {
        id: 'positive_vibes',
        title: 'Positive Vibes',
        description: 'Complete 10 sessions with mostly positive content',
        icon: '✨',
        points: 50,
        tier: 'silver',
        category: 'content'
      },
      first_track: {
        id: 'first_track',
        title: 'First Step',
        description: 'Complete your first tracked session',
        icon: '🎉',
        points: 10,
        tier: 'bronze',
        category: 'milestone'
      },
      getting_started: {
        id: 'getting_started',
        title: 'Getting Started',
        description: 'Complete 10 tracked sessions',
        icon: '🌱',
        points: 30,
        tier: 'bronze',
        category: 'milestone'
      },
      veteran_tracker: {
        id: 'veteran_tracker',
        title: 'Veteran Tracker',
        description: 'Complete 100 tracked sessions',
        icon: '🌟',
        points: 150,
        tier: 'gold',
        category: 'milestone'
      }
    };

    // Get unlocked achievements from storage
    const response = await chrome.runtime.sendMessage({ type: 'GET_ACHIEVEMENTS' });
    unlockedAchievements = response?.achievements || [];

    // Merge definitions with unlocked status
    allAchievements = Object.values(achievementDefinitions).map(def => {
      const unlocked = unlockedAchievements.find(a => a.id === def.id);
      return {
        ...def,
        unlocked: !!unlocked,
        unlockedAt: unlocked?.unlockedAt || null
      };
    });

    renderAchievements();
  } catch (error) {
    console.error('Error loading achievements:', error);
    document.getElementById('noAchievements').style.display = 'flex';
  }
}

function renderAchievements() {
  const container = document.getElementById('achievementsGrid');
  const noAchievementsMsg = document.getElementById('noAchievements');

  if (!container) return;

  // Filter achievements based on current filter
  let filteredAchievements = allAchievements;
  if (currentFilter === 'unlocked') {
    filteredAchievements = allAchievements.filter(a => a.unlocked);
  } else if (currentFilter === 'locked') {
    filteredAchievements = allAchievements.filter(a => !a.unlocked);
  }

  if (filteredAchievements.length === 0) {
    container.innerHTML = '';
    noAchievementsMsg.style.display = 'flex';
    noAchievementsMsg.querySelector('p').textContent =
      currentFilter === 'unlocked' ? 'No achievements unlocked yet. Keep tracking!' : 'All achievements unlocked! 🎉';
    return;
  }

  container.innerHTML = '';
  noAchievementsMsg.style.display = 'none';

  // Sort by unlocked status (unlocked first), then by tier
  const tierOrder = { gold: 1, silver: 2, bronze: 3 };
  filteredAchievements.sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    return (tierOrder[a.tier] || 99) - (tierOrder[b.tier] || 99);
  });

  filteredAchievements.forEach(achievement => {
    const card = document.createElement('div');
    card.className = `achievement-card ${achievement.unlocked ? 'unlocked' : 'locked'} tier-${achievement.tier}`;

    const unlockedDate = achievement.unlocked && achievement.unlockedAt
      ? new Date(achievement.unlockedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;

    card.innerHTML = `
      <div class="achievement-icon ${achievement.unlocked ? '' : 'grayscale'}">${achievement.icon}</div>
      <div class="achievement-content">
        <h3 class="achievement-title">${achievement.title}</h3>
        <p class="achievement-description">${achievement.description}</p>
        <div class="achievement-footer">
          <span class="achievement-points">+${achievement.points} pts</span>
          <span class="achievement-tier tier-${achievement.tier}">${achievement.tier}</span>
          ${achievement.unlocked && unlockedDate ? `<span class="achievement-date">Unlocked ${unlockedDate}</span>` : ''}
        </div>
      </div>
      ${achievement.unlocked ? '<div class="achievement-badge">✓</div>' : ''}
    `;

    container.appendChild(card);
  });
}

async function loadLeaderboard() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LEADERBOARD' });

    if (response && response.ok) {
      leaderboardData = {
        leaderboard: response.leaderboard || [],
        userRank: response.userRank || null
      };

      renderLeaderboard();
    }
  } catch (error) {
    console.error('Error loading leaderboard:', error);
    document.getElementById('noLeaderboard').style.display = 'flex';
  }
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboardContainer');
  const noLeaderboardMsg = document.getElementById('noLeaderboard');

  if (!container) return;

  if (!leaderboardData || leaderboardData.leaderboard.length === 0) {
    container.innerHTML = '';
    noLeaderboardMsg.style.display = 'flex';
    return;
  }

  container.innerHTML = '';
  noLeaderboardMsg.style.display = 'none';

  // Show top 10
  const topEntries = leaderboardData.leaderboard.slice(0, 10);

  topEntries.forEach((entry, index) => {
    const rank = index + 1;
    const isCurrentUser = rank === leaderboardData.userRank;

    const row = document.createElement('div');
    row.className = `leaderboard-row ${isCurrentUser ? 'current-user' : ''}`;

    // Rank medal for top 3
    let rankDisplay = `<span class="rank-number">#${rank}</span>`;
    if (rank === 1) rankDisplay = '<span class="rank-medal">🥇</span>';
    else if (rank === 2) rankDisplay = '<span class="rank-medal">🥈</span>';
    else if (rank === 3) rankDisplay = '<span class="rank-medal">🥉</span>';

    row.innerHTML = `
      <div class="rank">${rankDisplay}</div>
      <div class="player">
        <div class="player-avatar-small">
          <span>${entry.level?.icon || '🧘'}</span>
        </div>
        <div class="player-details">
          <div class="player-username">${entry.username || 'Anonymous'}${isCurrentUser ? ' (You)' : ''}</div>
          <div class="player-level-small">Level ${entry.level?.level || 1} - ${entry.level?.title || 'Novice'}</div>
        </div>
      </div>
      <div class="player-stats-small">
        <div class="stat-small">
          <span class="stat-icon-small">🔥</span>
          <span>${entry.stats?.streak || 0}</span>
        </div>
        <div class="stat-small">
          <span class="stat-icon-small">📊</span>
          <span>${entry.stats?.sessions || 0}</span>
        </div>
      </div>
      <div class="player-points-small">
        <span class="points-value-small">${entry.points || 0}</span>
        <span class="points-label-small">pts</span>
      </div>
    `;

    container.appendChild(row);
  });

  // Show user rank if not in top 10
  if (leaderboardData.userRank && leaderboardData.userRank > 10) {
    const userEntry = leaderboardData.leaderboard[leaderboardData.userRank - 1];

    if (userEntry) {
      const divider = document.createElement('div');
      divider.className = 'leaderboard-divider';
      divider.textContent = '...';
      container.appendChild(divider);

      const userRow = document.createElement('div');
      userRow.className = 'leaderboard-row current-user';
      userRow.innerHTML = `
        <div class="rank"><span class="rank-number">#${leaderboardData.userRank}</span></div>
        <div class="player">
          <div class="player-avatar-small">
            <span>${userEntry.level?.icon || '🧘'}</span>
          </div>
          <div class="player-details">
            <div class="player-username">${userEntry.username || 'Anonymous'} (You)</div>
            <div class="player-level-small">Level ${userEntry.level?.level || 1} - ${userEntry.level?.title || 'Novice'}</div>
          </div>
        </div>
        <div class="player-stats-small">
          <div class="stat-small">
            <span class="stat-icon-small">🔥</span>
            <span>${userEntry.stats?.streak || 0}</span>
          </div>
          <div class="stat-small">
            <span class="stat-icon-small">📊</span>
            <span>${userEntry.stats?.sessions || 0}</span>
          </div>
        </div>
        <div class="player-points-small">
          <span class="points-value-small">${userEntry.points || 0}</span>
          <span class="points-label-small">pts</span>
        </div>
      `;

      container.appendChild(userRow);
    }
  }
}
