// Reflection page logic

let sessionData = null;

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
  showLoadingScreen({ step: 'Starting analysis...', progress: 0 });

  let attempts = 0;
  const maxAttempts = 60; // 60 seconds max wait

  while (attempts < maxAttempts) {
    const status = await checkProcessingStatus();

    if (!status || !status.isProcessing) {
      // Processing complete!
      hideLoadingScreen();
      return true;
    }

    // Update loading screen
    showLoadingScreen(status);

    // Wait 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }

  // Timeout
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
  document.getElementById('sessionPlatform').textContent = (sessionData.platform || 'Instagram').charAt(0).toUpperCase() + (sessionData.platform || 'Instagram').slice(1);
  document.getElementById('postsViewed').textContent = sessionData.raw?.posts?.length || 0;

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
      ${nudge.action ? `<button class="btn btn-primary nudge-action">${nudge.action}</button>` : ''}
    `;
    container.appendChild(nudgeCard);
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
