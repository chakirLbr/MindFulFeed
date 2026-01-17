/**
 * Puter.js Loader for MindfulFeed Extension
 *
 * This file loads the Puter.js library for FREE unlimited AI access.
 * No API keys or authentication required!
 *
 * SETUP INSTRUCTIONS:
 * Download https://js.puter.com/v2/puter.min.js and save it in this directory
 * OR the library will be loaded dynamically (may have CSP restrictions)
 */

// For Chrome extension compatibility, we'll create a simple wrapper
// that uses fetch-based approach until puter.js is fully integrated

const PuterAI = (() => {
  /**
   * Check if puter library is loaded globally
   */
  function isPuterLoaded() {
    return typeof puter !== 'undefined' && puter.ai;
  }

  /**
   * Chat with AI using Puter.js (if available)
   * Falls back to fetch-based approach if library not loaded
   */
  async function chat(options) {
    // If Puter.js library is loaded, use it directly
    if (isPuterLoaded()) {
      console.log('[Puter] Using Puter.js library directly');
      return await puter.ai.chat(options);
    }

    // Fallback: Use fetch-based approach (no auth needed according to docs)
    // This is a simplified implementation based on Puter.js behavior
    console.log('[Puter] Using fetch-based Puter API (no auth)');

    const response = await fetch('https://api.puter.com/drivers/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // NO Authorization header needed! Puter.js is free to use
      },
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

    if (!response.ok) {
      throw new Error(`Puter API error: ${response.status}`);
    }

    const data = await response.json();

    // Return in format compatible with OpenAI
    return {
      choices: [{
        message: {
          content: data.result?.choices?.[0]?.message?.content || data.result
        }
      }]
    };
  }

  return { chat, isPuterLoaded };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PuterAI;
}
