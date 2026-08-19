// PageGPT Side Panel Script

const SYSTEM_PROMPT = `You are PageGPT, an expert web developer AI that modifies web pages in real-time. The user has loaded a web page and wants you to make changes to it.

You have these tools available:
1. **CSS Injection** — Write CSS to change styles. Use the page's existing selectors.
2. **HTML Replacement** — Replace innerHTML of specific elements using CSS selectors.
3. **JavaScript Injection** — Write JS to add interactivity or dynamic changes.

## IMPORTANT RULES:
- Always explain what you're going to do BEFORE applying changes.
- Use the actual CSS selectors from the page (IDs, classes, element selectors).
- Write clean, correct CSS/JS/HTML. No bugs.
- Keep changes focused on what the user asked for.
- If multiple changes are needed, apply them one at a time.

## RESPONSE FORMAT:
When you want to make a change, respond in this exact format:

### For CSS changes:
\`\`\`css:apply
[your CSS code here]
\`\`\`

### For HTML changes:
\`\`\`html:apply [CSS_SELECTOR]
[your HTML code here]
\`\`\`

### For JavaScript changes:
\`\`\`js:apply
[your JavaScript code here]
\`\`\`

Always explain what each code block does in plain text before the code block.
If no code changes are needed, just answer normally.
The CSS selectors available on the page will be shown in the page content.`;

// State
let pageContent = null;
let conversationHistory = [];
let editCount = 0;
let editIds = [];

// DOM Elements
const messagesEl = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('btn-send');
const readPageBtn = document.getElementById('btn-read-page');
const settingsBtn = document.getElementById('btn-settings');
const settingsPanel = document.getElementById('settings-panel');
const closeSettingsBtn = document.getElementById('btn-close-settings');
const saveSettingsBtn = document.getElementById('btn-save-settings');
const pageInfo = document.getElementById('page-info');
const pageTitle = document.getElementById('page-title');
const editCountEl = document.getElementById('edit-count');
const editsBar = document.getElementById('edits-bar');
const statusDot = document.getElementById('page-status');
const statusText = document.getElementById('status-text');
const settingsStatus = document.getElementById('settings-status');

// Model options per provider
const MODEL_OPTIONS = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o (Best)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Cheapest)' }
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Best)' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Fast)' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (Powerful)' }
  ]
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
  autoResizeTextarea();
});

function setupEventListeners() {
  readPageBtn.addEventListener('click', readPage);
  sendBtn.addEventListener('click', sendMessage);
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  userInput.addEventListener('input', () => {
    sendBtn.disabled = !userInput.value.trim();
  });

  settingsBtn.addEventListener('click', toggleSettings);
  closeSettingsBtn.addEventListener('click', toggleSettings);
  saveSettingsBtn.addEventListener('click', saveSettings);

  document.getElementById('ai-provider').addEventListener('change', updateModelOptions);
  document.getElementById('btn-refresh').addEventListener('click', readPage);
  document.getElementById('btn-undo-all').addEventListener('click', undoAllEdits);

  // Example buttons
  document.querySelectorAll('.example-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      userInput.value = btn.dataset.prompt;
      sendBtn.disabled = false;
      userInput.focus();
    });
  });
}

function autoResizeTextarea() {
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 100) + 'px';
  });
}

// ========== SETTINGS ==========

async function loadSettings() {
  const data = await chrome.storage.sync.get(['aiProvider', 'apiKey', 'model']);
  if (data.aiProvider) document.getElementById('ai-provider').value = data.aiProvider;
  if (data.apiKey) document.getElementById('api-key').value = data.apiKey;
  updateModelOptions();
  if (data.model) {
    const modelSelect = document.getElementById('model-select');
    modelSelect.value = data.model;
  }
  updateStatus();
}

function updateModelOptions() {
  const provider = document.getElementById('ai-provider').value;
  const select = document.getElementById('model-select');
  select.innerHTML = '';
  (MODEL_OPTIONS[provider] || []).forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  });
}

