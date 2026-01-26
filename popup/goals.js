// Goals Page - Set and manage digital wellbeing goals
// Based on behavior change theory and implementation intentions

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

let goalTemplates = [];
let activeGoals = [];
let todayStats = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadTheme();
  await loadGoalTemplates();
  await loadActiveGoals();
  await loadTodayProgress();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

  document.getElementById('backBtn')?.addEventListener('click', () => {
    window.location.href = 'summary.html';
  });

  document.getElementById('addGoalBtn')?.addEventListener('click', () => {
    showGoalModal();
  });

  document.getElementById('closeModal')?.addEventListener('click', () => {
    hideGoalModal();
  });

  document.getElementById('cancelBtn')?.addEventListener('click', () => {
    hideGoalModal();
  });

  document.getElementById('goalForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveGoal();
  });

  // Close modal on outside click
  document.getElementById('goalModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'goalModal') {
      hideGoalModal();
    }
  });
}

async function loadGoalTemplates() {
  // Goal templates from reflection-system.js
  goalTemplates = [
    {
      id: 'reduce_time',
      title: 'Reduce Daily Time',
      description: 'Set a daily time limit for social media',
      type: 'time_limit',
      icon: '⏰',
      theory: 'Implementation intentions',
      defaultValue: 30, // minutes
      unit: 'minutes/day'
    },
    {
      id: 'reduce_frequency',
      title: 'Fewer Sessions Per Day',
      description: 'Reduce how often you check social media',
      type: 'frequency',
      icon: '🔄',
      theory: 'Habit modification',
      defaultValue: 3, // sessions per day
      unit: 'sessions/day'
    },
    {
      id: 'mindful_sessions',
      title: 'More Mindful Sessions',
      description: 'Increase the quality of your engagement',
      type: 'quality',
      icon: '🧘',
      theory: 'Value-based goals',
      metric: 'mindful_ratio',
      defaultValue: 4, // average awareness score
      unit: 'avg awareness (1-5)'
    },
    {
      id: 'positive_content',
      title: 'More Positive Content',
      description: 'Increase exposure to uplifting content',
      type: 'content_type',
      icon: '✨',
      theory: 'Environmental design',
      metric: 'positive_ratio',
      defaultValue: 60, // percentage
      unit: '% positive mood'
    }
  ];

  renderGoalTemplates();
}

function renderGoalTemplates() {
  const container = document.getElementById('goalTemplates');
  if (!container) return;

  container.innerHTML = '';

  goalTemplates.forEach(template => {
    const isActive = activeGoals.some(g => g.type === template.type && g.status === 'active');

    const card = document.createElement('div');
    card.className = 'template-card';
    card.innerHTML = `
      <div class="template-icon">${template.icon}</div>
      <div class="template-content">
        <h3 class="template-title">${template.title}</h3>
        <p class="template-description">${template.description}</p>
        <div class="template-theory">Based on: ${template.theory}</div>
      </div>
      <button class="template-btn ${isActive ? 'active' : ''}"
              data-template-id="${template.id}"
              ${isActive ? 'disabled' : ''}>
        ${isActive ? '✓ Active' : '+ Add Goal'}
      </button>
    `;

    // Add click handler for template button
    const btn = card.querySelector('.template-btn');
    if (!isActive) {
      btn.addEventListener('click', () => {
        showGoalModal(template);
      });
    }

    container.appendChild(card);
  });
}

async function loadActiveGoals() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_GOALS' });

    if (response && response.ok) {
      activeGoals = response.goals.filter(g => g.status === 'active');
      renderActiveGoals();
    }
  } catch (error) {
    console.error('Error loading goals:', error);
  }
}

