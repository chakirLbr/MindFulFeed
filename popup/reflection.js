// Reflection page logic

let sessionData = null;

// Helper function for multi-platform session data
function getSessionItemCount(session) {
  if (!session || !session.raw) return 0;

  const raw = session.raw;
  let totalCount = 0;

  // New multi-platform format
  if (raw.platforms) {
    if (raw.platforms.instagram?.posts) {
      totalCount += raw.platforms.instagram.posts.length;
    }
    if (raw.platforms.youtube?.videos) {
      totalCount += raw.platforms.youtube.videos.length;
    }
  } else {
    // Old single-platform format
    const platform = raw.platform || session.platform || 'instagram';
    if (platform === 'youtube' && raw.videos) {
      totalCount = raw.videos.length;
    } else if (raw.posts) {
      totalCount = raw.posts.length;
    }
  }

  return totalCount;
}

// Format time
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

// Check if session is still being processed
async function checkProcessingStatus() {
  const res = await sendMessage({ type: 'GET_PROCESSING_STATUS' });

  if (res && res.ok && res.status) {
    return res.status;
  }

  return null;
}

// Show loading screen
function showLoadingScreen(status) {
  // Check if loading screen already exists
  let loadingScreen = document.getElementById('loadingScreen');

  if (!loadingScreen) {
    // Create loading screen
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

    // Add styles
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

  // Update loading screen with status
  if (status) {
    document.getElementById('loadingMessage').textContent = status.step || 'Processing...';
    document.getElementById('progressFill').style.width = `${status.progress || 0}%`;
    document.getElementById('progressText').textContent = `${status.progress || 0}%`;
  }
}

// Hide loading screen
function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    loadingScreen.remove();
  }
}

// Wait for processing to complete
async function waitForProcessing() {
  // First check - if already complete, don't show loading screen at all
  const initialStatus = await checkProcessingStatus();

  if (!initialStatus || !initialStatus.isProcessing) {
    console.log('[Reflection] Processing already complete, no need to wait');
    return true;
  }

  // Processing is ongoing, show loading screen
  console.log('[Reflection] Processing in progress, showing loading screen...');
  showLoadingScreen(initialStatus);

  let attempts = 0;
  const maxAttempts = 60; // 60 seconds max wait

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;

    const status = await checkProcessingStatus();

    if (!status || !status.isProcessing) {
      // Processing complete!
      console.log('[Reflection] Processing complete, hiding loading screen');
      hideLoadingScreen();
      return true;
    }

    // Update loading screen with current progress
    showLoadingScreen(status);
    console.log(`[Reflection] Still processing... ${status.progress}% - ${status.step}`);
  }

  // Timeout - hide screen anyway
  console.warn('[Reflection] Processing timeout after 60 seconds, hiding loading screen');
  hideLoadingScreen();
  return false;
}

// Load session data
async function loadSessionData() {
  // First check if session is still being processed
  const status = await checkProcessingStatus();

  if (status && status.isProcessing) {
    console.log('[Reflection] Session still processing, waiting for completion...');
    await waitForProcessing();
  }

  // Now load the data
  const res = await sendMessage({ type: 'GET_DASHBOARD' });

  if (!res || !res.ok || !res.lastSession) {
    // No session data
    document.querySelector('.session-summary h2').textContent = 'No recent session found';
    return null;
  }

  sessionData = res.lastSession;

  // Update summary
  document.getElementById('sessionDuration').textContent = formatTime(sessionData.durationMs);

  // Display platform(s)
  const platform = sessionData.platform || 'instagram';
  let platformName = platform.charAt(0).toUpperCase() + platform.slice(1);

  // If multi-platform session, show all platforms
  if (sessionData.isMultiPlatform && sessionData.platforms) {
    platformName = sessionData.platforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' + ');
  }

  document.getElementById('sessionPlatform').textContent = platformName;

  // Count all items across all platforms
  const itemCount = getSessionItemCount(sessionData);
  document.getElementById('postsViewed').textContent = itemCount;

  // Update label for posts/videos
  const postsLabel = document.querySelector('.stat:nth-child(3) .stat-label');
  if (postsLabel) {
    if (sessionData.isMultiPlatform) {
      postsLabel.textContent = 'Videos & Posts';
    } else {
      postsLabel.textContent = platform === 'youtube' ? 'Videos Viewed' : 'Posts Viewed';
    }
  }

  // Show achievements if any
  if (sessionData.newAchievements && sessionData.newAchievements.length > 0) {
    showAchievement(sessionData.newAchievements[0]);
  }

  // Show nudges if any
  if (sessionData.nudges && sessionData.nudges.length > 0) {
    showNudges(sessionData.nudges);
  }

  return sessionData;
}

