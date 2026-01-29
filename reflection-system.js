// User Feedback and Reflection System
// Based on reflective practice theory and digital wellbeing research

const REFLECTION_SYSTEM = (() => {
  const STORAGE_KEY_REFLECTIONS = 'mf_reflections';
  const STORAGE_KEY_GOALS = 'mf_user_goals';
  const STORAGE_KEY_FEEDBACK = 'mf_session_feedback';

  /**
   * Reflection prompts based on psychological research
   * Sources: Reflective Practice (Schön), Mindfulness Research
   */
  const REFLECTION_PROMPTS = {
    postSession: [
      {
        id: 'awareness',
        question: 'How intentional was your scrolling?',
        type: 'scale',
        scale: { min: 1, max: 5, labels: ['Mindless', 'Very Intentional'] },
        theory: 'Mindful awareness and self-monitoring'
      },
      {
        id: 'mood',
        question: 'How do you feel after this session?',
        type: 'choice',
        options: [
          { value: 'energized', label: 'Energized', emoji: '⚡' },
          { value: 'relaxed', label: 'Relaxed', emoji: '😌' },
          { value: 'neutral', label: 'Neutral', emoji: '😐' },
          { value: 'drained', label: 'Drained', emoji: '😴' },
          { value: 'anxious', label: 'Anxious', emoji: '😰' }
        ],
        theory: 'Affective self-awareness'
      },
      {
        id: 'value',
        question: 'Did this session add value to your day?',
        type: 'scale',
        scale: { min: 1, max: 5, labels: ['No Value', 'Very Valuable'] },
        theory: 'Value-based reflection'
      },
      {
        id: 'control',
        question: 'Did you feel in control of your time?',
        type: 'scale',
        scale: { min: 1, max: 5, labels: ['Lost Control', 'Full Control'] },
        theory: 'Locus of control and self-regulation'
      },
      {
        id: 'notes',
        question: 'Any insights or observations? (optional)',
        type: 'text',
        optional: true,
        theory: 'Reflective journaling'
      }
    ],

    weekly: [
      {
        id: 'patterns',
        question: 'What patterns do you notice in your social media use?',
        type: 'text',
        theory: 'Pattern recognition and metacognition'
      },
      {
        id: 'goals',
        question: 'What would you like to change about your usage?',
        type: 'text',
        theory: 'Goal setting and behavior change'
      }
    ],

    nudges: [
      {
        trigger: 'longSession',
        condition: (sessionMs) => sessionMs > 1800000, // > 30 min
        message: '⏰ You\'ve been scrolling for {minutes} minutes. Consider taking a mindful break.',
        action: 'Pause and Reflect',
        theory: 'Just-in-time adaptive interventions'
      },
      {
        trigger: 'frequentSessions',
        condition: (todaySessionCount) => todaySessionCount > 5,
        message: '🔄 This is your {count}th session today. How are you feeling?',
        action: 'Quick Check-in',
        theory: 'Self-monitoring and awareness triggers'
      },
      {
        trigger: 'negativeContent',
        condition: (analysis) => analysis?.emotions?.Negative > 0.5,
        message: '😔 You consumed a lot of negative content. Want to take a mood check?',
        action: 'Mood Check',
        theory: 'Emotional regulation and intervention'
      },
      {
        trigger: 'achievement',
        condition: (analysis) => analysis?.engagement?.Mindful > 0.6,
        message: '✨ Great job! You had a mindful session. Keep it up!',
        action: 'View Insights',
        theory: 'Positive reinforcement'
      }
    ]
  };

  /**
   * Goal templates based on behavior change theory
   */
  const GOAL_TEMPLATES = [
    {
      id: 'reduce_time',
      title: 'Reduce Daily Time',
      description: 'Set a daily time limit for social media',
      type: 'time_limit',
      theory: 'Implementation intentions',
      defaultValue: 30 // minutes
    },
    {
      id: 'mindful_sessions',
      title: 'More Mindful Sessions',
      description: 'Increase the quality of your engagement',
      type: 'quality',
      theory: 'Value-based goals',
      metric: 'mindful_ratio'
    },
    {
      id: 'reduce_frequency',
      title: 'Fewer Sessions Per Day',
      description: 'Reduce how often you check social media',
      type: 'frequency',
      theory: 'Habit modification',
      defaultValue: 3 // sessions per day
    },
    {
      id: 'positive_content',
      title: 'More Positive Content',
      description: 'Increase exposure to uplifting content',
      type: 'content_type',
      theory: 'Environmental design',
      metric: 'positive_ratio'
    }
  ];

  /**
   * Save user reflection
   */
  async function saveReflection(sessionId, responses) {
    const reflection = {
      sessionId,
      timestamp: Date.now(),
      responses,
      completed: true
    };

    const reflections = await getReflections();
    reflections.push(reflection);

    // Keep last 100 reflections
    if (reflections.length > 100) {
      reflections.shift();
    }

    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY_REFLECTIONS]: reflections }, () => {
        resolve(reflection);
      });
    });
  }

  /**
   * Get all reflections
   */
  async function getReflections() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY_REFLECTIONS], (result) => {
        resolve(result[STORAGE_KEY_REFLECTIONS] || []);
      });
    });
  }

  /**
   * Analyze reflection trends
   */
  async function analyzeReflectionTrends() {
    const reflections = await getReflections();
    if (reflections.length === 0) return null;

    const recent = reflections.slice(-10); // Last 10 sessions

    // Calculate averages
    const avgAwareness = calculateAverage(recent, 'awareness');
    const avgValue = calculateAverage(recent, 'value');
    const avgControl = calculateAverage(recent, 'control');

    // Most common mood
    const moodCounts = {};
    recent.forEach(r => {
      const mood = r.responses?.mood;
      if (mood) moodCounts[mood] = (moodCounts[mood] || 0) + 1;
    });

    const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Trend detection
    const trends = {
      awareness: detectTrend(recent, 'awareness'),
      value: detectTrend(recent, 'value'),
      control: detectTrend(recent, 'control')
    };

    return {
      averages: {
        awareness: avgAwareness,
        value: avgValue,
        control: avgControl
      },
      dominantMood,
      trends,
      totalReflections: reflections.length,
      insights: generateTrendInsights(avgAwareness, avgValue, avgControl, dominantMood, trends)
    };
  }

  /**
   * Calculate average for a specific response field
   */
  function calculateAverage(reflections, field) {
    const values = reflections
      .map(r => r.responses?.[field])
      .filter(v => typeof v === 'number');

    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Detect trend (improving/declining/stable)
   */
  function detectTrend(reflections, field) {
    if (reflections.length < 3) return 'insufficient_data';

    const first = reflections.slice(0, Math.floor(reflections.length / 2));
    const second = reflections.slice(Math.floor(reflections.length / 2));

    const avgFirst = calculateAverage(first, field);
    const avgSecond = calculateAverage(second, field);

    if (avgFirst === null || avgSecond === null) return 'insufficient_data';

    const diff = avgSecond - avgFirst;

    if (diff > 0.5) return 'improving';
    if (diff < -0.5) return 'declining';
    return 'stable';
  }

  /**
   * Generate insights from reflection trends
   */
  function generateTrendInsights(awareness, value, control, mood, trends) {
    const insights = [];

    // Awareness insights
    if (awareness !== null) {
      if (awareness < 2.5) {
        insights.push({
          type: 'concern',
          message: 'Your awareness scores are low. Try setting intentions before each session.',
          action: 'Set Intention'
        });
      } else if (awareness > 4) {
        insights.push({
          type: 'positive',
          message: 'Excellent mindfulness! You\'re very aware of your usage patterns.',
          action: null
        });
      }
    }

    // Control insights
    if (control !== null && control < 2.5) {
      insights.push({
        type: 'suggestion',
        message: 'You often feel out of control. Consider setting time limits or using blocking features.',
        action: 'Set Goals'
      });
    }

    // Value insights
    if (value !== null && value < 2.5) {
      insights.push({
        type: 'concern',
        message: 'Sessions don\'t seem valuable lately. Reflect on why you\'re using social media.',
        action: 'Weekly Reflection'
      });
    }

    // Mood insights
    if (mood === 'drained' || mood === 'anxious') {
      insights.push({
        type: 'warning',
        message: 'Social media often leaves you feeling drained or anxious. This may impact your wellbeing.',
        action: 'Review Goals'
      });
    } else if (mood === 'energized' || mood === 'relaxed') {
      insights.push({
        type: 'positive',
        message: 'Social media seems to have a positive impact on your mood. That\'s great!',
        action: null
      });
    }

    // Trend insights
    if (trends.awareness === 'declining') {
      insights.push({
        type: 'warning',
        message: 'Your mindfulness is declining over time. What changed?',
        action: 'Reflect on Changes'
      });
    } else if (trends.awareness === 'improving') {
      insights.push({
        type: 'positive',
        message: 'Your awareness is improving! Keep up the great work.',
        action: null
      });
    }

    return insights;
  }

  /**
   * Check if user should see a nudge
   */
  async function checkNudges(session, analysis) {
    const nudges = [];

    // Get today's session count for frequentSessions trigger
    const todaySessionCount = await getTodaySessionCount();

    for (const nudge of REFLECTION_PROMPTS.nudges) {
      let shouldShow = false;

      if (nudge.trigger === 'longSession') {
        shouldShow = nudge.condition(session.durationMs);
      } else if (nudge.trigger === 'frequentSessions') {
        shouldShow = nudge.condition(todaySessionCount);
      } else if (nudge.trigger === 'negativeContent') {
        shouldShow = nudge.condition(analysis);
      } else if (nudge.trigger === 'achievement') {
        shouldShow = nudge.condition(analysis);
      }

      if (shouldShow) {
        const message = formatNudgeMessage(nudge.message, session, analysis, todaySessionCount);
        nudges.push({
          ...nudge,
          message
        });
      }
    }

    return nudges;
  }

  /**
   * Get today's session count
   */
  async function getTodaySessionCount() {
    const reflections = await getReflections();
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Count reflections from today
    const todayReflections = reflections.filter(r => {
      const refDate = new Date(r.timestamp);
      const refKey = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, '0')}-${String(refDate.getDate()).padStart(2, '0')}`;
      return refKey === todayKey;
    });

    return todayReflections.length + 1; // +1 for the current session
  }

  /**
   * Format nudge message with variables
   */
  function formatNudgeMessage(template, session, analysis, sessionCount) {
    const minutes = Math.round(session.durationMs / 60000);
    return template
      .replace('{minutes}', minutes)
      .replace('{count}', sessionCount || 1);
  }

  /**
   * User goal management
   */
  async function saveGoal(goal) {
    const goals = await getGoals();
    goal.id = goal.id || `goal_${Date.now()}`;
    goal.createdAt = goal.createdAt || Date.now();
    goal.status = goal.status || 'active';

    const existing = goals.findIndex(g => g.id === goal.id);
    if (existing >= 0) {
      goals[existing] = goal;
    } else {
      goals.push(goal);
    }

    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY_GOALS]: goals }, () => {
        resolve(goal);
      });
    });
  }

  /**
   * Get user goals
   */
  async function getGoals() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY_GOALS], (result) => {
        resolve(result[STORAGE_KEY_GOALS] || []);
      });
    });
  }

  /**
   * Check goal progress
   */
  async function checkGoalProgress(session, dailyStats) {
    const goals = await getGoals();
    const activeGoals = goals.filter(g => g.status === 'active');

    const progress = [];

    for (const goal of activeGoals) {
      let achieved = false;
      let currentValue = 0;
      let targetValue = goal.targetValue;
      let message = '';

      if (goal.type === 'time_limit') {
        const totalMinutes = dailyStats.totalMs / 60000;
        currentValue = totalMinutes;
        targetValue = goal.targetValue;
        achieved = totalMinutes <= targetValue;
        message = achieved
          ? `✓ Under your ${targetValue} minute daily limit`
          : `⚠ ${Math.round(totalMinutes)}/${targetValue} minutes used`;
      } else if (goal.type === 'frequency') {
        currentValue = session.sessionCount || 1;
        achieved = currentValue <= targetValue;
        message = achieved
          ? `✓ Within your ${targetValue} session limit`
          : `⚠ Session ${currentValue}/${targetValue} today`;
      }

      progress.push({
        goalId: goal.id,
        goalTitle: goal.title,
        achieved,
        currentValue,
        targetValue,
        message
      });
    }

    return progress;
  }

  // Public API
  return {
    REFLECTION_PROMPTS,
    GOAL_TEMPLATES,
    saveReflection,
    getReflections,
    analyzeReflectionTrends,
    checkNudges,
    saveGoal,
    getGoals,
    checkGoalProgress
  };
})();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = REFLECTION_SYSTEM;
}