function renderActiveGoals() {
  const container = document.getElementById('activeGoalsContainer');
  const noGoalsMsg = document.getElementById('noActiveGoals');

  if (!container) return;

  if (activeGoals.length === 0) {
    container.innerHTML = '';
    noGoalsMsg.style.display = 'flex';
    return;
  }

  container.innerHTML = '';
  noGoalsMsg.style.display = 'none';

  activeGoals.forEach(goal => {
    const template = goalTemplates.find(t => t.type === goal.type);
    const icon = template?.icon || '🎯';

    const card = document.createElement('div');
    card.className = 'goal-card';

    // Calculate progress if we have today's data
    let progressHtml = '';
    if (todayStats && goal.targetValue) {
      const progress = calculateGoalProgress(goal, todayStats);
      progressHtml = `
        <div class="goal-progress">
          <div class="progress-bar">
            <div class="progress-fill ${progress.achieved ? 'achieved' : ''}"
                 style="width: ${Math.min(progress.percentage, 100)}%"></div>
          </div>
          <div class="progress-text">
            ${progress.currentValue}${progress.unit} / ${goal.targetValue}${progress.unit}
            ${progress.achieved ? '✓' : ''}
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="goal-header">
        <div class="goal-icon">${icon}</div>
        <div class="goal-info">
          <h3 class="goal-title">${goal.title}</h3>
          ${goal.description ? `<p class="goal-description">${goal.description}</p>` : ''}
        </div>
        <div class="goal-actions">
          <button class="icon-btn edit-btn" data-goal-id="${goal.id}" title="Edit">✏️</button>
          <button class="icon-btn delete-btn" data-goal-id="${goal.id}" title="Delete">🗑️</button>
        </div>
      </div>
      ${progressHtml}
    `;

    // Add event listeners
    card.querySelector('.edit-btn')?.addEventListener('click', () => {
      showGoalModal(template, goal);
    });

    card.querySelector('.delete-btn')?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete this goal?')) {
        await deleteGoal(goal.id);
      }
    });

    container.appendChild(card);
  });
}

function calculateGoalProgress(goal, dailyStats) {
  let currentValue = 0;
  let unit = '';
  let percentage = 0;
  let achieved = false;

  if (goal.type === 'time_limit') {
    currentValue = Math.round(dailyStats.totalMs / 60000); // Convert to minutes
    unit = ' min';
    percentage = (currentValue / goal.targetValue) * 100;
    achieved = currentValue <= goal.targetValue;
  } else if (goal.type === 'frequency') {
    currentValue = dailyStats.sessionCount || 0;
    unit = ' sessions';
    percentage = (currentValue / goal.targetValue) * 100;
    achieved = currentValue <= goal.targetValue;
  } else if (goal.type === 'quality') {
    // Would need reflection data for this
    currentValue = 0;
    unit = '/5';
    percentage = 0;
    achieved = false;
  } else if (goal.type === 'content_type') {
    // Would need mood analysis
    currentValue = 0;
    unit = '%';
    percentage = 0;
    achieved = false;
  }

  return { currentValue, unit, percentage, achieved };
}

async function loadTodayProgress() {
  try {
    // Get today's stats from dashboard
    const response = await chrome.runtime.sendMessage({ type: 'GET_DASHBOARD' });

    if (response && response.ok) {
      const today = new Date().toISOString().split('T')[0];
      todayStats = response.daily?.[today] || null;
      renderTodayProgress();
    }
  } catch (error) {
    console.error('Error loading today progress:', error);
  }
}

