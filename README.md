# MindfulFeed

A Chrome extension that promotes mindful social media usage by analyzing content and providing insights to help you maintain a healthier relationship with social platforms.

## Features

### AI-Powered Content Analysis
MindfulFeed uses advanced AI to categorize and analyze social media content, helping you understand what you're consuming and make more intentional choices about your digital diet.

### Gamification & Achievements
Track your progress with an achievement system that rewards mindful behavior and helps you build better social media habits.

### Goal Setting
Set research-backed goals to improve your digital wellbeing, from reducing daily time to increasing mindful engagement.

## Demo Screenshots

### 1. Analysis Mode Settings
![Analysis Mode Settings](demo/analysis-mode.png)

**What this shows:** The Analysis Mode configuration page where you can choose how the extension analyzes social media content.

**Available Options:**
- **Heuristic Analysis (Default)**: Fast, offline keyword matching. Free with ~75% accuracy - perfect for basic filtering without any setup.
- **LM Studio (Local AI) - Recommended**: Run powerful AI models directly on your computer. 100% FREE, private, and unlimited! Uses a two-stage analysis approach where a vision model describes images, then a text model categorizes content. No API keys, no internet required, excellent accuracy (~90-95%).
- **OpenAI Direct API**: Direct integration with OpenAI's GPT models. Requires a paid API key (~$0.01-0.03 per session) but offers the highest accuracy (~95%).

The bottom section provides a detailed setup guide for LM Studio, including download links and model recommendations (Qwen3-VL-4B for vision, Phi-3 Mini for text classification).

### 2. MindfulFeed Settings
![MindfulFeed Settings](demo/settings.png)

**What this shows:** The main settings page for configuring AI analysis and extension behavior.

**Key Features:**
- **OpenAI API Key Input**: Optional field to enable OpenAI-powered analysis for maximum accuracy
- **OpenAI Model Selection**: Choose between GPT-4o-mini (recommended - fast, multimodal, affordable) or GPT-3.5 (text-only)
- **Analysis Approach**: Explains how OpenAI uses single-stage multimodal analysis, analyzing images and captions together in one API call
- **Setup Instructions**: Step-by-step guide to get an API key from platform.openai.com
- **Privacy Notice**: Clear information about data being sent to OpenAI for analysis
- **Cost Information**: Transparent pricing (~$0.01-0.05 per session, minimum $5 credit requirement)
- **Test API Button**: Verify your API key is working before analyzing content

### 3. Achievements Page
![Achievements Page](demo/achievements.png)

**What this shows:** Your personal achievement tracking dashboard with gamification elements.

**Dashboard Elements:**
- **Level System**: Progress bar showing current level (Level 4 - Intentional) with 325 total points and 25/200 points to next level
- **Achievement Overview**: Quick stats showing 6 unlocked achievements, 7 locked, and 46% overall progress
- **Achievement Categories**: Filter by All, Unlocked, Locked, Awareness, Control, or Reflection
- **Achievement Cards**: Visual display of various achievements with:
  - **Badge Tiers**: GOLD, SILVER, BRONZE indicating difficulty/value
  - **Icons**: Each achievement has a unique emoji icon
  - **Descriptions**: Clear explanation of what to accomplish
  - **Point Values**: Shows how many points each achievement awards
  - **Unlock Dates**: When you earned each achievement

**Sample Achievements Shown:**
- **Mindful Master** (GOLD): Complete 10 highly mindful sessions (80%+ engagement) - 100 points
- **Time Saver** (SILVER): Reduce average daily time by 30% - 75 points
- **Reflective Thinker** (SILVER): Complete 20 post-session reflections - 60 points
- **Week of Awareness** (SILVER): Track usage for 7 consecutive days - 50 points
- **Getting Started** (BRONZE): Complete 10 tracked sessions - 30 points
- **First Step** (BRONZE): Complete your first tracked session - 10 points

### 4. Stats Dashboard
![Stats Dashboard](demo/stats.png)

**What this shows:** Comprehensive personal statistics and progress tracking.

**Stat Panels:**
- **User Profile**: Name (Chakir), current level (Level 4 - Intentional), total points (325), and progress bar to next level
- **Day Streak**: Current consecutive days of usage (0 shown - streak broken)
- **Sessions Tracked**: Total number of sessions monitored (67)
- **Mindful Sessions**: Count of highly engaged sessions (13)
- **Reflections**: Number of post-session reflections completed (62)

**Achievements Section**:
Displays all achievements with filters (All, Unlocked, Locked) showing:
- Recently unlocked achievements like "Mindful Master", "Month of Mindfulness", "Goal Achiever"
- Achievements with checkmarks indicating completion
- Point values and tier badges (GOLD, SILVER)
- Unlock dates for tracking progress over time

### 5. Goals Page
![Goals Page](demo/goals.png)

**What this shows:** Goal setting interface with research-backed templates for improving digital wellbeing.

**Page Sections:**
- **Your Active Goals**: Currently empty, encouraging users to "Start by adding a goal below!"
- **Goal Templates**: Pre-configured goals based on behavioral research:
  - **Reduce Daily Time** (Timer icon): Set a daily time limit for social media - Based on: Implementation intentions
  - **Fewer Sessions Per Day** (Infinity icon): Reduce how often you check social media - Based on: Habit modification
  - **More Mindful Sessions** (Meditation icon): Increase the quality of your engagement - Based on: Value-based goals
  - **More Positive Content** (Sparkle icon): Increase exposure to uplifting content

Each template includes:
- Clear description of the goal
- Research-based approach it uses
- Blue "+ Add Goal" button for quick activation

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the MindfulFeed directory
5. The extension icon will appear in your Chrome toolbar

## Getting Started

1. Click the extension icon to open the popup
2. Navigate to Settings to configure your preferred analysis mode
3. Choose between Heuristic (free, basic), LM Studio (free, private, powerful), or OpenAI API (paid, most accurate)
4. Visit your favorite social media site and start browsing
5. Check your Stats and Achievements to track your mindful usage progress
6. Set Goals to work toward specific digital wellbeing improvements

## Privacy

- **Heuristic Mode**: All processing happens locally in your browser. No data is ever sent anywhere.
- **LM Studio Mode**: All AI processing happens on your computer. No data leaves your machine.
- **OpenAI API Mode**: Post content (text and images) is sent to OpenAI for analysis. See [OpenAI's privacy policy](https://openai.com/privacy) for details.

## License

See [LICENSE](LICENSE) file for details.
