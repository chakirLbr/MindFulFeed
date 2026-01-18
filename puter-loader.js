/**
 * Puter.js Loader for MindfulFeed Extension
 *
 * Loads Puter.js library for FREE unlimited AI access.
 * No API keys or authentication required!
 */

// Try to load Puter.js from CDN for service worker use
let puterLoaded = false;
try {
  // Attempt to load Puter.js library from CDN
  // Note: This might not work due to CSP in service workers
  importScripts('https://js.puter.com/v2/puter.js');
  puterLoaded = true;
  console.log('[Puter] ✅ Puter.js library loaded from CDN');
} catch (e) {
  console.log('[Puter] ⚠️ Could not load Puter.js from CDN:', e.message);
  console.log('[Puter] Will use direct API approach instead');
}

const PuterAI = (() => {
  /**
   * Check if puter library is loaded globally
   */
  function isPuterLoaded() {
    return puterLoaded && typeof puter !== 'undefined' && puter.ai;
  }

  /**
   * Chat with AI using Puter.js
   */
  async function chat(options) {
    // If Puter.js library is loaded, use it directly
    if (isPuterLoaded()) {
      console.log('[Puter] Using Puter.js library directly');
      try {
        return await puter.ai.chat(options);
      } catch (e) {
        console.error('[Puter] Library call failed:', e);
        throw e;
      }
    }

    // Fallback: Use direct API approach
    console.log('[Puter] Using direct Puter API (with token)');
    console.log('[Puter] Request:', {
      driver: options.driver,
      model: options.model,
      messagesCount: options.messages?.length,
      hasToken: !!options.token
    });

    try {
      const headers = {
        'Content-Type': 'application/json'
      };

      // Add authentication token if provided
      if (options.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
        console.log('[Puter] Token added to Authorization header');
      } else {
        console.warn('[Puter] No token provided - API call will likely fail!');
      }

      const response = await fetch('https://api.puter.com/drivers/call', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          driver: options.driver || 'openai',
          interface: 'chat-completion',
          method: 'complete',
          args: {
            model: options.model,
            messages: options.messages,
            temperature: options.temperature || 0.3,
            response_format: options.response_format
          }
        })
      });

      console.log('[Puter] API response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Puter] API error response:', errorText);
        throw new Error(`Puter API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('[Puter] API response data structure:', {
        hasResult: !!data.result,
        hasChoices: !!data.choices,
        keys: Object.keys(data)
      });

      // Check if Puter API returned an error
      if (data.success === false && data.error) {
        console.error('[Puter] API returned error:', data.error);
        const errorMessage = data.error.message || JSON.stringify(data.error);
        throw new Error(`Puter API error: ${errorMessage}`);
      }

      // Try different response formats
      let content;
      if (data.result?.choices?.[0]?.message?.content) {
        content = data.result.choices[0].message.content;
      } else if (data.choices?.[0]?.message?.content) {
        content = data.choices[0].message.content;
      } else if (data.result) {
        content = data.result;
      } else {
        console.error('[Puter] Unexpected response format:', data);
        throw new Error('Unexpected Puter API response format');
      }

      console.log('[Puter] Extracted content preview:', content.substring(0, 100));

      // Return in format compatible with OpenAI
      return {
        choices: [{
          message: {
            content: content
          }
        }]
      };
    } catch (e) {
      console.error('[Puter] Complete error details:', e);
      throw e;
    }
  }

  return { chat, isPuterLoaded };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PuterAI;
}
