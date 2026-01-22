// AI-powered content analysis for MindfulFeed
// Multimodal analysis: text captions + image URLs
// Psychological theory-grounded categorization

const AI_ANALYSIS = (() => {
  // Psychological theory-based categories
  const CONTENT_DIMENSIONS = {
    topics: {
      // Based on uses and gratifications theory
      "Education": "Educational, learning, informative content",
      "Entertainment": "Fun, humorous, entertaining content",
      "Social Connection": "Friends, family, relationships, community",
      "News & Current Events": "News, politics, current affairs",
      "Inspiration": "Motivational, aspirational, success stories",
      "Shopping & Commerce": "Products, shopping, commercial content",
      "Health & Wellness": "Fitness, mental health, self-care",
      "Creative Arts": "Art, music, creativity, cultural content",
      "Sport": "Sports, athletic activities, games, competitions"
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
   * Note: Images are converted to base64 by the content script (foreground.js)
   * and passed in via post.imageBase64 field
   * @param {Array} posts - Posts to analyze
   * @param {string} endpoint - LM Studio API endpoint (e.g., http://localhost:1234/v1)
   */
  async function analyzeWithLocal(posts, endpoint) {
    try {
      console.log('[AI Analysis] Using LM Studio local AI at:', endpoint);

      // Prepare analysis data - analyze ALL posts seen in session
      // Lower cap for vision models to prevent VRAM exhaustion
      const hasAnyImages = posts.some(p => p.imageBase64);
      const MAX_POSTS = hasAnyImages ? 10 : 50; // 10 for vision (VRAM limit), 50 for text-only
      const topPosts = posts.slice(0, Math.min(posts.length, MAX_POSTS));

      console.log(`[AI Analysis] Analyzing ${topPosts.length} posts out of ${posts.length} total posts seen`);
      if (posts.length > MAX_POSTS) {
        console.log(`[AI Analysis] Note: Capped at ${MAX_POSTS} posts to prevent ${hasAnyImages ? 'VRAM exhaustion' : 'API limits'}. Analyzing the first ${MAX_POSTS} posts.`);
      }

      // Check if we have images (vision model support)
      const hasImages = topPosts.some(p => p.imageBase64);
      console.log('[AI Analysis] Vision model mode:', hasImages ? 'YES - analyzing images!' : 'NO - text only');

      // Build messages with multimodal content if images are available
      const messages = [];

      // System message
      messages.push({
        role: 'system',
        content: 'You are an expert psychologist analyzing social media consumption patterns. Be precise and use the exact category names provided.\n\nIMPORTANT: Your entire response must be ONLY valid JSON. Do not include any explanatory text, descriptions, or commentary. Return ONLY the JSON object, nothing else.'
      });

      // User message with multimodal content (images + text)
      if (hasImages) {
        // Vision model: send images along with captions
        const content = [
          {
            type: 'text',
            text: `Analyze these ${topPosts.length} Instagram posts and categorize them based on BOTH the images AND captions:

Categorize each post:
- topic: Education, Entertainment, Social Connection, News & Current Events, Inspiration, Shopping & Commerce, Health & Wellness, Creative Arts, or Sport
- emotion: Positive, Negative, Neutral, or Mixed

Then provide overall time distribution (as percentages) weighted by these dwell times:
${topPosts.map((p, i) => `Post ${i+1}: ${Math.round(p.dwellMs/1000)}s`).join(', ')}

RESPONSE FORMAT - Return ONLY this JSON structure with NO additional text:
{
  "posts": [{"topic": "Sport", "emotion": "Positive"}, ...],
  "overall": {
    "topics": {"Education": 0.15, "Sport": 0.25, ...},
    "emotions": {"Positive": 0.60, "Neutral": 0.30, ...}
  }
}

Do NOT describe the images. Do NOT add explanations. Return ONLY the JSON.

Here are the posts:`
          }
        ];

        // Add each post with image + caption
        // Images are already converted to base64 by the content script
        const postsWithImages = topPosts.filter(p => p.imageBase64);
        const postsWithoutImages = topPosts.filter(p => !p.imageBase64);

        console.log(`[AI Analysis] Posts with base64 images: ${postsWithImages.length}/${topPosts.length}`);
        console.log(`[AI Analysis] Posts without images: ${postsWithoutImages.length}`);

        // Build content with base64 images
        for (let i = 0; i < topPosts.length; i++) {
          const post = topPosts[i];
          content.push({
            type: 'text',
            text: `\n\nPost ${i+1}:`
          });

          // Add image if available (already base64 from content script)
          if (post.imageBase64) {
            content.push({
              type: 'image_url',
              image_url: {
                url: post.imageBase64  // Base64 data URI (data:image/jpeg;base64,...)
              }
            });
          } else if (post.imageUrl) {
            // Image was present but not converted (might have scrolled away)
            content.push({
              type: 'text',
              text: `(Image present but not captured - may have scrolled away)`
            });
          }

          // Add caption
          content.push({
            type: 'text',
            text: `Caption: "${post.caption || '(no caption)'}"`
          });
        }

        messages.push({
          role: 'user',
          content: content
        });

      } else {
        // Text-only model: just send captions
        const captions = topPosts.map((p, i) => `${i+1}. "${p.caption}"`).join('\n');

        messages.push({
          role: 'user',
          content: `Analyze these ${topPosts.length} social media posts and categorize them:

POSTS:
${captions}

Provide a JSON response with:
1. For each post (by number), classify:
   - topic: Education, Entertainment, Social Connection, News & Current Events, Inspiration, Shopping & Commerce, Health & Wellness, Creative Arts, or Sport
   - emotion: Positive, Negative, Neutral, or Mixed

2. Overall time distribution (as percentages) across all topics and emotions, weighted by these dwell times:
${topPosts.map((p, i) => `Post ${i+1}: ${Math.round(p.dwellMs/1000)}s`).join(', ')}

RESPONSE FORMAT - Return ONLY this JSON structure with NO additional text:
{
  "posts": [{"topic": "Sport", "emotion": "Positive"}, ...],
  "overall": {
    "topics": {"Education": 0.15, "Sport": 0.25, ...},
    "emotions": {"Positive": 0.60, "Neutral": 0.30, ...}
  }
}

Do NOT add explanations. Return ONLY the JSON object.`
        });
      }

      // Call local LM Studio server (OpenAI-compatible API)
      const apiUrl = endpoint.endsWith('/v1') ? endpoint : endpoint + '/v1';
      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // No Authorization header needed for local server
        },
        body: JSON.stringify({
          messages: messages,
          temperature: 0.3,
          max_tokens: hasImages ? 3000 : 2000 // More tokens for vision model responses
          // Note: LM Studio doesn't support response_format, relying on prompt instructions for JSON
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LM Studio API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // Extract JSON from response (handles models that return text + JSON)
      const aiResult = extractJSON(content);

      if (!aiResult) {
        throw new Error('No valid JSON found in LM Studio response');
      }

      console.log('[AI Analysis] LM Studio response received:', aiResult);

      // Convert to our format
      return {
        topics: aiResult.overall.topics,
        emotions: aiResult.overall.emotions,
        engagement: { Mindful: 0.5, Mindless: 0.3, Engaging: 0.2 }, // Simplified for now
        totalDwellMs: posts.reduce((sum, p) => sum + (p.dwellMs || 0), 0),
        postsAnalyzed: posts.length,
        analysisMethod: hasImages ? 'local-lmstudio-vision' : 'local-lmstudio',
        perPostAnalysis: aiResult.posts || [], // Store per-post AI categorization!
        insights: generatePsychologicalInsights(
          aiResult.overall.topics,
          aiResult.overall.emotions,
          { Mindful: 0.5, Mindless: 0.3, Engaging: 0.2 },
          posts.reduce((sum, p) => sum + (p.dwellMs || 0), 0)
        )
      };

    } catch (error) {
      console.error('[AI Analysis] LM Studio error, falling back to heuristics:', error);
      return await analyzeWithHeuristics(posts);
    }
  }

  /**
   * AI-powered analysis using OpenAI direct API (requires paid key)
   * @param {Array} posts - Posts to analyze
   * @param {string} apiKey - OpenAI API key
   * @param {string} model - AI model to use
   */
  async function analyzeWithAI(posts, apiKey, model = 'gpt-4-turbo-preview') {
    try {
      console.log('[AI Analysis] Using OpenAI direct API with model:', model);

      // Prepare analysis data
      const topPosts = posts.slice(0, 20); // Analyze top 20 posts
      const captions = topPosts.map((p, i) => `${i+1}. "${p.caption}"`).join('\n');

      const prompt = `Analyze these ${topPosts.length} social media posts and categorize them:

POSTS:
${captions}

Provide a JSON response with:
1. For each post (by number), classify:
   - topic: Education, Entertainment, Social Connection, News & Current Events, Inspiration, Shopping & Commerce, Health & Wellness, Creative Arts, or Sport
   - emotion: Positive, Negative, Neutral, or Mixed

2. Overall time distribution (as percentages) across all topics and emotions, weighted by these dwell times:
${topPosts.map((p, i) => `Post ${i+1}: ${Math.round(p.dwellMs/1000)}s`).join(', ')}

Format:
{
  "posts": [{"topic": "Sport", "emotion": "Positive"}, ...],
  "overall": {
    "topics": {"Education": 0.15, "Sport": 0.25, ...},
    "emotions": {"Positive": 0.60, "Neutral": 0.30, ...}
  }
}`;

      const messages = [
        {
          role: 'system',
          content: 'You are an expert psychologist analyzing social media consumption patterns. Be precise and use the exact category names provided.\n\nIMPORTANT: Your entire response must be ONLY valid JSON. Do not include any explanatory text, descriptions, or commentary. Return ONLY the JSON object, nothing else.'
        },
        {
          role: 'user',
          content: prompt
        }
      ];

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
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // Extract JSON from response (OpenAI usually returns clean JSON, but just in case)
      const aiResult = extractJSON(content);

      if (!aiResult) {
        throw new Error('No valid JSON found in OpenAI response');
      }

      console.log('[AI Analysis] OpenAI response received:', aiResult);

      // Convert to our format
      return {
        topics: aiResult.overall.topics,
        emotions: aiResult.overall.emotions,
        engagement: { Mindful: 0.5, Mindless: 0.3, Engaging: 0.2 }, // Simplified for now
        totalDwellMs: posts.reduce((sum, p) => sum + (p.dwellMs || 0), 0),
        postsAnalyzed: posts.length,
        analysisMethod: `openai-${model}`,
        perPostAnalysis: aiResult.posts || [], // Store per-post AI categorization!
        insights: generatePsychologicalInsights(
          aiResult.overall.topics,
          aiResult.overall.emotions,
          { Mindful: 0.5, Mindless: 0.3, Engaging: 0.2 },
          posts.reduce((sum, p) => sum + (p.dwellMs || 0), 0)
        )
      };

    } catch (error) {
      console.error('[AI Analysis] OpenAI API error, falling back to heuristics:', error);
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
      "Sport": /\b(sport|sports|football|soccer|basketball|tennis|game|match|player|team|score|goal|win|championship|league|athlete|fitness|training|workout|exercise|gym|run|running|cup|tournament|AFCON|FIFA|UEFA|NBA|NFL|MLB|NHL|olympics|premier league|champions league|world cup|super bowl|grand slam|vs\.?|versus|⚽|🏀|🏈|⛹️|🏆|🥇)\b/i,
      "Education": /\b(learn|study|course|tutorial|how to|guide|education|knowledge|skill|teach|training|lesson|university|college|school)\b/i,
      "Entertainment": /\b(fun|funny|lol|haha|meme|comedy|joke|laugh|hilarious|entertainment|movie|film|series|show|watch)\b/i,
      "Social Connection": /\b(friend|family|love|together|relationship|community|connection|meet|gathering|celebration|wedding|birthday)\b/i,
      "News & Current Events": /\b(news|breaking|update|report|announced|today|latest|current|politics|election|government|world)\b/i,
      "Inspiration": /\b(inspire|motivate|success|achieve|goal|dream|aspire|believe|overcome|transformation|hustle|grind|mindset)\b/i,
      "Shopping & Commerce": /\b(buy|shop|sale|discount|product|brand|store|purchase|deal|fashion|style|outfit|clothing|wear)\b/i,
      "Health & Wellness": /\b(health|fitness|workout|yoga|meditation|wellbeing|mental health|self care|nutrition|exercise|gym|training|diet|wellness)\b/i,
      "Creative Arts": /\b(art|music|creative|paint|draw|design|photo|photography|artist|museum|culture|aesthetic|beauty)\b/i
    };

    // Check Sport FIRST for highest priority (most specific patterns)

    // Pattern 1: "Team1 vs Team2" or "Country1 vs Country2"
    if (/\b\w+\s+(vs\.?|versus)\s+\w+/i.test(caption)) {
      return "Sport";
    }

    // Pattern 2: Sport hashtags
    if (/#(AFCON|FIFA|UEFA|NBA|NFL|WorldCup|Olympics|ChampionsLeague|PremierLeague)/i.test(caption)) {
      return "Sport";
    }

    // Pattern 3: Country flags with vs (🇲🇦 vs 🇳🇬)
    if (/[\u{1F1E6}-\u{1F1FF}].*\b(vs\.?|versus)\b.*[\u{1F1E6}-\u{1F1FF}]/iu.test(caption)) {
      return "Sport";
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
    return bestMatch || (caption.length > 10 ? "Entertainment" : "Social Connection");
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

    // Map new 9 categories to old 4 categories for dashboard compatibility
    const topics = {
      "Education": (analysis.topics["Education"] || 0),
      "Fun": (analysis.topics["Entertainment"] || 0) + (analysis.topics["Creative Arts"] || 0) + (analysis.topics["Social Connection"] || 0) * 0.5,
      "Sport": (analysis.topics["Sport"] || 0) + (analysis.topics["Health & Wellness"] || 0) * 0.5,
      "News": (analysis.topics["News & Current Events"] || 0) + (analysis.topics["Inspiration"] || 0) + (analysis.topics["Shopping & Commerce"] || 0) * 0.3
    };

    const emotions = {
      "Heavy": (analysis.emotions["Negative"] || 0) + (analysis.emotions["Mixed"] || 0) * 0.5,
      "Light": (analysis.emotions["Positive"] || 0),
      "Neutral": (analysis.emotions["Neutral"] || 0) + (analysis.emotions["Mixed"] || 0) * 0.5
    };

    // Convert to milliseconds
    const topicMs = {};
    const emotionMs = {};

    for (const [k, v] of Object.entries(topics)) {
      topicMs[k] = Math.round(v * durationMs);
    }
    for (const [k, v] of Object.entries(emotions)) {
      emotionMs[k] = Math.round(v * durationMs);
    }

    // Generate per-topic emotions (simplified)
    const perTopicEmotions = {};
    for (const topic of Object.keys(topicMs)) {
      perTopicEmotions[topic] = {
        "Heavy": Math.round(topicMs[topic] * emotions.Heavy),
        "Light": Math.round(topicMs[topic] * emotions.Light),
        "Neutral": Math.round(topicMs[topic] * emotions.Neutral)
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
