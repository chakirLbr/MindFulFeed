// Settings page logic

const STORAGE_KEY = 'mf_openai_api_key';
const MODE_KEY = 'mf_analysis_mode';

// Load settings on page load
async function loadSettings() {
  const settings = await chrome.storage.local.get([STORAGE_KEY, MODE_KEY]);

  // Load API key
  if (settings[STORAGE_KEY]) {
    document.getElementById('apiKey').value = settings[STORAGE_KEY];
  }

  // Load analysis mode
  const mode = settings[MODE_KEY] || 'heuristic';
  const radio = document.querySelector(`input[name="analysisMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
}

// Save settings
document.getElementById('saveSettings').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  const mode = document.querySelector('input[name="analysisMode"]:checked').value;

  await chrome.storage.local.set({
    [STORAGE_KEY]: apiKey,
    [MODE_KEY]: mode
  });

  showStatus('✅ Settings saved successfully!', 'success');
});

// Toggle API key visibility
document.getElementById('toggleApiKey').addEventListener('click', () => {
  const input = document.getElementById('apiKey');
  const button = document.getElementById('toggleApiKey');

  if (input.type === 'password') {
    input.type = 'text';
    button.textContent = 'Hide';
  } else {
    input.type = 'password';
    button.textContent = 'Show';
  }
});

// Test API
document.getElementById('testApi').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();

  if (!apiKey) {
    showStatus('⚠️ Please enter an API key first', 'error');
    return;
  }

  showStatus('🧪 Testing API key...', 'info');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{role: 'user', content: 'Say "API test successful"'}],
        max_tokens: 10
      })
    });

    if (response.ok) {
      showStatus('✅ API key is valid! You can now use AI-powered analysis.', 'success');
    } else {
      const error = await response.json();
      showStatus(`❌ API key invalid: ${error.error?.message || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    showStatus(`❌ Error testing API: ${error.message}`, 'error');
  }
});

// Show status message
function showStatus(message, type) {
  const statusEl = document.getElementById('statusMessage');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  statusEl.classList.remove('hidden');

  // Auto-hide after 5 seconds
  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 5000);
}

// Initialize
loadSettings();
