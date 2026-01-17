# How to Debug MindfulFeed Extension

## See What's Happening During Tracking

### 1. Service Worker Console (Backend - AI Analysis)
This is where AI analysis happens when you STOP tracking.

**Steps:**
1. Open Chrome and go to `chrome://extensions/`
2. Find "MindfulFeed - AI Digital Wellbeing"
3. Click **"service worker"** (blue link under the extension)
4. A DevTools window opens - this is the backend console
5. Now go to Instagram and start/stop tracking
6. Watch this console for AI analysis logs

**What to look for:**
- `[AI Analysis] Using Puter.js FREE API with model: gpt-5`
- `[AI Analysis] Puter.js response received:` (should show AI results)
- **RED ERROR MESSAGES** - these tell you what's failing!

### 2. Content Script Console (Frontend - Post Tracking)
This shows live post tracking as you scroll.

**Steps:**
1. Go to Instagram home feed
2. Right-click anywhere on the page → **Inspect**
3. Click **Console** tab
4. Now start tracking and scroll through Instagram
5. You'll see live messages like:
   - `[MFF] Started tracking`
   - `[MFF] Detected 5 posts currently visible`
   - `[MFF] Update pushed to background`

### 3. Check for Errors

**Common errors and what they mean:**

- **CORS error**: Puter.js API blocked by browser security
- **401/403 error**: Authentication issue with Puter.js
- **Network error**: Can't reach Puter.js servers
- **JSON parse error**: AI returned invalid response

## Quick Debug Checklist

- [ ] Service worker console shows AI analysis running
- [ ] No red error messages in service worker
- [ ] Content script shows posts being tracked
- [ ] Settings show "Puter.js Free AI" selected
- [ ] Model is set to "gpt-5"
- [ ] You clicked "Save Settings" after changing
