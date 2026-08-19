// PageGPT Background Service Worker
// Handles AI API calls and side panel management

// Open side panel on extension icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Handle messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AI_REQUEST') {
    handleAIRequest(message, sender.tab)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_PAGE_CONTENT') {
    // Forward to content script of active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_PAGE' }, (response) => {
          sendResponse(response);
        });
      } else {
        sendResponse({ error: 'No active tab' });
      }
    });
    return true;
  }
});

async function handleAIRequest(message, tab) {
  const settings = await chrome.storage.sync.get(['aiProvider', 'apiKey', 'model']);

  if (!settings.apiKey) {
    throw new Error('API key not configured. Click the ⚙️ settings icon to set it up.');
  }

  const provider = settings.aiProvider || 'openai';
  const model = settings.model || (provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514');

  if (provider === 'openai') {
    return callOpenAI(settings.apiKey, model, message.messages);
  } else if (provider === 'anthropic') {
    return callAnthropic(settings.apiKey, model, message.messages);
  } else {
    throw new Error('Unknown AI provider: ' + provider);
  }
}

async function callOpenAI(apiKey, model, messages) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return { content: data.choices[0].message.content };
}

async function callAnthropic(apiKey, model, messages) {
  // Convert messages format for Anthropic
  const systemMsg = messages.find(m => m.role === 'system');
  const userMsgs = messages.filter(m => m.role !== 'system');

  const body = {
    model,
    max_tokens: 4096,
    messages: userMsgs.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }))
  };

  if (systemMsg) {
    body.system = systemMsg.content;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return { content: data.content[0].text };
}