// Show achievement notification
function showAchievement(achievement) {
  const notif = document.getElementById('achievementNotif');
  document.getElementById('achievementIcon').textContent = achievement.icon || '🏆';
  document.getElementById('achievementTitle').textContent = achievement.title;
  document.getElementById('achievementDesc').textContent = achievement.description;
  notif.classList.remove('hidden');
}

// Show nudges
function showNudges(nudges) {
  const container = document.getElementById('nudgesContainer');
  container.innerHTML = '';

  for (const nudge of nudges) {
    const nudgeCard = document.createElement('div');
    nudgeCard.className = 'card nudge-card';
    nudgeCard.innerHTML = `
      <h3>${nudge.message}</h3>
      ${nudge.action ? `<button class="btn btn-primary nudge-action" data-action="${nudge.action}" data-trigger="${nudge.trigger}">${nudge.action}</button>` : ''}
    `;

    // Add click handler for action button
    if (nudge.action) {
      const actionBtn = nudgeCard.querySelector('.nudge-action');
      actionBtn.addEventListener('click', () => handleNudgeAction(nudge));
    }

    container.appendChild(nudgeCard);
  }
}

// Handle nudge action button clicks
function handleNudgeAction(nudge) {
  switch (nudge.trigger) {
    case 'longSession':
      // Scroll to reflection form
      document.getElementById('reflectionForm')?.scrollIntoView({ behavior: 'smooth' });
      // Focus on first unanswered question
      const firstSlider = document.querySelector('input[type="range"]');
      if (firstSlider) {
        firstSlider.focus();
      }
      break;

    case 'frequentSessions':
      // Scroll to mood question
      document.getElementById('moodQuestion')?.scrollIntoView({ behavior: 'smooth' });
      break;

    case 'negativeContent':
      // Scroll to mood question
      document.getElementById('moodQuestion')?.scrollIntoView({ behavior: 'smooth' });
      break;

    case 'achievement':
      // Navigate to insights page
      window.location.href = 'insights.html';
      break;

    default:
      // Default: scroll to reflection form
      document.getElementById('reflectionForm')?.scrollIntoView({ behavior: 'smooth' });
      break;
  }
}

// Setup scale sliders
function setupSliders() {
  const sliders = ['awareness', 'value', 'control'];

  for (const id of sliders) {
    const slider = document.getElementById(id);
    const valueDisplay = document.getElementById(`${id}Value`);

    slider.addEventListener('input', () => {
      valueDisplay.textContent = slider.value;
    });
  }
}

// Handle form submission
document.getElementById('reflectionForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const responses = {
    awareness: parseInt(formData.get('awareness')),
    mood: formData.get('mood'),
    value: parseInt(formData.get('value')),
    control: parseInt(formData.get('control')),
    notes: formData.get('notes') || ''
  };

  // Save reflection
  const res = await sendMessage({
    type: 'SAVE_REFLECTION',
    sessionId: sessionData?.sessionId || `s_${Date.now()}`,
    responses
  });

  if (res && res.ok) {
    // Success! Redirect to summary
    window.location.href = 'summary.html';
  } else {
    alert('Failed to save reflection. Please try again.');
  }
});

// Skip button
document.getElementById('skipBtn').addEventListener('click', () => {
  if (confirm('Skip reflection? You can still view your session analytics.')) {
    window.location.href = 'summary.html';
  }
});

// Close achievement
document.getElementById('closeAchievement')?.addEventListener('click', () => {
  document.getElementById('achievementNotif').classList.add('hidden');
});

// Init
setupSliders();
loadSessionData();
