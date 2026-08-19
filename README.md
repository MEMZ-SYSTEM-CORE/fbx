# PageGPT - AI Page Editor

A Chrome Extension that lets you click to read any web page, tell an AI what to change, and it modifies the page live in real-time.

## ✨ Features

- **📖 One-Click Page Reading** — Click "Read Page" to analyze any website's HTML, CSS, and JS
- **🤖 AI-Powered Editing** — Chat with GPT-4o or Claude to describe changes in natural language
- **🎨 Live CSS Injection** — Change colors, layouts, fonts, animations instantly
- **📝 HTML Modification** — Replace content, restructure elements
- **⚡ JavaScript Execution** — Add interactivity, modify behavior
- **🔄 One-Click Undo** — Revert all changes instantly
- **🔒 Private** — Your API key stays in your browser only

## 🚀 Install

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this folder
5. The ⚡ PageGPT icon appears in your toolbar

## ⚙️ Setup

1. Click the ⚡ icon → click ⚙️ **Settings**
2. Choose your AI provider:
   - **OpenAI** — Get an API key at [platform.openai.com](https://platform.openai.com)
   - **Anthropic** — Get an API key at [console.anthropic.com](https://console.anthropic.com)
3. Paste your API key and select a model
4. Click **Save**

## 📖 Usage

1. Navigate to any webpage
2. Click the ⚡ PageGPT icon in the toolbar
3. Click **📖 Read Page** to load the page content
4. Type what you want to change (e.g., "make the background dark")
5. AI analyzes the page and applies changes live
6. Click **Revert All** to undo everything

### Example Prompts

- "Make the background dark and change all text to white"
- "Change the main heading to be larger and blue"
- "Add a sticky navigation bar with blur effect"
- "Replace the footer text with 'Custom Footer'"
- "Add a red border around the navigation"
- "Make all images round with a shadow"

## 🛡️ Privacy

- Your API key is stored locally in Chrome's extension storage
- No data is sent anywhere except the AI provider you configured
- Page content is only sent to the AI for analysis when you request changes

## 📁 Structure

```
├── manifest.json      # Chrome Extension manifest (V3)
├── background.js      # Service worker: AI API calls
├── content.js         # Content script: DOM read/write
├── sidepanel.html     # Side panel UI
├── sidepanel.css      # Side panel styles
├── sidepanel.js       # Side panel logic
└── icons/             # Extension icons
```
