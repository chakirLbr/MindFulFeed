# CLAUDE.md - MindfulFeed Extension

## Project Overview

**MindfulFeed** is a Chrome Manifest V3 browser extension focused on AI-Powered Digital Wellbeing. It tracks user behavior on social media platforms, measuring content consumption patterns, engagement quality, and provides AI-powered analytics with psychological insights, gamification, and reflective practice tools.

- **Version**: 1.0.0
- **License**: MIT
- **Platform**: Chrome/Chromium browsers (Manifest V3)
- **Supported Platforms**:
  - Instagram (https://www.instagram.com/*)
  - YouTube (https://www.youtube.com/*)

## Architecture

### Extension Type
This is a **Manifest V3 browser extension** with the following components:
- **Service Worker** (background script) - persistent state management, AI analysis orchestration
- **Content Scripts** (foreground) - Instagram & YouTube DOM tracking
- **Popup UI** - main control interface (Start/Stop)
- **Reflection Page** - post-session feedback and insights
- **Summary Dashboard** - comprehensive analytics visualization
- **Leaderboard** - gamification and community features (planned)
- **Settings Page** - configuration interface

### Key Technologies
- Pure JavaScript (ES6+) - no build tools, no frameworks
- Chrome Extension APIs (Manifest V3)
- IntersectionObserver API - for viewport tracking
- MutationObserver API - for DOM changes and SPA navigation
- Chrome Storage API - for data persistence (100% local)
- SVG - for custom visualizations (donuts, gauges, charts)
- **AI Analysis Engine** - NLP-based content categorization with multimodal support
- **Psychological Theory Framework** - Self-Determination Theory, Digital Wellbeing Research

## File Structure

```
/
├── manifest.json              # Extension manifest (MV3) - v1.0.0
├── service-worker.js          # Background script (main orchestration)
├── service-worker-utils.js    # Background utilities (minimal)
├── ai-analysis.js             # AI content analysis engine
├── gamification.js            # Achievements & leaderboard system
├── reflection-system.js       # Reflection prompts & feedback
├── foreground.js              # Content script for Instagram
├── foreground-youtube.js      # Content script for YouTube
├── popup/
│   ├── popup.html            # Main popup UI (Start/Stop)
│   ├── popup.js              # Popup logic
│   ├── popup.css             # Popup styles
│   ├── summary.html          # Analytics dashboard
│   ├── summary.js            # Dashboard logic
│   ├── summary.css           # Dashboard styles
│   ├── reflection.html       # Post-session reflection
│   ├── reflection.js         # Reflection logic
│   └── reflection.css        # Reflection styles
├── settings/
│   ├── settings.html         # Settings page
│   └── settings.css          # Settings styles
├── logo/
│   ├── logo-16.png
│   ├── logo-48.png
│   ├── logo-128.png
│   ├── logo-main.png
│   └── logo.svg
├── README.md                  # User-facing documentation
├── LICENSE                    # MIT License
└── CLAUDE.md                 # This file (AI development docs)
```

## Core Components

### 1. manifest.json
Defines extension configuration:
- **Permissions**: `storage`, `tabs`, `scripting`
- **Host Permissions**: Instagram only (`https://www.instagram.com/*`)
- **Content Scripts**: Automatically injected on Instagram
- **Service Worker**: Background persistence
- **Popup**: Browser action UI
- **Options**: Settings page

### 2. service-worker.js (Background Script)
**Location**: `/service-worker.js` (330 lines)

**Responsibilities**:
- Session state management (start/stop tracking)
- Timer logic (elapsed time calculation)
- Data persistence via Chrome Storage API
- Daily analytics aggregation
- Message handling between components
- Demo analytics generation (topics & emotions)

**Key Functions**:
- `start()` - Begins tracking session, signals content script
- `stop()` - Ends session, aggregates data, stores analytics
- `getState()` / `setState()` - Timer state persistence
- `getDaily()` / `setDaily()` - Daily statistics persistence
- `generateSessionBreakdown()` - Creates topic/emotion breakdown (deterministic demo)
- `signalContent()` - Sends messages to content script

**Storage Keys**:
- `mf_timer_state` - Current tracking state
- `mf_daily_stats` - Aggregated daily data
- `mf_last_session` - Most recent session analytics
- `mf_raw_session` - Live dwell/caption data from content script
- `mf_session_meta` - Session metadata (sessionId, tabId, etc.)

**Message Types Handled**:
- `GET_STATE` - Returns current state
- `START` - Starts tracking
- `STOP` - Stops tracking
- `RESET` - Resets timer
- `MFF_RAW_UPDATE` - Receives tracking updates from content script
- `GET_DASHBOARD` - Returns all dashboard data

### 3. foreground.js (Content Script)
**Location**: `/foreground.js` (265 lines)

**Responsibilities**:
- Tracks Instagram feed posts visibility
- Measures dwell time (time spent viewing each post)
- Extracts post captions and URLs
- Sends periodic updates to service worker
- Handles infinite scroll (new posts detection)

**Key Features**:
- **IntersectionObserver**: Tracks post visibility ratios
- **MutationObserver**: Detects new posts in infinite feed
- **Dwell Time Tracking**: Records time when post is ≥60% visible
- **Active Post Detection**: Identifies most visible post (≥15% threshold)
- **Caption Extraction**: Resilient heuristic for Instagram's dynamic DOM

**Configuration Constants**:
```javascript
VISIBILITY_THRESHOLD = 0.6    // 60% visible = counting dwell time
ACTIVE_MIN_RATIO = 0.15       // 15% visible = candidate for "active"
TICK_MS = 250                 // Internal timing tick (250ms)
PUSH_MS = 2000                // Update frequency to background (2s)
```

**Key Functions**:
- `startTracking()` - Initializes observers and timers
- `stopTracking()` - Finalizes data and sends last update
- `ensurePost()` - Extracts and caches post metadata
- `extractCaption()` - Resilient caption extraction
- `tick()` - Updates dwell time accumulators
- `pushUpdate()` - Sends snapshot to service worker

**Message Types Handled**:
- `MFF_CONTROL` with action `START` - Begin tracking
- `MFF_CONTROL` with action `STOP` - End tracking

### 4. popup/ (User Interface)

#### popup.html & popup.js
**Main Extension Popup** (accessed via toolbar icon)

**Features**:
- Start/Stop button with play/pause icon toggle
- Live timer display (HH:MM:SS format)
- Status indicator ("Tracking your feed..." / "Stopped")
- Analytics button (opens summary dashboard)
- Close button

**UI Updates**: 500ms refresh interval when tracking

#### summary.html & summary.js
**Analytics Dashboard** (opens in new tab)

**Visualizations**:
1. **Topic Donut Chart**: Shows time distribution across categories
   - Education, Fun, Sport, News
   - Custom CSS variable colors
   - SVG-based rendering

2. **Emotion Analysis**: Mini ring charts for each emotion
   - Heavy, Light, Neutral
   - Percentage and time display

3. **Statistics Chart**: Historical bar charts
   - Switchable periods: Day / Week / Month
   - Stacked bars by topic
   - Date labels

4. **Per-Topic Gauges**: Semicircle emotion breakdown per topic
   - 180° arc representation
   - Three emotion segments

5. **Debug Section**: Raw session data dump (temporary, for development)

**Data Flow**: Fetches via `GET_DASHBOARD` message

### 5. settings/ (Configuration)
**Currently minimal** - placeholder for future settings
- `settings.html` - basic page structure
- `settings.css` - minimal styling

## Data Flow

### Tracking Session Flow
```
User clicks Start in popup
  ↓
popup.js sends "START" message
  ↓
service-worker.js:
  - Creates session ID
  - Stores session metadata
  - Updates state to isTracking=true
  - Sends "MFF_CONTROL START" to content script
  ↓
foreground.js (Instagram tab):
  - Initializes IntersectionObserver
  - Initializes MutationObserver
  - Starts tick timer (250ms)
  - Starts push timer (2s)
  - Begins tracking visible posts
  ↓
[User scrolls Instagram feed]
  ↓
foreground.js continuously:
  - Detects new posts (MutationObserver)
  - Tracks visibility ratios (IntersectionObserver)
  - Accumulates dwell time (tick timer)
  - Sends updates to service worker (push timer)
  ↓
service-worker.js:
  - Receives "MFF_RAW_UPDATE" messages
  - Stores latest snapshot in mf_raw_session
  ↓
User clicks Stop in popup
  ↓
popup.js sends "STOP" message
  ↓
service-worker.js:
  - Sends "MFF_CONTROL STOP" to content script
  - Waits 500ms for final snapshot
  - Calculates session duration
  - Generates topic/emotion breakdown
  - Aggregates into daily stats
  - Stores in mf_last_session
  - Clears raw session data
  ↓
User opens Analytics
  ↓
summary.js:
  - Fetches dashboard data
  - Renders all visualizations
  - Shows session statistics
```

## Development Guidelines

### Extension Development Best Practices

1. **No Build Tools Required**
   - All code is vanilla JavaScript
   - No transpilation, bundling, or compilation
   - Direct file editing and reload

2. **Testing Workflow**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project root directory
   - Click refresh icon after changes

3. **Debugging**
   - **Service Worker**: Inspect via Extensions page
   - **Content Script**: Inspect Instagram tab console
   - **Popup**: Right-click popup → Inspect
   - **Summary**: Open DevTools in dashboard tab

4. **Manifest V3 Requirements**
   - Use service workers (not background pages)
   - No inline scripts in HTML
   - `executeScript` API for dynamic injection
   - Chrome Storage API (not localStorage)

### Code Conventions

1. **Naming**
   - camelCase for variables and functions
   - UPPER_SNAKE_CASE for constants
   - Descriptive names (e.g., `computeElapsed`, not `calc`)

2. **Message Protocol**
   - All messages have `type` field
   - Responses have `ok` boolean and optional `error`
   - Custom prefixes: `MFF_` for MindfulFeed internal messages

3. **Async Patterns**
   - Promise-wrapped Chrome APIs
   - `async/await` in modern code
   - Callbacks for message passing (required by Chrome API)

4. **Error Handling**
   - Check `chrome.runtime.lastError` in callbacks
   - Try-catch blocks in async functions
   - Graceful degradation (no crashes)
   - Safe send helpers (`safeSend` in foreground.js)

5. **DOM Resilience**
   - Instagram DOM changes frequently
   - Use flexible selectors (not brittle specificity)
   - Extract data with multiple fallbacks
   - Filter common UI labels from captions

6. **Performance**
   - Limit data payload sizes (top 40 posts only)
   - Throttled updates (2s interval)
   - WeakSet for observer tracking (memory efficient)
   - Efficient tick timing (250ms)

### Chrome Storage Schema

**Storage Type**: `chrome.storage.local` (unlimited with permission)

**Data Structure**:
```javascript
// mf_timer_state
{
  isTracking: boolean,
  startedAt: number,     // epoch ms
  elapsedMs: number      // accumulated when stopped
}

// mf_daily_stats
{
  "YYYY-MM-DD": {
    totalMs: number,
    topics: { Education: number, Fun: number, Sport: number, News: number },
    emotions: { Heavy: number, Light: number, Neutral: number },
    perTopicEmotions: {
      Education: { Heavy: number, Light: number, Neutral: number },
      Fun: { ... },
      Sport: { ... },
      News: { ... }
    }
  },
  // ... more dates
}

// mf_last_session
{
  endedAt: number,
  durationMs: number,
  topics: { ... },
  emotions: { ... },
  perTopicEmotions: { ... },
  raw: { /* snapshot from content script */ }
}

// mf_raw_session (live during tracking)
{
  sessionId: string,
  startedAt: number,
  pageUrl: string,
  activeKey: string,
  finalize: boolean,
  posts: [
    {
      key: string,
      href: string,
      caption: string,
      firstSeenAt: number,
      dwellMs: number
    },
    // ... more posts
  ]
}

// mf_session_meta
{
  sessionId: string,
  tabId: number,
  acceptFinalizeUntil: number  // epoch ms, grace period for final update
}
```

## Common Development Tasks

### Adding New Analytics

1. **Extend Breakdown Generation** (service-worker.js:171)
   - Modify `generateSessionBreakdown()` function
   - Add new metrics calculation
   - Update storage schema if needed

2. **Update UI** (popup/summary.js)
   - Add new visualization functions
   - Update `loadDashboard()` to render new data
   - Add CSS styling if needed

3. **Update Content Tracking** (foreground.js)
   - Modify `extractCaption()` or add new extractors
   - Update `pushUpdate()` payload
   - Ensure backward compatibility

### Modifying Topics or Emotions

**Current Categories** (hardcoded):
- Topics: Education, Fun, Sport, News
- Emotions: Heavy, Light, Neutral

**To Change**:
1. Update constants in `summary.js`:
   ```javascript
   const TOPICS = [...]
   const EMOTIONS = [...]
   ```

2. Update breakdown logic in `service-worker.js`:
   ```javascript
   function generateSessionBreakdown() {
     const topics = ["Education", "Fun", "Sport", "News"];
     const emotions = ["Heavy", "Light", "Neutral"];
     // ...
   }
   ```

3. Update default structures throughout codebase

4. Update CSS color variables in `summary.css`:
   ```css
   --c-edu: /* color */
   --c-fun: /* color */
   --e-heavy: /* color */
   ```

### Adding Permissions

1. Edit `manifest.json`:
   ```json
   "permissions": ["storage", "tabs", "scripting", "newPermission"]
   ```

2. If host permissions:
   ```json
   "host_permissions": [
     "https://www.instagram.com/*",
     "https://newsite.com/*"
   ]
   ```

3. Reload extension (Chrome will prompt for new permissions)

### Extending to Other Social Media

1. **Add content script** in `manifest.json`:
   ```json
   "content_scripts": [
     {
       "js": ["foreground.js"],
       "matches": ["https://www.instagram.com/*"]
     },
     {
       "js": ["foreground-facebook.js"],
       "matches": ["https://www.facebook.com/*"]
     }
   ]
   ```

2. **Create platform-specific script**:
   - Copy `foreground.js` as template
   - Adjust selectors for new platform
   - Update post detection logic
   - Keep message protocol consistent

3. **Update service worker**:
   - Handle multiple platforms in session data
   - Add platform field to posts
   - Update analytics calculations

## Important Notes for AI Assistants

### When Making Changes

1. **Read Before Modifying**
   - Always read the full file before suggesting changes
   - Understand the message flow between components
   - Check storage schema compatibility

2. **Test Instagram Selectors Carefully**
   - Instagram's DOM changes frequently
   - Selectors in `foreground.js` may need updates
   - Test with multiple post types (photos, videos, reels)

3. **Preserve Async Patterns**
   - Chrome API callbacks are required (not just async/await)
   - Always include `return true` in message listeners for async responses
   - Check `chrome.runtime.lastError` in callbacks

4. **Maintain Data Compatibility**
   - Don't break existing storage schemas without migration
   - Preserve backward compatibility where possible
   - Consider users with existing analytics data

5. **Performance Considerations**
   - Don't increase update frequency without testing
   - Keep payload sizes reasonable (currently limited to top 40 posts)
   - Be mindful of observer overhead
   - Test with long scrolling sessions

6. **CSS Variables**
   - Color scheme uses CSS custom properties
   - Defined in `summary.css` and `popup.css`
   - Reference via `cssVar()` function in JavaScript

7. **Security**
   - No eval() or inline scripts (CSP restrictions)
   - Validate message sources
   - Sanitize user-generated content (captions)
   - Respect content_scripts match patterns

### Common Pitfalls

1. **Content Script Injection**
   - Auto-injection only works on new page loads
   - Use `executeScript` for existing tabs (service-worker.js:143)
   - Check if script already injected (safe to call multiple times)

2. **Message Timing**
   - Service worker may be asleep
   - Content script may not be ready
   - Always handle message failures gracefully
   - Use grace period for finalization (500ms in STOP flow)

3. **Storage Limits**
   - chrome.storage.local is generous but not unlimited
   - Keep daily stats reasonable (don't store forever)
   - Consider data cleanup for old dates

4. **DOM Observation**
   - Instagram uses infinite scroll
   - New posts are dynamically added
   - WeakSet prevents duplicate observations
   - MutationObserver is critical for new content

5. **Session Finalization**
   - Content script needs time to send final update
   - Background script waits 500ms after STOP
   - Grace period in `acceptFinalizeUntil` (5 seconds)
   - Check for finalize flag in updates

## Analytics Implementation

### Current State: Demo/Placeholder Analytics

**Important**: The current analytics (topics, emotions, breakdown) are **deterministically generated demo data** based on session duration and end time. They are **not derived from actual content analysis**.

**Implementation**: `service-worker.js:171-199`
```javascript
function generateSessionBreakdown(durationMs, endedAtMs) {
  // Uses mulberry32 PRNG with seed from date + duration
  // Generates plausible distributions for:
  // - Topics (Education, Fun, Sport, News)
  // - Emotions (Heavy, Light, Neutral)
  // - Per-topic emotion breakdown
}
```

**Why Demo Data**:
- Real content analysis requires ML/AI models
- Caption data is collected and stored
- Infrastructure is ready for future integration
- UI is fully functional with demo data

### Future: Real Content Analysis

**Data Available for Analysis**:
- Post captions (stored in `mf_raw_session`)
- Post URLs
- Dwell time per post
- Scroll patterns

**Integration Points**:
1. Replace `generateSessionBreakdown()` with real analysis
2. Process `raw.posts` array (captions + dwell time)
3. Call ML model or API for classification
4. Return same data structure (backward compatible)

**Suggested Approach**:
- Integrate Claude API or similar LLM
- Batch process captions at session end
- Classify topics and emotional tone
- Weight by dwell time
- Cache results to avoid reprocessing

## Testing Checklist

When modifying the extension, test:

- [ ] Install/reload in Chrome
- [ ] Open Instagram home feed
- [ ] Click Start in popup
- [ ] Scroll through feed (10+ posts)
- [ ] Popup shows active tracking status
- [ ] Timer increments correctly
- [ ] Click Stop in popup
- [ ] Open Analytics dashboard
- [ ] Dashboard shows data
- [ ] Period tabs work (Day/Week/Month)
- [ ] Raw debug data shows posts with captions
- [ ] Refresh analytics page
- [ ] Start new session
- [ ] Check daily aggregation
- [ ] Test with extension reload during tracking
- [ ] Test with Instagram tab close during tracking
- [ ] Inspect service worker console for errors
- [ ] Inspect content script console for errors

## Version History

- **0.0.2** - Current version (as of manifest.json)
- **0.0.1** - Initial upload (git log shows single commit)

## License

MIT License - Copyright (c) 2021 SimGus

See LICENSE file for full text.

---

**Last Updated**: 2026-01-16

*This document should be updated when making significant architectural changes or adding new features.*
