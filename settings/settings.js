// Settings page logic

const STORAGE_KEY = 'mf_openai_api_key';
const MODE_KEY = 'mf_analysis_mode';
const MODEL_KEY = 'mf_ai_model';
const PUTER_TOKEN_KEY = 'mf_puter_token';
const LOCAL_ENDPOINT_KEY = 'mf_local_endpoint';

// Load settings on page load
async function loadSettings() {
  const settings = await chrome.storage.local.get([STORAGE_KEY, MODE_KEY, MODEL_KEY, PUTER_TOKEN_KEY, LOCAL_ENDPOINT_KEY]);

  // Load API key
  if (settings[STORAGE_KEY]) {
    document.getElementById('apiKey').value = settings[STORAGE_KEY];
  }

  // Load Puter token
  if (settings[PUTER_TOKEN_KEY]) {
    document.getElementById('puterToken').value = settings[PUTER_TOKEN_KEY];
  }

  // Load local endpoint
  const localEndpoint = settings[LOCAL_ENDPOINT_KEY] || 'http://localhost:1234/v1';
  document.getElementById('localEndpoint').value = localEndpoint;

  // Load AI model
  const model = settings[MODEL_KEY] || 'gpt-5';
  const modelSelect = document.getElementById('aiModel');
  if (modelSelect) {
    modelSelect.value = model;
  }

  // Load analysis mode
  const mode = settings[MODE_KEY] || 'heuristic';
  const radio = document.querySelector(`input[name="analysisMode"][value="${mode}"]`);
  if (radio) {
    radio.checked = true;
    updateModeVisibility(mode);
  }
}

// Update visibility based on selected mode
function updateModeVisibility(mode) {
  const puterSection = document.getElementById('puterModelSection');
  const localSection = document.getElementById('localModelSection');

  if (mode === 'puter') {
    puterSection.classList.remove('hidden');
    localSection.classList.add('hidden');
  } else if (mode === 'local') {
    localSection.classList.remove('hidden');
    puterSection.classList.add('hidden');
  } else {
    puterSection.classList.add('hidden');
    localSection.classList.add('hidden');
  }
}

// Listen for mode changes
document.querySelectorAll('input[name="analysisMode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    updateModeVisibility(e.target.value);
  });
});

// Save settings
document.getElementById('saveSettings').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  const puterToken = document.getElementById('puterToken').value.trim();
  const localEndpoint = document.getElementById('localEndpoint').value.trim();
  const mode = document.querySelector('input[name="analysisMode"]:checked').value;
  const model = document.getElementById('aiModel').value;

  // Validate based on mode
  if (mode === 'ai' && !apiKey) {
    showStatus('⚠️ Please enter an OpenAI API key for AI mode', 'error');
    return;
  }

  if (mode === 'puter' && !puterToken) {
    showStatus('⚠️ Please enter a Puter app token for Puter mode', 'error');
    return;
  }

  if (mode === 'local' && !localEndpoint) {
    showStatus('⚠️ Please enter LM Studio endpoint URL', 'error');
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEY]: apiKey,
    [PUTER_TOKEN_KEY]: puterToken,
    [LOCAL_ENDPOINT_KEY]: localEndpoint,
    [MODE_KEY]: mode,
    [MODEL_KEY]: model
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

// Toggle Puter token visibility
document.getElementById('togglePuterToken').addEventListener('click', () => {
  const input = document.getElementById('puterToken');
  const button = document.getElementById('togglePuterToken');

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
  const mode = document.querySelector('input[name="analysisMode"]:checked').value;

  if (mode === 'heuristic') {
    showStatus('ℹ️ Heuristic mode does not require API testing (works offline)', 'info');
    return;
  }

  if (mode === 'puter') {
    showStatus('✅ Puter.js requires no setup! Just save your settings and start tracking. 🎉', 'success');
    return;
  }

  if (mode === 'local') {
    const localEndpoint = document.getElementById('localEndpoint').value.trim();

    if (!localEndpoint) {
      showStatus('⚠️ Please enter LM Studio endpoint URL first', 'error');
      return;
    }

    showStatus('🧪 Testing LM Studio connection...', 'info');

    try {
      const apiUrl = localEndpoint.replace('/v1', '') + '/v1/models';
      const response = await fetch(apiUrl);

      if (response.ok) {
        const data = await response.json();
        const modelCount = data.data?.length || 0;
        showStatus(`✅ Connected to LM Studio! Found ${modelCount} model(s) loaded. Ready to analyze! 🎉`, 'success');
      } else {
        showStatus('❌ Cannot connect to LM Studio. Make sure:\n1. LM Studio is running\n2. Server is started (Local Server tab)\n3. A model is loaded', 'error');
      }
    } catch (error) {
      showStatus(`❌ Cannot connect to LM Studio at ${localEndpoint}. Make sure LM Studio server is running!`, 'error');
    }
    return;
  }

  const apiKey = document.getElementById('apiKey').value.trim();

  if (!apiKey) {
    showStatus('⚠️ Please enter an OpenAI API key first', 'error');
    return;
  }

  showStatus('🧪 Testing OpenAI API...', 'info');

  try {
    // Test direct OpenAI
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
      const errorMsg = error.error?.message || 'Unknown error';

      // Check if it's a quota/billing error
      if (errorMsg.includes('quota') || errorMsg.includes('billing')) {
        showStatus(
          `❌ No credits available. Add credits at: platform.openai.com/account/billing 💳 (Error: ${errorMsg})`,
          'error'
        );
      } else {
        showStatus(`❌ API Error: ${errorMsg}`, 'error');
      }
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

  // Auto-hide after different durations based on type
  const duration = type === 'error' ? 15000 : 5000; // Errors stay 15 seconds
  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, duration);
}

// Initialize
loadSettings();
