// AI-powered content analysis for MindfulFeed
// Multimodal analysis: text captions + image URLs
// Psychological theory-grounded categorization

const AI_ANALYSIS = (() => {
  // Psychological theory-based categories
  const CONTENT_DIMENSIONS = {
    topics: {
      // Based on uses and gratifications theory
      "Educational": "Educational, learning, informative content",
      "Entertainment": "Fun, humorous, entertaining content",
      "Social": "Friends, family, relationships, community, sports, health",
      "Informative": "News, politics, current affairs, inspiration, shopping",
      "Creative Arts": "Art, music, creativity, cultural content (internal use only)",
      "Health & Wellness": "Fitness, mental health, self-care (internal use only)",
      "News & Current Events": "News, politics, current affairs (internal use only)",
      "Inspiration": "Motivational, aspirational content (internal use only)",
      "Shopping & Commerce": "Products, shopping content (internal use only)"
    },

    emotions: {
      // Based on affective computing and emotional valence
      "Positive": "Uplifting, joyful, hopeful, exciting",
      "Neutral": "Informational, balanced, factual",
      "Negative": "Sad, anxious, frustrating, concerning",
      "Mixed": "Complex emotions, bittersweet, thought-provoking"
    },

    engagement: {
      // Based on attention economy and digital wellbeing research
      "Mindful": "Intentional, educational, personally relevant",
      "Mindless": "Passive scrolling, low value, time-filling",
      "Engaging": "Interesting but potentially distracting"
    }
  };

  /**
   * Analyzes a batch of posts using AI (multimodal: text + images)
   * @param {Array} posts - Array of {caption, href, dwellMs, imageUrl}
   * @param {string} apiKey - Optional API key for Claude or similar service
   * @returns {Promise<Object>} Analysis results
   */
  async function analyzePostsBatch(posts, apiKey = null) {
    if (!posts || posts.length === 0) {
      return createEmptyAnalysis();
    }

    // Check if API key is provided or stored in settings
    if (!apiKey) {
      // Try to get from storage
      try {
        const settings = await chrome.storage.local.get(['mf_openai_api_key', 'mf_analysis_mode', 'mf_ai_model', 'mf_local_endpoint']);
        const mode = settings.mf_analysis_mode || 'heuristic';
        const model = settings.mf_ai_model || 'gpt-4o-mini';

        // Check if using LM Studio (Local AI)
        if (mode === 'local' && settings.mf_local_endpoint) {
          console.log('[AI Analysis] Using LM Studio local AI at:', settings.mf_local_endpoint);
          return await analyzeWithLocal(posts, settings.mf_local_endpoint);
        }
        // Check if using direct OpenAI
        else if (mode === 'ai' && settings.mf_openai_api_key && settings.mf_openai_api_key.startsWith('sk-')) {
          console.log('[AI Analysis] Using stored OpenAI API key');
          return await analyzeWithAI(posts, settings.mf_openai_api_key, model);
        }
      } catch (e) {
        console.log('[AI Analysis] Could not read settings, using heuristics:', e);
      }
    } else if (apiKey.startsWith('sk-')) {
      // API key provided directly (OpenAI)
      return await analyzeWithAI(posts, apiKey, 'gpt-4-turbo-preview');
    }

    // Default: use enhanced heuristic analysis
    console.log('[AI Analysis] Using enhanced heuristic analysis');
    return await analyzeWithHeuristics(posts);
  }

  /**
   * Extract JSON from AI response that may contain additional text
   * Handles responses like: "Here's the analysis: ```json {...} ```"
   * or "The analysis shows: {...}"
   * @param {string} content - AI response content
   * @returns {Object|null} Parsed JSON object or null if not found
   */
  function extractJSON(content) {
    // Try 1: Direct JSON parse (if response is pure JSON)
    try {
      return JSON.parse(content);
    } catch (e) {
      // Continue to other methods
    }

    // Try 2: Extract from markdown code blocks (```json ... ``` or ``` ... ```)
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (e) {
        console.warn('[AI Analysis] Found code block but failed to parse JSON:', e);
      }
    }

    // Try 3: Extract JSON object using regex (find { ... })
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.warn('[AI Analysis] Found JSON-like text but failed to parse:', e);
      }
    }

    // Try 4: Look for "posts" and "overall" keys (specific to our format)
    const customMatch = content.match(/"posts"\s*:\s*\[[\s\S]*?\]\s*,\s*"overall"\s*:\s*\{[\s\S]*?\}/);
    if (customMatch) {
      try {
        // Wrap in braces if not already
        const jsonStr = customMatch[0].startsWith('{') ? customMatch[0] : `{${customMatch[0]}}`;
        return JSON.parse(jsonStr);
      } catch (e) {
        console.warn('[AI Analysis] Found posts/overall structure but failed to parse:', e);
      }
    }

    console.error('[AI Analysis] Could not extract valid JSON from response. Content preview:', content.substring(0, 200));
    return null;
  }

  /**
   * AI-powered analysis using LM Studio (local AI models)
   * TWO-STAGE APPROACH for local models:
   * - Stage 1: Vision model describes images
   * - Stage 2: Text model categorizes based on descriptions + captions
   *
   * Note: Images are converted to base64 by the content script (foreground.js)
   * and passed in via post.imageBase64 field
   * @param {Array} posts - Posts to analyze
   * @param {string} endpoint - LM Studio API endpoint (e.g., http://localhost:1234/v1)
   */
  async function analyzeWithLocal(posts, endpoint) {
    try {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('[AI Analysis] 🤖 Starting LM Studio Analysis');
      console.log('[AI Analysis] 🌐 Endpoint:', endpoint);

      // Prepare analysis data - analyze ALL posts seen in session
      // Lower cap for vision models to prevent VRAM exhaustion
      const hasAnyImages = posts.some(p => p.imageBase64);
      const MAX_POSTS = hasAnyImages ? 10 : 50; // 10 for vision (VRAM limit), 50 for text-only
      const topPosts = posts.slice(0, Math.min(posts.length, MAX_POSTS));

      console.log(`[AI Analysis] 📊 Analyzing ${topPosts.length} posts out of ${posts.length} total posts seen`);
      if (posts.length > MAX_POSTS) {
        console.log(`[AI Analysis] ⚠️  Capped at ${MAX_POSTS} posts to prevent ${hasAnyImages ? 'VRAM exhaustion' : 'API limits'}`);
      }

      // Check if we have images (vision model support)
      const hasImages = topPosts.some(p => p.imageBase64);
      const imagesCount = topPosts.filter(p => p.imageBase64).length;
      console.log('[AI Analysis] 🖼️  Images found:', imagesCount);
      console.log('[AI Analysis] 📝 Mode:', hasImages ? 'Two-Stage Analysis (Vision → Text)' : 'Text-only analysis');

      // TWO-STAGE APPROACH for local models with images
      if (hasImages) {
        console.log('[AI Analysis] Starting Two-Stage Analysis...');

        // === STAGE 1: Vision Model - Describe Images ===
        console.log('[AI Analysis] Stage 1: Using vision model to describe images...');
        const imageDescriptions = await describeImagesWithVision(topPosts, endpoint);

        // === STAGE 2: Text Model - Categorize Based on Descriptions + Captions ===
        console.log('[AI Analysis] 📝 Stage 2: Using text model to categorize based on descriptions + captions...');
        const aiResult = await categorizeWithTextModel(topPosts, imageDescriptions, endpoint);

        console.log('[AI Analysis] ✅ Two-Stage Analysis complete!');
        console.log('[AI Analysis] 📈 Topics detected:', Object.keys(aiResult.overall.topics).filter(t => aiResult.overall.topics[t] > 0.05).join(', '));
        console.log('[AI Analysis] 😊 Emotions detected:', Object.keys(aiResult.overall.emotions).filter(e => aiResult.overall.emotions[e] > 0.05).join(', '));
        console.log('═══════════════════════════════════════════════════════════');

        // Convert to our format
        return {
          topics: aiResult.overall.topics,
          emotions: aiResult.overall.emotions,
          engagement: { Mindful: 0.5, Mindless: 0.3, Engaging: 0.2 },
          totalDwellMs: posts.reduce((sum, p) => sum + (p.dwellMs || 0), 0),
          postsAnalyzed: posts.length,
          analysisMethod: 'local-lmstudio-two-stage',
          perPostAnalysis: aiResult.posts || [],
          insights: generatePsychologicalInsights(
            aiResult.overall.topics,
            aiResult.overall.emotions,
            { Mindful: 0.5, Mindless: 0.3, Engaging: 0.2 },
            posts.reduce((sum, p) => sum + (p.dwellMs || 0), 0)
          )
        };
      } else {
        // Text-only: Single stage analysis
        console.log('[AI Analysis] Text-only mode: Single stage analysis');
        const captions = topPosts.map((p, i) => `${i+1}. "${p.caption}"`).join('\n');

        const messages = [
          {
            role: 'system',
            content: 'You are an expert psychologist analyzing social media consumption patterns. Be precise and use the exact category names provided.\n\nIMPORTANT: Your entire response must be ONLY valid JSON. Do not include any explanatory text, descriptions, or commentary. Return ONLY the JSON object, nothing else.'
          },
          {
            role: 'user',
            content: `Analyze these ${topPosts.length} social media posts and categorize them:

POSTS:
${captions}

Provide a JSON response with:
1. For each post (by number), classify:
   - topic: Educational, Entertainment, Social, or Informative
   - emotion: Positive, Negative, Neutral, or Mixed

2. Overall time distribution (as percentages) across all topics and emotions, weighted by these dwell times:
${topPosts.map((p, i) => `Post ${i+1}: ${Math.round(p.dwellMs/1000)}s`).join(', ')}

RESPONSE FORMAT - Return ONLY this JSON structure with NO additional text:
{
  "posts": [{"topic": "Social", "emotion": "Positive"}, ...],
  "overall": {
    "topics": {"Educational": 0.15, "Social": 0.25, "Entertainment": 0.35, "Informative": 0.25},
    "emotions": {"Positive": 0.60, "Neutral": 0.30, ...}
  }
}

Do NOT add explanations. Return ONLY the JSON object.`
          }
        ];

        const apiUrl = endpoint.endsWith('/v1') ? endpoint : endpoint + '/v1';
        const response = await fetch(`${apiUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages: messages,
            temperature: 0.3,
            max_tokens: 2000
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LM Studio API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        const aiResult = extractJSON(content);

        if (!aiResult) {
          throw new Error('No valid JSON found in LM Studio response');
        }

        console.log('[AI Analysis] LM Studio response received:', aiResult);

        // Convert to our format
        return {
          topics: aiResult.overall.topics,
          emotions: aiResult.overall.emotions,
          engagement: { Mindful: 0.5, Mindless: 0.3, Engaging: 0.2 },
          totalDwellMs: posts.reduce((sum, p) => sum + (p.dwellMs || 0), 0),
          postsAnalyzed: posts.length,
          analysisMethod: 'local-lmstudio-text',
          perPostAnalysis: aiResult.posts || [],
          insights: generatePsychologicalInsights(
            aiResult.overall.topics,
            aiResult.overall.emotions,
            { Mindful: 0.5, Mindless: 0.3, Engaging: 0.2 },
            posts.reduce((sum, p) => sum + (p.dwellMs || 0), 0)
          )
        };
      }

    } catch (error) {
      console.error('[AI Analysis] LM Studio error, falling back to heuristics:', error);
      return await analyzeWithHeuristics(posts);
    }
  }

  /**
   * STAGE 1: Use vision model to describe images
   * @param {Array} posts - Posts with images
   * @param {string} endpoint - LM Studio endpoint
   * @returns {Promise<Array>} Array of image descriptions
   */
  async function describeImagesWithVision(posts, endpoint) {
    const postsWithImages = posts.filter(p => p.imageBase64);
    console.log(`[AI Analysis - Stage 1] 🖼️  Describing ${postsWithImages.length} images with vision model...`);

    const descriptions = [];

    // Process each image individually to get descriptions
    for (let i = 0; i < postsWithImages.length; i++) {
      const post = postsWithImages[i];
      const postIndex = posts.indexOf(post);
      console.log(`[AI Analysis - Stage 1] 🔍 Processing image ${i + 1}/${postsWithImages.length}...`);

      const messages = [
        {
          role: 'system',
          content: 'You are an expert at analyzing images. Describe what you see in detail, focusing on: the main subject, activity, mood/emotion, and context. Be concise (2-3 sentences).'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Describe this Instagram post image in detail:'
            },
            {
              type: 'image_url',
              image_url: {
                url: post.imageBase64
              }
            }
          ]
        }
      ];

      try {
        const apiUrl = endpoint.endsWith('/v1') ? endpoint : endpoint + '/v1';
        const response = await fetch(`${apiUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages: messages,
            temperature: 0.3,
            max_tokens: 200 // Short description
          })
        });

        if (response.ok) {
          const data = await response.json();
          const description = data.choices[0].message.content.trim();
          descriptions.push({ postIndex, description });
          console.log(`[AI Analysis - Stage 1] Post ${postIndex + 1}: "${description.substring(0, 80)}..."`);
        } else {
          console.warn(`[AI Analysis - Stage 1] Failed to describe image for post ${postIndex + 1}`);
          descriptions.push({ postIndex, description: '(image description unavailable)' });
        }
      } catch (error) {
        console.error(`[AI Analysis - Stage 1] Error describing image ${postIndex + 1}:`, error);
        descriptions.push({ postIndex, description: '(image description unavailable)' });
      }
    }

    console.log(`[AI Analysis - Stage 1] Completed: ${descriptions.length} descriptions generated`);
    return descriptions;
  }

  /**
   * STAGE 2: Use text model to categorize based on image descriptions + captions
   * @param {Array} posts - All posts
   * @param {Array} imageDescriptions - Descriptions from vision model
   * @param {string} endpoint - LM Studio endpoint
   * @returns {Promise<Object>} Categorization results
   */
  async function categorizeWithTextModel(posts, imageDescriptions, endpoint) {
    console.log(`[AI Analysis - Stage 2] Categorizing ${posts.length} posts based on descriptions + captions...`);

    // Build description map
    const descriptionMap = {};
    for (const { postIndex, description } of imageDescriptions) {
      descriptionMap[postIndex] = description;
    }

    // Build combined text for each post
    const postsText = posts.map((p, i) => {
      const caption = p.caption || '(no caption)';
      const imageDesc = descriptionMap[i] || '(no image)';
      return `${i + 1}. Caption: "${caption}"\n   Image: ${imageDesc}`;
    }).join('\n\n');

    const messages = [
      {
        role: 'system',
        content: 'You are an expert psychologist analyzing social media consumption patterns. Be precise and use the exact category names provided.\n\nIMPORTANT: Your entire response must be ONLY valid JSON. Do not include any explanatory text, descriptions, or commentary. Return ONLY the JSON object, nothing else.'
      },
      {
        role: 'user',
        content: `Analyze these ${posts.length} social media posts and categorize them based on both captions and image descriptions:

POSTS:
${postsText}

Provide a JSON response with:
1. For each post (by number), classify:
   - topic: Educational, Entertainment, Social, or Informative
   - emotion: Positive, Negative, Neutral, or Mixed

2. Overall time distribution (as percentages) across all topics and emotions, weighted by these dwell times:
${posts.map((p, i) => `Post ${i+1}: ${Math.round(p.dwellMs/1000)}s`).join(', ')}

RESPONSE FORMAT - Return ONLY this JSON structure with NO additional text:
{
  "posts": [{"topic": "Social", "emotion": "Positive"}, ...],
  "overall": {
    "topics": {"Educational": 0.15, "Social": 0.25, "Entertainment": 0.35, "Informative": 0.25},
    "emotions": {"Positive": 0.60, "Neutral": 0.30, ...}
  }
}

Do NOT add explanations. Return ONLY the JSON object.`
      }
    ];

    const apiUrl = endpoint.endsWith('/v1') ? endpoint : endpoint + '/v1';
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: messages,
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LM Studio API error (Stage 2): ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    const aiResult = extractJSON(content);

    if (!aiResult) {
      throw new Error('No valid JSON found in LM Studio Stage 2 response');
    }

    console.log('[AI Analysis - Stage 2] Categorization completed:', aiResult);
    return aiResult;
  }

  /**
   * AI-powered analysis using OpenAI direct API (requires paid key)
   * SINGLE-STAGE MULTIMODAL APPROACH for OpenAI models (GPT-4o, GPT-4o-mini):
   * - Analyzes both images and captions in one API call
   * - More efficient and accurate than two-stage for cloud models
   *
   * @param {Array} posts - Posts to analyze
   * @param {string} apiKey - OpenAI API key
   * @param {string} model - AI model to use (gpt-4o, gpt-4o-mini, etc.)
   */
  async function analyzeWithAI(posts, apiKey, model = 'gpt-4o-mini') {
    try {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('[AI Analysis] 🤖 Starting OpenAI Analysis');
      console.log('[AI Analysis] 🎯 Model:', model);

      // Prepare analysis data - limit posts based on whether we have images
      const hasAnyImages = posts.some(p => p.imageBase64);
      const MAX_POSTS = hasAnyImages ? 15 : 30; // Lower limit for multimodal to manage costs
      const topPosts = posts.slice(0, Math.min(posts.length, MAX_POSTS));

      console.log(`[AI Analysis] 📊 Analyzing ${topPosts.length} posts out of ${posts.length} total`);
      if (posts.length > MAX_POSTS) {
        console.log(`[AI Analysis] ⚠️  Capped at ${MAX_POSTS} posts for ${hasAnyImages ? 'multimodal' : 'text'} analysis`);
      }

      // Check if model supports vision (GPT-4o family)
      const supportsVision = model.includes('gpt-4o') || model.includes('gpt-4-turbo');
      const hasImages = supportsVision && topPosts.some(p => p.imageBase64);
      const imagesCount = hasImages ? topPosts.filter(p => p.imageBase64).length : 0;

      console.log('[AI Analysis] 🖼️  Images found:', imagesCount);
      console.log('[AI Analysis] 📝 Mode:', hasImages ? 'Single-Stage Multimodal (images + captions together)' : 'Text-only analysis');

      let messages;

      if (hasImages) {
        // SINGLE-STAGE MULTIMODAL: Send images + captions together
        const content = [
          {
            type: 'text',
            text: `Analyze these ${topPosts.length} Instagram posts and categorize them based on BOTH images AND captions:

Categorize each post:
- topic: Educational, Entertainment, Social, or Informative
- emotion: Positive, Negative, Neutral, or Mixed

Then provide overall time distribution (as percentages) weighted by these dwell times:
${topPosts.map((p, i) => `Post ${i+1}: ${Math.round(p.dwellMs/1000)}s`).join(', ')}

RESPONSE FORMAT - Return ONLY this JSON structure with NO additional text:
{
  "posts": [{"topic": "Social", "emotion": "Positive"}, ...],
  "overall": {
    "topics": {"Educational": 0.15, "Social": 0.25, "Entertainment": 0.35, "Informative": 0.25},
    "emotions": {"Positive": 0.60, "Neutral": 0.30, ...}
  }
}

Here are the posts:`
          }
        ];

        // Add each post with image + caption
        for (let i = 0; i < topPosts.length; i++) {
          const post = topPosts[i];
          content.push({
            type: 'text',
            text: `\n\nPost ${i+1}:`
          });

          // Add image if available
          if (post.imageBase64) {
            content.push({
              type: 'image_url',
              image_url: {
                url: post.imageBase64,
                detail: 'low' // Use low detail to reduce costs
              }
            });
          }

          // Add caption
          content.push({
            type: 'text',
            text: `Caption: "${post.caption || '(no caption)'}"`
          });
        }

        messages = [
          {
            role: 'system',
            content: 'You are an expert psychologist analyzing social media consumption patterns. Be precise and use the exact category names provided.\n\nIMPORTANT: Your entire response must be ONLY valid JSON. Do not include any explanatory text, descriptions, or commentary. Return ONLY the JSON object, nothing else.'
          },
          {
            role: 'user',
            content: content
          }
        ];

      } else {
        // Text-only analysis
        const captions = topPosts.map((p, i) => `${i+1}. "${p.caption}"`).join('\n');

        messages = [
          {
            role: 'system',
            content: 'You are an expert psychologist analyzing social media consumption patterns. Be precise and use the exact category names provided.\n\nIMPORTANT: Your entire response must be ONLY valid JSON. Do not include any explanatory text, descriptions, or commentary. Return ONLY the JSON object, nothing else.'
          },
          {
            role: 'user',
            content: `Analyze these ${topPosts.length} social media posts and categorize them:

POSTS:
${captions}

Provide a JSON response with:
1. For each post (by number), classify:
   - topic: Educational, Entertainment, Social, or Informative
   - emotion: Positive, Negative, Neutral, or Mixed

2. Overall time distribution (as percentages) across all topics and emotions, weighted by these dwell times:
${topPosts.map((p, i) => `Post ${i+1}: ${Math.round(p.dwellMs/1000)}s`).join(', ')}

RESPONSE FORMAT - Return ONLY this JSON structure with NO additional text:
{
  "posts": [{"topic": "Social", "emotion": "Positive"}, ...],
  "overall": {
    "topics": {"Educational": 0.15, "Social": 0.25, "Entertainment": 0.35, "Informative": 0.25},
    "emotions": {"Positive": 0.60, "Neutral": 0.30, ...}
  }
}`
          }
        ];
      }

      // Direct OpenAI API call
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.3,
          max_tokens: hasImages ? 3000 : 2000,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // Extract JSON from response
      const aiResult = extractJSON(content);

      if (!aiResult) {
        throw new Error('No valid JSON found in OpenAI response');
      }

      console.log('[AI Analysis] ✅ OpenAI response received and parsed successfully');
      console.log('[AI Analysis] 📈 Topics detected:', Object.keys(aiResult.overall.topics).filter(t => aiResult.overall.topics[t] > 0.05).join(', '));
      console.log('[AI Analysis] 😊 Emotions detected:', Object.keys(aiResult.overall.emotions).filter(e => aiResult.overall.emotions[e] > 0.05).join(', '));
      console.log('═══════════════════════════════════════════════════════════');

      // Convert to our format
      return {
        topics: aiResult.overall.topics,
        emotions: aiResult.overall.emotions,
        engagement: { Mindful: 0.5, Mindless: 0.3, Engaging: 0.2 },
        totalDwellMs: posts.reduce((sum, p) => sum + (p.dwellMs || 0), 0),
        postsAnalyzed: posts.length,
        analysisMethod: hasImages ? `openai-${model}-multimodal` : `openai-${model}-text`,
        perPostAnalysis: aiResult.posts || [],
        insights: generatePsychologicalInsights(
          aiResult.overall.topics,
          aiResult.overall.emotions,
          { Mindful: 0.5, Mindless: 0.3, Engaging: 0.2 },
          posts.reduce((sum, p) => sum + (p.dwellMs || 0), 0)
        )
      };

    } catch (error) {
      console.error('[AI Analysis] ❌ OpenAI API error, falling back to heuristics:', error);
      console.log('═══════════════════════════════════════════════════════════');
      return await analyzeWithHeuristics(posts);
    }
  }

  /**
   * Enhanced heuristic-based analysis
   * Uses NLP techniques and psychological patterns
   */
  async function analyzeWithHeuristics(posts) {
    const totalTime = posts.reduce((sum, p) => sum + (p.dwellMs || 0), 0);

    const topicScores = {};
    const emotionScores = {};
    const engagementScores = {};

    // Initialize scores
    Object.keys(CONTENT_DIMENSIONS.topics).forEach(t => topicScores[t] = 0);
    Object.keys(CONTENT_DIMENSIONS.emotions).forEach(e => emotionScores[e] = 0);
    Object.keys(CONTENT_DIMENSIONS.engagement).forEach(e => engagementScores[e] = 0);

    // Analyze each post
    for (const post of posts) {
      const caption = (post.caption || '').toLowerCase();
      const dwell = post.dwellMs || 0;
      const weight = totalTime > 0 ? dwell / totalTime : 0;

      // Topic classification with keyword patterns
      const topicMatch = classifyTopic(caption);
      if (topicMatch) {
        topicScores[topicMatch] += weight * dwell;
      }

      // Emotion detection
      const emotionMatch = detectEmotion(caption);
      if (emotionMatch) {
        emotionScores[emotionMatch] += weight * dwell;
      }

      // Engagement quality assessment
      const engagementMatch = assessEngagement(caption, dwell);
      if (engagementMatch) {
        engagementScores[engagementMatch] += weight * dwell;
      }
    }

    // Normalize and structure results
    return {
      topics: normalizeScores(topicScores),
      emotions: normalizeScores(emotionScores),
      engagement: normalizeScores(engagementScores),
      totalDwellMs: totalTime,
      postsAnalyzed: posts.length,
      analysisMethod: 'heuristic',
      perPostAnalysis: [], // Heuristics don't provide per-post data
      insights: generatePsychologicalInsights(topicScores, emotionScores, engagementScores, totalTime)
    };
  }

  /**
   * Classify content topic based on keywords and patterns
   */
  function classifyTopic(caption) {
    // Enhanced patterns with tournament names, sport emojis, and vs patterns
    const patterns = {
      "Social": /\b(sport|sports|football|soccer|basketball|tennis|game|match|player|team|score|goal|win|championship|league|athlete|fitness|training|workout|exercise|gym|run|running|cup|tournament|AFCON|FIFA|UEFA|NBA|NFL|MLB|NHL|olympics|premier league|champions league|world cup|super bowl|grand slam|vs\.?|versus|friend|family|love|together|relationship|community|connection|meet|gathering|celebration|wedding|birthday|health|wellness|yoga|meditation|wellbeing|mental health|self care|⚽|🏀|🏈|⛹️|🏆|🥇)\b/i,
      "Educational": /\b(learn|study|course|tutorial|how to|guide|education|knowledge|skill|teach|training|lesson|university|college|school)\b/i,
      "Entertainment": /\b(fun|funny|lol|haha|meme|comedy|joke|laugh|hilarious|entertainment|movie|film|series|show|watch|art|music|creative|paint|draw|design|photo|photography|artist|museum|culture|aesthetic|beauty|buy|shop|sale|discount|product|brand|store|purchase|deal|fashion|style|outfit|clothing|wear)\b/i,
      "Informative": /\b(news|breaking|update|report|announced|today|latest|current|politics|election|government|world|inspire|motivate|success|achieve|goal|dream|aspire|believe|overcome|transformation|hustle|grind|mindset)\b/i
    };

    // Check Social FIRST for highest priority (most specific patterns)

    // Pattern 1: "Team1 vs Team2" or "Country1 vs Country2"
    if (/\b\w+\s+(vs\.?|versus)\s+\w+/i.test(caption)) {
      return "Social";
    }

    // Pattern 2: Sport hashtags
    if (/#(AFCON|FIFA|UEFA|NBA|NFL|WorldCup|Olympics|ChampionsLeague|PremierLeague)/i.test(caption)) {
      return "Social";
    }

    // Pattern 3: Country flags with vs (🇲🇦 vs 🇳🇬)
    if (/[\u{1F1E6}-\u{1F1FF}].*\b(vs\.?|versus)\b.*[\u{1F1E6}-\u{1F1FF}]/iu.test(caption)) {
      return "Social";
    }

    // Check all patterns with keyword matching
    let bestMatch = null;
    let bestScore = 0;

    for (const [topic, pattern] of Object.entries(patterns)) {
      const matches = caption.match(pattern);
      if (matches && matches.length > bestScore) {
        bestScore = matches.length;
        bestMatch = topic;
      }
    }

    // Default to Entertainment if no clear match and caption exists
    return bestMatch || (caption.length > 10 ? "Entertainment" : "Social");
  }

  /**
   * Detect emotional tone
   */
  function detectEmotion(caption) {
    const positiveWords = /\b(love|happy|amazing|beautiful|great|wonderful|excellent|perfect|joy|celebrate|excited|awesome|fantastic)\b/i;
    const negativeWords = /\b(sad|angry|hate|terrible|awful|bad|worst|upset|frustrated|disappointing|crisis|tragedy)\b/i;
    const neutralWords = /\b(is|are|was|were|has|have|will|would|can|could|about|this|that)\b/i;

    const posCount = (caption.match(positiveWords) || []).length;
    const negCount = (caption.match(negativeWords) || []).length;

    if (posCount > negCount && posCount > 0) return "Positive";
    if (negCount > posCount && negCount > 0) return "Negative";
    if (posCount > 0 && negCount > 0) return "Mixed";
    return "Neutral";
  }

  /**
   * Assess engagement quality based on content and dwell time
   */
  function assessEngagement(caption, dwellMs) {
    // Mindful indicators
    const mindfulKeywords = /\b(learn|understand|reflect|think|consider|analyze|study|improve|develop)\b/i;
    const hasDepth = caption.length > 100;
    const hasQuestions = /\?/.test(caption);
    const longDwell = dwellMs > 15000; // > 15 seconds

    if ((mindfulKeywords.test(caption) || hasQuestions) && (hasDepth || longDwell)) {
      return "Mindful";
    }

    // Mindless indicators
    const shortDwell = dwellMs < 3000; // < 3 seconds
    const shortCaption = caption.length < 20;

    if (shortDwell && shortCaption) {
      return "Mindless";
    }

    return "Engaging";
  }

  /**
   * Normalize scores to time-based distribution
   */
  function normalizeScores(scores) {
    const total = Object.values(scores).reduce((sum, v) => sum + v, 0);
    if (total === 0) {
      // Return equal distribution if no data
      const keys = Object.keys(scores);
      const equalValue = 1 / keys.length;
      return Object.fromEntries(keys.map(k => [k, equalValue]));
    }

    const normalized = {};
    for (const [key, value] of Object.entries(scores)) {
      normalized[key] = value / total;
    }
    return normalized;
  }

  /**
   * Generate psychological insights based on analysis
   */
  function generatePsychologicalInsights(topics, emotions, engagement, totalTime) {
    const insights = [];
    const minutes = Math.round(totalTime / 60000);

    // Time-based insight
    if (totalTime > 3600000) { // > 1 hour
      insights.push({
        type: 'warning',
        title: 'Extended Session Detected',
        message: `You spent ${minutes} minutes on social media. Research shows sessions over 60 minutes can impact wellbeing.`,
        theory: 'Digital Wellbeing Research (Twenge et al., 2018)'
      });
    } else if (totalTime > 1800000) { // > 30 minutes
      insights.push({
        type: 'info',
        title: 'Moderate Session Length',
        message: `${minutes} minutes session. Consider taking a break to maintain mindful engagement.`,
        theory: 'Attention Restoration Theory'
      });
    }

    // Engagement quality insight
    const totalEngagement = Object.values(engagement).reduce((sum, v) => sum + v, 0);
    const mindfulRatio = engagement.Mindful / totalEngagement;
    const mindlessRatio = engagement.Mindless / totalEngagement;

    if (mindlessRatio > 0.5) {
      insights.push({
        type: 'suggestion',
        title: 'Passive Scrolling Detected',
        message: 'Over half your time was spent on quick, passive scrolling. Try engaging more intentionally with content.',
        theory: 'Self-Determination Theory - Autonomous vs. Controlled Motivation'
      });
    } else if (mindfulRatio > 0.4) {
      insights.push({
        type: 'positive',
        title: 'Mindful Engagement',
        message: 'Great job! You engaged thoughtfully with content. This supports well-being and learning.',
        theory: 'Flow Theory (Csikszentmihalyi, 1990)'
      });
    }

    // Emotional content insight
    const totalEmotions = Object.values(emotions).reduce((sum, v) => sum + v, 0);
    const negativeRatio = emotions.Negative / totalEmotions;

    if (negativeRatio > 0.4) {
      insights.push({
        type: 'warning',
        title: 'High Negative Content',
        message: 'You consumed significant negative content. This can affect mood and wellbeing.',
        theory: 'Emotional Contagion Theory & Affect Transfer'
      });
    }

    // Content diversity insight
    const topicValues = Object.values(topics);
    const maxTopic = Math.max(...topicValues);
    const diversity = topicValues.filter(v => v > 0.1).length;

    if (diversity <= 2) {
      insights.push({
        type: 'info',
        title: 'Limited Content Diversity',
        message: 'Your feed showed limited variety. Diverse content supports broader perspectives.',
        theory: 'Information Diet & Echo Chamber Effects'
      });
    }

    return insights;
  }

  /**
   * Create analysis prompt for AI service
   */
  function createAnalysisPrompt(posts) {
    const captionsSample = posts.slice(0, 20).map(p => p.caption).join('\n\n');

    return {
      system: `You are a psychologist analyzing social media content consumption.
      Categorize content using psychological frameworks:
      - Uses and Gratifications Theory for topics
      - Affective computing for emotions
      - Digital wellbeing research for engagement quality`,

      user: `Analyze these ${posts.length} social media posts and provide:
      1. Topic distribution across: ${Object.keys(CONTENT_DIMENSIONS.topics).join(', ')}
      2. Emotional tone across: ${Object.keys(CONTENT_DIMENSIONS.emotions).join(', ')}
      3. Engagement quality across: ${Object.keys(CONTENT_DIMENSIONS.engagement).join(', ')}
      4. Psychological insights and recommendations

      Sample captions:
      ${captionsSample}

      Return as JSON with percentages for each category.`
    };
  }

  /**
   * Create empty analysis structure
   */
  function createEmptyAnalysis() {
    return {
      topics: Object.fromEntries(Object.keys(CONTENT_DIMENSIONS.topics).map(k => [k, 0])),
      emotions: Object.fromEntries(Object.keys(CONTENT_DIMENSIONS.emotions).map(k => [k, 0])),
      engagement: Object.fromEntries(Object.keys(CONTENT_DIMENSIONS.engagement).map(k => [k, 0])),
      totalDwellMs: 0,
      postsAnalyzed: 0,
      analysisMethod: 'none',
      insights: []
    };
  }

  /**
   * Convert analysis to legacy format for backward compatibility
   */
  function toLegacyFormat(analysis) {
    const durationMs = analysis.totalDwellMs;

    // Map internal categories to the 4 main display categories
    const topics = {
      "Educational": (analysis.topics["Educational"] || 0),
      "Entertainment": (analysis.topics["Entertainment"] || 0) + (analysis.topics["Creative Arts"] || 0) + (analysis.topics["Shopping & Commerce"] || 0) * 0.7,
      "Social": (analysis.topics["Social"] || 0) + (analysis.topics["Health & Wellness"] || 0),
      "Informative": (analysis.topics["Informative"] || 0) + (analysis.topics["News & Current Events"] || 0) + (analysis.topics["Inspiration"] || 0) + (analysis.topics["Shopping & Commerce"] || 0) * 0.3
    };

    const emotions = {
      "Heavy": (analysis.emotions["Negative"] || 0) + (analysis.emotions["Mixed"] || 0) * 0.5,
      "Light": (analysis.emotions["Positive"] || 0),
      "Neutral": (analysis.emotions["Neutral"] || 0) + (analysis.emotions["Mixed"] || 0) * 0.5
    };

    // CRITICAL FIX: Normalize emotions to ensure they sum to 1.0
    // The AI sometimes omits categories with 0% values, causing percentages to not sum to 100%
    const topicsSum = Object.values(topics).reduce((sum, v) => sum + v, 0);
    const emotionsSum = Object.values(emotions).reduce((sum, v) => sum + v, 0);

    // Normalize topics if needed
    const normalizedTopics = {};
    if (topicsSum > 0) {
      for (const [k, v] of Object.entries(topics)) {
        normalizedTopics[k] = v / topicsSum;
      }
    } else {
      // Equal distribution if all 0
      for (const k of Object.keys(topics)) {
        normalizedTopics[k] = 0.25;
      }
    }

    // Normalize emotions if needed
    const normalizedEmotions = {};
    if (emotionsSum > 0) {
      for (const [k, v] of Object.entries(emotions)) {
        normalizedEmotions[k] = v / emotionsSum;
      }
    } else {
      // Equal distribution if all 0
      for (const k of Object.keys(emotions)) {
        normalizedEmotions[k] = 0.33;
      }
    }

    // Convert to milliseconds using normalized percentages
    const topicMs = {};
    const emotionMs = {};

    for (const [k, v] of Object.entries(normalizedTopics)) {
      topicMs[k] = Math.round(v * durationMs);
    }
    for (const [k, v] of Object.entries(normalizedEmotions)) {
      emotionMs[k] = Math.round(v * durationMs);
    }

    // Generate per-topic emotions (simplified) using normalized emotions
    const perTopicEmotions = {};
    for (const topic of Object.keys(topicMs)) {
      perTopicEmotions[topic] = {
        "Heavy": Math.round(topicMs[topic] * normalizedEmotions.Heavy),
        "Light": Math.round(topicMs[topic] * normalizedEmotions.Light),
        "Neutral": Math.round(topicMs[topic] * normalizedEmotions.Neutral)
      };
    }

    return { topicMs, emotionMs, perTopicEmotions };
  }

  // Public API
  return {
    analyzePostsBatch,
    toLegacyFormat,
    CONTENT_DIMENSIONS
  };
})();

// Export for use in service worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AI_ANALYSIS;
}