function renderTodayProgress() {
  const container = document.getElementById('todayProgress');
  const noProgressMsg = document.getElementById('noProgress');

  if (!container) return;

  if (!todayStats || todayStats.totalMs === 0) {
    container.innerHTML = '';
    noProgressMsg.style.display = 'flex';
    return;
  }

  container.innerHTML = '';
  noProgressMsg.style.display = 'none';

  const totalMinutes = Math.round(todayStats.totalMs / 60000);
  const sessionCount = todayStats.sessionCount || 0;

  // Overall stats
  const statsCard = document.createElement('div');
  statsCard.className = 'progress-stats';
  statsCard.innerHTML = `
    <div class="stat-box">
      <div class="stat-icon">⏱️</div>
      <div class="stat-content">
        <div class="stat-value">${totalMinutes} min</div>
        <div class="stat-label">Total Time Today</div>
      </div>
    </div>
    <div class="stat-box">
      <div class="stat-icon">📱</div>
      <div class="stat-content">
        <div class="stat-value">${sessionCount}</div>
        <div class="stat-label">Sessions Today</div>
      </div>
    </div>
  `;

  container.appendChild(statsCard);

  // Goal progress for active goals
  if (activeGoals.length > 0) {
    const goalsProgress = document.createElement('div');
    goalsProgress.className = 'goals-progress';
    goalsProgress.innerHTML = '<h3 class="progress-subtitle">Goal Progress</h3>';

    activeGoals.forEach(goal => {
      const progress = calculateGoalProgress(goal, todayStats);
      const template = goalTemplates.find(t => t.type === goal.type);

      const progressItem = document.createElement('div');
      progressItem.className = `progress-item ${progress.achieved ? 'achieved' : ''}`;
      progressItem.innerHTML = `
        <div class="progress-label">
          <span class="progress-icon">${template?.icon || '🎯'}</span>
          <span class="progress-name">${goal.title}</span>
        </div>
        <div class="progress-value">
          ${progress.currentValue}${progress.unit} / ${goal.targetValue}${progress.unit}
          ${progress.achieved ? '<span class="check-icon">✓</span>' : ''}
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${progress.achieved ? 'achieved' : ''}"
               style="width: ${Math.min(progress.percentage, 100)}%"></div>
        </div>
      `;

      goalsProgress.appendChild(progressItem);
    });

    container.appendChild(goalsProgress);
  }
}

function showGoalModal(template = null, existingGoal = null) {
  const modal = document.getElementById('goalModal');
  const form = document.getElementById('goalForm');
  const modalTitle = document.getElementById('modalTitle');

  // Reset form
  form.reset();

  if (existingGoal) {
    // Edit mode
    modalTitle.textContent = 'Edit Goal';
    document.getElementById('goalId').value = existingGoal.id;
    document.getElementById('goalType').value = existingGoal.type;
    document.getElementById('goalTitle').value = existingGoal.title;
    document.getElementById('goalDescription').value = existingGoal.description || '';
    document.getElementById('targetValue').value = existingGoal.targetValue || '';

    const tmpl = template || goalTemplates.find(t => t.type === existingGoal.type);
    if (tmpl) {
      document.getElementById('targetUnit').textContent = tmpl.unit;
      document.getElementById('targetHint').textContent = `Recommended: ${tmpl.defaultValue} ${tmpl.unit}`;
    }
  } else if (template) {
    // New goal from template
    modalTitle.textContent = 'Add Goal';
    document.getElementById('goalType').value = template.type;
    document.getElementById('goalTitle').value = template.title;
    document.getElementById('goalDescription').value = template.description;
    document.getElementById('targetValue').value = template.defaultValue;
    document.getElementById('targetUnit').textContent = template.unit;
    document.getElementById('targetHint').textContent = `Recommended: ${template.defaultValue} ${template.unit}`;
  } else {
    // New custom goal
    modalTitle.textContent = 'Add Custom Goal';
  }

  modal.style.display = 'flex';
}

function hideGoalModal() {
  document.getElementById('goalModal').style.display = 'none';
}

async function saveGoal() {
  const goalId = document.getElementById('goalId').value;
  const goalType = document.getElementById('goalType').value;
  const title = document.getElementById('goalTitle').value;
  const description = document.getElementById('goalDescription').value;
  const targetValue = parseInt(document.getElementById('targetValue').value);

  const goal = {
    id: goalId || undefined,
    type: goalType,
    title,
    description,
    targetValue,
    status: 'active'
  };

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_GOAL',
      goal
    });

    if (response && response.ok) {
      hideGoalModal();
      await loadActiveGoals();
      await loadTodayProgress();
      renderGoalTemplates(); // Update template buttons
    } else {
      alert('Failed to save goal. Please try again.');
    }
  } catch (error) {
    console.error('Error saving goal:', error);
    alert('Failed to save goal. Please try again.');
  }
}

async function deleteGoal(goalId) {
  const goal = activeGoals.find(g => g.id === goalId);
  if (!goal) return;

  goal.status = 'deleted';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_GOAL',
      goal
    });

    if (response && response.ok) {
      await loadActiveGoals();
      await loadTodayProgress();
      renderGoalTemplates(); // Update template buttons
    }
  } catch (error) {
    console.error('Error deleting goal:', error);
  }
}