async function saveSettings() {
  const provider = document.getElementById('ai-provider').value;
  const apiKey = document.getElementById('api-key').value.trim();
  const model = document.getElementById('model-select').value;

  if (!apiKey) {
    showSettingsStatus('Please enter an API key', 'error');
    return;
  }

  await chrome.storage.sync.set({
    aiProvider: provider,
    apiKey,
    model
  });

  showSettingsStatus('Settings saved!', 'success');
  updateStatus();

  setTimeout(() => {
    settingsPanel.classList.add('hidden');
  }, 800);
}

function toggleSettings() {
  settingsPanel.classList.toggle('hidden');
}

function showSettingsStatus(msg, type) {
  settingsStatus.textContent = msg;
  settingsStatus.className = `status-msg ${type}`;
  settingsStatus.classList.remove('hidden');
}

// ========== PAGE READING ==========

async function readPage() {
  setStatus('reading', 'Reading page...');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' });

    if (response?.error) {
      setStatus('error', 'Failed to read page');
      addSystemMessage('Failed to read page: ' + response.error);
      return;
    }

    pageContent = response;
    pageTitle.textContent = pageContent.title || 'Untitled Page';
    pageInfo.classList.remove('hidden');

    // Reset conversation with page context
    conversationHistory = [{
      role: 'system',
      content: SYSTEM_PROMPT
    }, {
      role: 'user',
      content: `I've loaded a page. Here's its content:\n\n**URL:** ${pageContent.url}\n**Title:** ${pageContent.title}\n\n**HTML Structure:**\n\`\`\`html\n${pageContent.html}\n\`\`\`\n\n**Key Styles:**\n\`\`\`css\n${JSON.stringify(pageContent.styles, null, 2)}\n\`\`\`\n\n**Linked Stylesheets:**\n${pageContent.stylesheets.map(s => `- ${s.href || 'inline'} (${s.rules} rules)`).join('\n')}\n\nPage loaded and ready for edits. What would you like to change?`
    }];

    setStatus('active', `Page loaded: ${pageContent.title}`);
    sendBtn.disabled = false;
    userInput.focus();

    // Clear old messages, show confirmation
    messagesEl.innerHTML = '';
    addSystemMessage(`📄 Page loaded: ${pageContent.title}`);
    addSystemMessage('Ready! Tell me what to change.');

  } catch (err) {
    setStatus('error', 'Error reading page');
    addErrorMessage('Error: ' + err.message);
  }
}

// ========== MESSAGING ==========

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || !pageContent) return;

  // Hide welcome, show user message
  const welcome = messagesEl.querySelector('.welcome-msg');
  if (welcome) welcome.remove();

  addUserMessage(text);
  conversationHistory.push({ role: 'user', content: text });

  userInput.value = '';
  userInput.style.height = 'auto';
  sendBtn.disabled = true;

  // Show typing indicator
  const typingEl = addTypingIndicator();

  setStatus('thinking', 'AI thinking...');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_REQUEST',
      messages: conversationHistory
    });

    typingEl.remove();

    if (response?.error) {
      addErrorMessage('Error: ' + response.error);
      setStatus('error', 'API error');
      return;
    }

    const aiContent = response.content;
    conversationHistory.push({ role: 'assistant', content: aiContent });

    // Parse and apply code changes
    await processAIResponse(aiContent);

    setStatus('active', 'Ready');

  } catch (err) {
    typingEl.remove();
    addErrorMessage('Request failed: ' + err.message);
    setStatus('error', 'Request failed');
  }
}

