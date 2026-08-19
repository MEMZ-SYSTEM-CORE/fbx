// PageGPT Content Script
// Reads and modifies page content in real-time

(() => {
  // Track applied modifications
  const appliedStyles = new Map();
  const appliedScripts = new Map();
  let styleElement = null;
  let editHighlight = null;

  // Listen for messages from background/side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'EXTRACT_PAGE':
        sendResponse(extractPageContent());
        break;

      case 'APPLY_CSS':
        try {
          applyCSS(message.id, message.css);
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ error: e.message });
        }
        break;

      case 'REMOVE_CSS':
        removeCSS(message.id);
        sendResponse({ success: true });
        break;

      case 'APPLY_HTML':
        try {
          applyHTML(message.selector, message.html);
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ error: e.message });
        }
        break;

      case 'APPLY_JS':
        try {
          applyJS(message.id, message.code);
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ error: e.message });
        }
        break;

      case 'REMOVE_JS':
        removeJS(message.id);
        sendResponse({ success: true });
        break;

      case 'HIGHLIGHT_ELEMENT':
        highlightElement(message.selector);
        sendResponse({ success: true });
        break;

      case 'CLEAR_HIGHLIGHTS':
        clearHighlights();
        sendResponse({ success: true });
        break;

      case 'REMOVE_ALL_EDITS':
        removeAllEdits();
        sendResponse({ success: true });
        break;
    }
    return true;
  });

  function extractPageContent() {
    // Get essential page structure without bloating
    const body = document.body;
    if (!body) return { error: 'No body element found' };

    // Get clean HTML structure
    const html = getCleanHTML(body);

    // Get computed styles for key elements
    const styles = getRelevantStyles();

    // Get all linked stylesheets
    const stylesheets = getStylesheets();

    // Get inline scripts info (not full code for safety, just references)
    const scripts = getScriptsInfo();

    return {
      url: window.location.href,
      title: document.title,
      html,
      styles,
      stylesheets,
      scripts,
      meta: {
        description: document.querySelector('meta[name="description"]')?.content || '',
        viewport: document.querySelector('meta[name="viewport"]')?.content || ''
      }
    };
  }

  function getCleanHTML(element) {
    // Deep clone and clean for AI consumption
    const clone = element.cloneNode(true);

    // Remove data-pgpt markers
    clone.querySelectorAll('[data-pgpt]').forEach(el => el.remove());

    // Simplify attributes to reduce token usage
    const simplifyNode = (node) => {
      if (node.nodeType !== 1) return; // Element nodes only

      // Keep only essential attributes
      const keep = ['class', 'id', 'href', 'src', 'alt', 'type', 'name', 'value', 'placeholder', 'style', 'data-selector'];
      const attrs = Array.from(node.attributes || []);
      attrs.forEach(attr => {
        if (!keep.includes(attr.name)) {
          node.removeAttribute(attr.name);
        }
      });

      // Add data-selector for targeting
      node.setAttribute('data-selector', getSelector(node));

      Array.from(node.children || []).forEach(simplifyNode);
    };

    simplifyNode(clone);

    // Limit depth and size
    return limitTreeDepth(clone, 8).innerHTML;
  }

  function getSelector(el) {
    if (el.id) return `#${el.id}`;
    let path = [];
    while (el && el.nodeType === 1) {
      let selector = el.tagName.toLowerCase();
      if (el.id) {
        path.unshift(`#${el.id}`);
        break;
      }
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).slice(0, 2).join('.');
        if (classes) selector += `.${classes}`;
      }
      path.unshift(selector);
      el = el.parentElement;
    }
    return path.join(' > ');
  }

  function limitTreeDepth(node, maxDepth) {
    if (maxDepth <= 0) {
      while (node.firstChild) node.removeChild(node.firstChild);
      return node;
    }
    Array.from(node.children).forEach(child => limitTreeDepth(child, maxDepth - 1));
    return node;
  }

  function getRelevantStyles() {
    const importantSelectors = [
      'body', 'header', 'nav', 'main', 'footer', 'section', 'article',
      'h1', 'h2', 'h3', 'h4', 'a', 'button', 'input', 'form',
      '.hero', '.container', '[class*="card"]', '[class*="btn"]',
      '[class*="nav"]', '[class*="header"]', '[class*="footer"]'
    ];

    const styles = {};
    importantSelectors.forEach(sel => {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const computed = window.getComputedStyle(el);
          styles[sel] = {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            fontSize: computed.fontSize,
            fontFamily: computed.fontFamily,
            padding: computed.padding,
            margin: computed.margin,
            borderRadius: computed.borderRadius,
            display: computed.display,
            maxWidth: computed.maxWidth
          };
        }
      } catch (e) {}
    });

    return styles;
  }

  function getStylesheets() {
    return Array.from(document.styleSheets).map(sheet => {
      try {
        return {
          href: sheet.href,
          rules: sheet.cssRules ? sheet.cssRules.length : 0
        };
      } catch (e) {
        return { href: sheet.href, error: 'CORS blocked' };
      }
    });
  }

  function getScriptsInfo() {
    return Array.from(document.scripts).map(s => ({
      src: s.src || '(inline)',
      type: s.type || 'text/javascript'
    }));
  }

  // ========== MODIFICATION ENGINE ==========

  function getOrCreateStyleElement() {
    if (!styleElement || !styleElement.parentNode) {
      styleElement = document.createElement('style');
      styleElement.id = 'pgpt-custom-styles';
      styleElement.setAttribute('data-pgpt', 'true');
      document.head.appendChild(styleElement);
    }
    return styleElement;
  }

  function applyCSS(id, css) {
    appliedStyles.set(id, css);
    rebuildStyles();
  }

  function removeCSS(id) {
    appliedStyles.delete(id);
    rebuildStyles();
  }

  function rebuildStyles() {
    const el = getOrCreateStyleElement();
    const allCSS = Array.from(appliedStyles.values()).join('\n\n');
    el.textContent = allCSS;
  }

  function applyHTML(selector, html) {
    // Find element and replace content
    let target;
    try {
      target = document.querySelector(selector);
    } catch (e) {
      // Try as a direct reference
      target = findElementNearSelector(selector);
    }

    if (!target) {
      throw new Error(`Element not found: ${selector}`);
    }

    target.innerHTML = html;
    target.setAttribute('data-pgpt', 'modified');
  }

  function findElementNearSelector(selector) {
    // Try fuzzy matching
    const parts = selector.split(' > ').map(s => s.trim());
    let current = document.body;

    for (const part of parts) {
      if (!current) return null;
      const next = current.querySelector(part);
      if (next) {
        current = next;
      } else {
        return null;
      }
    }
    return current;
  }

  function applyJS(id, code) {
    appliedScripts.set(id, code);
    try {
      // Execute in page context via script injection
      const script = document.createElement('script');
      script.setAttribute('data-pgpt', `js-${id}`);
      script.textContent = `(function(){\n${code}\n})();`;
      document.head.appendChild(script);
    } catch (e) {
      throw new Error(`JS execution error: ${e.message}`);
    }
  }

  function removeJS(id) {
    const scriptEl = document.querySelector(`[data-pgpt="js-${id}"]`);
    if (scriptEl) scriptEl.remove();
    appliedScripts.delete(id);
    // Note: JS side effects cannot be undone
  }

  function highlightElement(selector) {
    clearHighlights();
    try {
      const el = document.querySelector(selector);
      if (el) {
        editHighlight = document.createElement('div');
        editHighlight.setAttribute('data-pgpt', 'highlight');
        editHighlight.style.cssText = `
          position: absolute;
          pointer-events: none;
          border: 2px dashed #ff6b35;
          background: rgba(255, 107, 53, 0.1);
          z-index: 999999;
          border-radius: 4px;
          transition: all 0.2s ease;
        `;
        document.body.appendChild(editHighlight);
        positionHighlight(el);
      }
    } catch (e) {}
  }

  function positionHighlight(el) {
    if (!editHighlight) return;
    const rect = el.getBoundingClientRect();
    editHighlight.style.top = (rect.top + window.scrollY - 4) + 'px';
    editHighlight.style.left = (rect.left + window.scrollX - 4) + 'px';
    editHighlight.style.width = (rect.width + 8) + 'px';
    editHighlight.style.height = (rect.height + 8) + 'px';
  }

  function clearHighlights() {
    if (editHighlight) {
      editHighlight.remove();
      editHighlight = null;
    }
    document.querySelectorAll('[data-pgpt="highlight"]').forEach(el => el.remove());
  }

  function removeAllEdits() {
    // Remove custom styles
    const styleEl = document.getElementById('pgpt-custom-styles');
    if (styleEl) styleEl.remove();
    appliedStyles.clear();

    // Remove injected scripts
    document.querySelectorAll('[data-pgpt^="js-"]').forEach(el => el.remove());
    appliedScripts.clear();

    // Remove modified markers
    document.querySelectorAll('[data-pgpt="modified"]').forEach(el => {
      el.removeAttribute('data-pgpt');
    });

    clearHighlights();
  }
})();
