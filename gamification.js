// Gamification and Leaderboard System
// Based on self-determination theory and intrinsic motivation research

const GAMIFICATION = (() => {
  const STORAGE_KEY_ACHIEVEMENTS = 'mf_achievements';
  const STORAGE_KEY_STATS = 'mf_gamification_stats';
  const STORAGE_KEY_LEADERBOARD = 'mf_leaderboard';

  /**
   * Achievement definitions
   * Based on autonomy, competence, and relatedness (Self-Determination Theory)
   */
  const ACHIEVEMENTS = {
    // Awareness achievements (Competence)
    mindful_master: {
      id: 'mindful_master',
      title: 'Mindful Master',
      description: 'Complete 10 highly mindful sessions (80%+ mindful engagement)',
      icon: '🧘',
      points: 100,
      tier: 'gold',
      category: 'awareness',
      condition: (stats) => stats.mindfulSessions >= 10
    },
    awareness_streak_7: {
      id: 'awareness_streak_7',
      title: 'Week of Awareness',
      description: 'Track your usage for 7 consecutive days',
      icon: '🔥',
      points: 50,
      tier: 'silver',
      category: 'consistency',
      condition: (stats) => stats.trackingStreak >= 7
    },
    awareness_streak_30: {
      id: 'awareness_streak_30',
      title: 'Month of Mindfulness',
      description: 'Track your usage for 30 consecutive days',
      icon: '🏆',
      points: 200,
      tier: 'gold',
      category: 'consistency',
      condition: (stats) => stats.trackingStreak >= 30
    },

    // Time management achievements (Autonomy)
    time_saver: {
      id: 'time_saver',
      title: 'Time Saver',
      description: 'Reduce your average daily time by 30%',
      icon: '⏰',
      points: 75,
      tier: 'silver',
      category: 'control',
      condition: (stats) => stats.timeReductionPercent >= 30
    },
    quick_sessions: {
      id: 'quick_sessions',
      title: 'Quick & Intentional',
      description: 'Complete 10 sessions under 10 minutes',
      icon: '⚡',
      points: 50,
      tier: 'bronze',
      category: 'control',
      condition: (stats) => stats.quickSessions >= 10
    },
    goal_achiever: {
      id: 'goal_achiever',
      title: 'Goal Achiever',
      description: 'Meet your daily goal 5 days in a row',
      icon: '🎯',
      points: 100,
      tier: 'gold',
      category: 'control',
      condition: (stats) => stats.goalStreak >= 5
    },

    // Reflection achievements (Competence + Autonomy)
    reflective_thinker: {
      id: 'reflective_thinker',
      title: 'Reflective Thinker',
      description: 'Complete 20 post-session reflections',
      icon: '💭',
      points: 60,
      tier: 'silver',
      category: 'reflection',
      condition: (stats) => stats.reflectionsCompleted >= 20
    },
    insight_seeker: {
      id: 'insight_seeker',
      title: 'Insight Seeker',
      description: 'Write 10 detailed reflection notes',
      icon: '📝',
      points: 40,
      tier: 'bronze',
      category: 'reflection',
      condition: (stats) => stats.detailedReflections >= 10
    },

    // Content quality achievements (Competence)
    positive_vibes: {
      id: 'positive_vibes',
      title: 'Positive Vibes',
      description: 'Maintain 70%+ positive content for a week',
      icon: '😊',
      points: 80,
      tier: 'silver',
      category: 'content',
      condition: (stats) => stats.positiveContentWeek >= 7
    },
    knowledge_seeker: {
      id: 'knowledge_seeker',
      title: 'Knowledge Seeker',
      description: 'Spend 50%+ time on educational content',
      icon: '📚',
      points: 90,
      tier: 'gold',
      category: 'content',
      condition: (stats) => stats.educationalRatio >= 0.5
    },

    // Community achievements (Relatedness)
    first_step: {
      id: 'first_step',
      title: 'First Step',
      description: 'Complete your first tracked session',
      icon: '👣',
      points: 10,
      tier: 'bronze',
      category: 'milestone',
      condition: (stats) => stats.sessionsCompleted >= 1
    },
    getting_started: {
      id: 'getting_started',
      title: 'Getting Started',
      description: 'Complete 10 tracked sessions',
      icon: '🌱',
      points: 30,
      tier: 'bronze',
      category: 'milestone',
      condition: (stats) => stats.sessionsCompleted >= 10
    },
    veteran_tracker: {
      id: 'veteran_tracker',
      title: 'Veteran Tracker',
      description: 'Complete 100 tracked sessions',
      icon: '🌟',
      points: 150,
      tier: 'gold',
      category: 'milestone',
      condition: (stats) => stats.sessionsCompleted >= 100
    }
  };

  /**
   * Level system based on total points
   */
  const LEVELS = [
    { level: 1, minPoints: 0, title: 'Novice', icon: '🌱', color: '#94a3b8' },
    { level: 2, minPoints: 50, title: 'Aware', icon: '👁️', color: '#60a5fa' },
    { level: 3, minPoints: 150, title: 'Mindful', icon: '🧘', color: '#34d399' },
    { level: 4, minPoints: 300, title: 'Intentional', icon: '🎯', color: '#fbbf24' },
    { level: 5, minPoints: 500, title: 'Balanced', icon: '⚖️', color: '#f97316' },
    { level: 6, minPoints: 800, title: 'Master', icon: '🏆', color: '#ef4444' },
    { level: 7, minPoints: 1200, title: 'Zen', icon: '☯️', color: '#8b5cf6' }
  ];

  /**
   * Calculate user level from total points
   */
  function calculateLevel(totalPoints) {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (totalPoints >= LEVELS[i].minPoints) {
        const nextLevel = LEVELS[i + 1];
        return {
          ...LEVELS[i],
          progress: nextLevel ? {
            current: totalPoints - LEVELS[i].minPoints,
            required: nextLevel.minPoints - LEVELS[i].minPoints,
            percentage: Math.round(((totalPoints - LEVELS[i].minPoints) / (nextLevel.minPoints - LEVELS[i].minPoints)) * 100)
          } : null
        };
      }
    }
    return { ...LEVELS[0], progress: null };
  }

  /**
   * Check which achievements were unlocked
   */
  async function checkAchievements(stats) {
    const unlocked = [];
    const existingAchievements = await getAchievements();
    const existingIds = new Set(existingAchievements.map(a => a.id));

    for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
      if (!existingIds.has(id) && achievement.condition(stats)) {
        const newAchievement = {
          ...achievement,
          unlockedAt: Date.now()
        };
        unlocked.push(newAchievement);
      }
    }

    if (unlocked.length > 0) {
      await saveAchievements([...existingAchievements, ...unlocked]);
    }

    return unlocked;
  }

  /**
   * Get all user achievements
   */
  async function getAchievements() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY_ACHIEVEMENTS], (result) => {
        resolve(result[STORAGE_KEY_ACHIEVEMENTS] || []);
      });
    });
  }

  /**
   * Save achievements
   */
  async function saveAchievements(achievements) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY_ACHIEVEMENTS]: achievements }, () => {
        resolve();
      });
    });
  }

  /**
   * Calculate gamification stats
   */
  async function calculateStats(dailyStats, reflections) {
    const today = new Date();
    const todayKey = isoDate(today);

    // Calculate tracking streak
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const key = isoDate(date);
      if (dailyStats[key] && dailyStats[key].totalMs > 0) {
        streak++;
      } else {
        break;
      }
    }

    // Calculate session statistics
    const allDays = Object.values(dailyStats);
    const sessionsCompleted = allDays.reduce((sum, day) => {
      return sum + (day.sessionCount || 1);
    }, 0);

    // Mindful sessions (using engagement data if available)
    const mindfulSessions = allDays.filter(day => {
      const mindfulRatio = day.engagement?.Mindful || 0;
      return mindfulRatio >= 0.8;
    }).length;

    // Quick sessions (< 10 minutes)
    const quickSessions = allDays.filter(day => day.totalMs < 600000).length;

    // Time reduction calculation (compare last 7 days vs previous 7 days)
    const last7Days = getDaysRange(today, 7);
    const prev7Days = getDaysRange(today, 7, 7);

    const avgLast7 = calculateAverageTime(last7Days, dailyStats);
    const avgPrev7 = calculateAverageTime(prev7Days, dailyStats);
    const timeReductionPercent = avgPrev7 > 0 ? Math.max(0, ((avgPrev7 - avgLast7) / avgPrev7) * 100) : 0;

    // Reflection statistics
    const reflectionsCompleted = reflections.length;
    const detailedReflections = reflections.filter(r => {
      return r.responses?.notes && r.responses.notes.length > 20;
    }).length;

    // Content quality stats (simplified - would need full analysis data)
    const educationalRatio = allDays.reduce((sum, day) => {
      return sum + ((day.topics?.Education || 0) / (day.totalMs || 1));
    }, 0) / Math.max(allDays.length, 1);

    // Goal streak (would need goal tracking data)
    const goalStreak = 0; // Placeholder

    return {
      trackingStreak: streak,
      sessionsCompleted,
      mindfulSessions,
      quickSessions,
      timeReductionPercent: Math.round(timeReductionPercent),
      reflectionsCompleted,
      detailedReflections,
      educationalRatio,
      positiveContentWeek: 0, // Placeholder
      goalStreak
    };
  }

  /**
   * Update leaderboard (anonymous user comparison)
   */
  async function updateLeaderboard(userStats, userLevel) {
    const leaderboard = await getLeaderboard();

    const userId = await getUserId(); // Anonymous ID
    const username = await getUsername(); // User-set display name

    const entry = {
      userId,
      username: username || `User${userId.slice(0, 6)}`,
      level: userLevel.level,
      points: calculateTotalPoints(),
      stats: {
        streak: userStats.trackingStreak,
        sessions: userStats.sessionsCompleted,
        mindfulSessions: userStats.mindfulSessions
      },
      updatedAt: Date.now()
    };

    // Update or add user entry
    const existingIndex = leaderboard.findIndex(e => e.userId === userId);
    if (existingIndex >= 0) {
      leaderboard[existingIndex] = entry;
    } else {
      leaderboard.push(entry);
    }

    // Sort by points (descending)
    leaderboard.sort((a, b) => b.points - a.points);

    // Keep top 100
    const trimmed = leaderboard.slice(0, 100);

    await saveLeaderboard(trimmed);

    // Find user rank
    const userRank = trimmed.findIndex(e => e.userId === userId) + 1;

    return {
      leaderboard: trimmed,
      userRank,
      userEntry: entry
    };
  }

  /**
   * Get leaderboard
   */
  async function getLeaderboard() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY_LEADERBOARD], (result) => {
        resolve(result[STORAGE_KEY_LEADERBOARD] || []);
      });
    });
  }

  /**
   * Save leaderboard
   */
  async function saveLeaderboard(leaderboard) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY_LEADERBOARD]: leaderboard }, () => {
        resolve();
      });
    });
  }

  /**
   * Get or create anonymous user ID
   */
  async function getUserId() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['mf_user_id'], (result) => {
        let id = result.mf_user_id;
        if (!id) {
          id = `u_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
          chrome.storage.local.set({ mf_user_id: id });
        }
        resolve(id);
      });
    });
  }

  /**
   * Get username
   */
  async function getUsername() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['mf_username'], (result) => {
        resolve(result.mf_username || null);
      });
    });
  }

  /**
   * Set username
   */
  async function setUsername(username) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ mf_username: username }, () => {
        resolve();
      });
    });
  }

  /**
   * Calculate total points from achievements
   */
  async function calculateTotalPoints() {
    const achievements = await getAchievements();
    return achievements.reduce((sum, a) => sum + (a.points || 0), 0);
  }

  /**
   * Helper: ISO date string
   */
  function isoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Helper: Get date range
   */
  function getDaysRange(endDate, count, offset = 0) {
    const days = [];
    for (let i = offset; i < offset + count; i++) {
      const date = new Date(endDate);
      date.setDate(endDate.getDate() - i);
      days.push(isoDate(date));
    }
    return days;
  }

  /**
   * Helper: Calculate average time for date range
   */
  function calculateAverageTime(dateKeys, dailyStats) {
    const total = dateKeys.reduce((sum, key) => {
      return sum + (dailyStats[key]?.totalMs || 0);
    }, 0);
    return total / dateKeys.length;
  }

  // Public API
  return {
    ACHIEVEMENTS,
    LEVELS,
    checkAchievements,
    getAchievements,
    calculateLevel,
    calculateStats,
    updateLeaderboard,
    getLeaderboard,
    setUsername,
    calculateTotalPoints
  };
})();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GAMIFICATION;
}