async function processAIResponse(content) {
  // Find code blocks with apply instructions
  const cssApplyRegex = /```css:apply\n([\s\S]*?)```/g;
  const htmlApplyRegex = /```html:apply\s+([^\n]*)\n([\s\S]*?)```/g;
  const jsApplyRegex = /```js:apply\n([\s\S]*?)```/g;

  let hasEdits = false;
  let explanation = content;

  // Remove code blocks from explanation text to show clean explanation
  const codeBlocks = [];
  let match;

  // Extract CSS blocks
  while ((match = cssApplyRegex.exec(content)) !== null) {
    codeBlocks.push({ type: 'css', code: match[1].trim() });
    explanation = explanation.replace(match[0], '');
  }

  // Extract HTML blocks
  htmlApplyRegex.lastIndex = 0;
  while ((match = htmlApplyRegex.exec(content)) !== null) {
    codeBlocks.push({ type: 'html', selector: match[1].trim(), code: match[2].trim() });
    explanation = explanation.replace(match[0], '');
  }

  // Extract JS blocks
  jsApplyRegex.lastIndex = 0;
  while ((match = jsApplyRegex.exec(content)) !== null) {
    codeBlocks.push({ type: 'js', code: match[1].trim() });
    explanation = explanation.replace(match[0], '');
  }

  // Show explanation (with markdown-like formatting)
  addAIMessage(explanation.trim(), codeBlocks);

  // Apply each code block
  for (const block of codeBlocks) {
    const editId = `edit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    try {
      if (block.type === 'css') {
        await chrome.tabs.sendMessage(await getActiveTabId(), {
          type: 'APPLY_CSS',
          id: editId,
          css: block.code
        });
        hasEdits = true;
      } else if (block.type === 'html') {
        await chrome.tabs.sendMessage(await getActiveTabId(), {
          type: 'APPLY_HTML',
          selector: block.selector,
          html: block.code
        });
      } else if (block.type === 'js') {
        await chrome.tabs.sendMessage(await getActiveTabId(), {
          type: 'APPLY_JS',
          id: editId,
          code: block.code
        });
        hasEdits = true;
      }

      editIds.push({ id: editId, type: block.type, code: block.code, selector: block.selector });
      editCount = editIds.length;
      editCountEl.textContent = editCount;
      editsBar.classList.remove('hidden');

    } catch (err) {
      addErrorMessage(`Failed to apply ${block.type}: ${err.message}`);
    }
  }
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

// ========== UNDO ==========

async function undoAllEdits() {
  try {
    const tabId = await getActiveTabId();
    await chrome.tabs.sendMessage(tabId, { type: 'REMOVE_ALL_EDITS' });
    editIds = [];
    editCount = 0;
    editCountEl.textContent = 0;
    editsBar.classList.add('hidden');
    addSystemMessage('All edits reverted');
  } catch (err) {
    addErrorMessage('Failed to revert: ' + err.message);
  }
}

// ========== UI HELPERS ==========

function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg msg-user';
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function addAIMessage(text, codeBlocks = []) {
  const div = document.createElement('div');
  div.className = 'msg msg-ai';

  // Basic markdown rendering
  let html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');

  div.innerHTML = html;

  // Add code blocks with apply indicators
  if (codeBlocks.length > 0) {
    const codeDiv = document.createElement('div');
    codeDiv.style.marginTop = '8px';
    codeBlocks.forEach((block, i) => {
      const blockEl = document.createElement('div');
      blockEl.className = 'code-block-wrapper';
      const label = block.type === 'css' ? 'CSS' : block.type === 'html' ? `HTML → ${block.selector}` : 'JavaScript';
      blockEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:600;">${label}</span>
          <span style="font-size:10px;color:var(--success);">✓ Applied</span>
        </div>
        <pre><code>${escapeHtml(block.code)}</code></pre>
      `;
      codeDiv.appendChild(blockEl);
    });
    div.appendChild(codeDiv);
  }

  messagesEl.appendChild(div);
  scrollToBottom();
}

function addErrorMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg msg-error';
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg msg-system';
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function addTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'typing-indicator';
  div.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

function scrollToBottom() {
  const chatArea = document.querySelector('.chat-area');
  requestAnimationFrame(() => {
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

function setStatus(state, text) {
  statusText.textContent = text;
  statusDot.className = 'status-dot';
  if (state === 'active') statusDot.classList.add('active');
  else if (state === 'error') statusDot.classList.add('error');
}

function updateStatus() {
  chrome.storage.sync.get(['apiKey'], (data) => {
    if (data.apiKey) {
      setStatus('active', 'API configured ✓');
    } else {
      setStatus('error', 'Click ⚙️ to configure API key');
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
