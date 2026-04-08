// ── dRag Chat Client ──

(function () {
  'use strict';

  // ── Cookie Helpers ──

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie = name + '=' + encodeURIComponent(value) +
      ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
  }

  function deleteCookie(name) {
    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax';
  }

  var HOST = 'http://localhost:3001';

  function getConfig() {
    return {
      host: HOST,
      apiKey: getCookie('drag_api_key'),
      slug: getCookie('drag_slug'),
    };
  }

  function saveConfig(apiKey, slug) {
    setCookie('drag_api_key', apiKey, 365);
    setCookie('drag_slug', slug, 365);
  }

  // ── Conversation Storage ──

  function loadConversations() {
    try {
      return JSON.parse(localStorage.getItem('drag_conversations')) || [];
    } catch {
      return [];
    }
  }

  function saveConversations(conversations) {
    localStorage.setItem('drag_conversations', JSON.stringify(conversations));
  }

  function getActiveId() {
    return localStorage.getItem('drag_active_conversation');
  }

  function setActiveId(id) {
    localStorage.setItem('drag_active_conversation', id);
  }

  function generateId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function createConversation() {
    const id = generateId();
    const conv = {
      id: id,
      title: 'New Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionId: 'drag-' + id,
      messages: [],
    };
    const convs = loadConversations();
    convs.unshift(conv);
    saveConversations(convs);
    setActiveId(id);
    return conv;
  }

  function deleteConversation(id) {
    let convs = loadConversations();
    convs = convs.filter(function (c) { return c.id !== id; });
    saveConversations(convs);
    if (getActiveId() === id) {
      setActiveId(convs.length > 0 ? convs[0].id : null);
    }
  }

  function getConversation(id) {
    return loadConversations().find(function (c) { return c.id === id; }) || null;
  }

  function updateConversation(id, updater) {
    const convs = loadConversations();
    const conv = convs.find(function (c) { return c.id === id; });
    if (conv) {
      updater(conv);
      conv.updatedAt = new Date().toISOString();
      saveConversations(convs);
    }
  }

  // ── Markdown Renderer ──

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function renderMarkdown(text) {
    if (!text) return '';

    // Escape HTML first
    var html = escapeHtml(text);

    // Code blocks (``` ... ```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      return '<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' + code.trim() + '</code></pre>';
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headings
    html = html.replace(/^### (.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^## (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^# (.+)$/gm, '<h3>$1</h3>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Unordered lists
    html = html.replace(/(?:^|\n)((?:[-*] .+\n?)+)/g, function (_, block) {
      var items = block.trim().split('\n').map(function (line) {
        return '<li>' + line.replace(/^[-*] /, '') + '</li>';
      }).join('');
      return '<ul>' + items + '</ul>';
    });

    // Ordered lists
    html = html.replace(/(?:^|\n)((?:\d+\. .+\n?)+)/g, function (_, block) {
      var items = block.trim().split('\n').map(function (line) {
        return '<li>' + line.replace(/^\d+\. /, '') + '</li>';
      }).join('');
      return '<ol>' + items + '</ol>';
    });

    // Paragraphs — split on double newlines
    html = html.split(/\n{2,}/).map(function (block) {
      block = block.trim();
      if (!block) return '';
      // Don't wrap block elements
      if (/^<(h[1-6]|ul|ol|pre|blockquote|hr|details)/.test(block)) return block;
      return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
    }).join('');

    return html;
  }

  // ── Source Citation Rendering ──

  function prettifyTitle(filename) {
    return filename
      .replace(/\.md$/i, '')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function renderSources(sources) {
    if (!sources || sources.length === 0) return null;

    // Group by title
    var groups = {};
    sources.forEach(function (s) {
      var title = s.title || 'Unknown Source';
      if (!groups[title]) groups[title] = [];
      groups[title].push(s.text || s.pageContent || '');
    });

    var details = document.createElement('details');
    details.className = 'sources';

    var summary = document.createElement('summary');
    var count = sources.length;
    summary.textContent = count + ' source' + (count !== 1 ? 's' : '') + ' cited';
    details.appendChild(summary);

    Object.keys(groups).forEach(function (title) {
      var passages = groups[title];
      var card = document.createElement('div');
      card.className = 'source-card';

      var titleEl = document.createElement('div');
      titleEl.className = 'source-title';
      titleEl.textContent = prettifyTitle(title) +
        (passages.length > 1 ? ' (' + passages.length + ' passages)' : '');
      card.appendChild(titleEl);

      passages.forEach(function (text) {
        if (!text) return;
        var textEl = document.createElement('div');
        textEl.className = 'source-text';
        textEl.textContent = text;
        card.appendChild(textEl);

        var expand = document.createElement('span');
        expand.className = 'source-expand';
        expand.textContent = 'Show more';
        expand.addEventListener('click', function () {
          var isExpanded = textEl.classList.toggle('expanded');
          expand.textContent = isExpanded ? 'Show less' : 'Show more';
        });
        card.appendChild(expand);
      });

      details.appendChild(card);
    });

    return details;
  }

  // ── SSE Streaming ──

  var currentAbort = null;

  async function streamChat(message, sessionId) {
    var config = getConfig();
    var url = config.host + '/api/v1/workspace/' + config.slug + '/stream-chat';

    currentAbort = new AbortController();

    var response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + config.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        message: message,
        mode: 'query',
        sessionId: sessionId,
      }),
      signal: currentAbort.signal,
    });

    if (!response.ok) {
      var errText = await response.text().catch(function () { return ''; });
      throw new Error('API error ' + response.status + ': ' + (errText || response.statusText));
    }

    return response.body;
  }

  async function* parseSSE(readableStream) {
    var reader = readableStream.getReader();
    var decoder = new TextDecoder();
    var buffer = '';

    try {
      while (true) {
        var result = await reader.read();
        if (result.done) break;

        buffer += decoder.decode(result.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop();

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line || !line.startsWith('data:')) continue;

          var jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          try {
            yield JSON.parse(jsonStr);
          } catch (e) {
            // skip malformed
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // Non-streaming fallback
  async function chatSync(message, sessionId) {
    var config = getConfig();
    var url = config.host + '/api/v1/workspace/' + config.slug + '/chat';

    var response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        mode: 'query',
        sessionId: sessionId,
      }),
    });

    if (!response.ok) throw new Error('API error ' + response.status);
    return response.json();
  }

  // ── DOM Helpers ──

  var $messages = null;
  var $chatInput = null;
  var $sendBtn = null;
  var $convList = null;
  var isStreaming = false;

  function scrollToBottom() {
    $messages.scrollTo({ top: $messages.scrollHeight, behavior: 'smooth' });
  }

  function setLoading(loading) {
    isStreaming = loading;
    $sendBtn.disabled = loading;
    $chatInput.disabled = loading;
    if (!loading) $chatInput.focus();
  }

  function appendMessageToDOM(role, content, sources) {
    // Hide welcome message
    var welcome = document.getElementById('welcome-msg');
    if (welcome) welcome.hidden = true;

    var row = document.createElement('div');
    row.className = 'message-row ' + role;

    var bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    if (role === 'assistant' && content) {
      bubble.innerHTML = renderMarkdown(content);
    } else {
      bubble.textContent = content || '';
    }

    row.appendChild(bubble);

    if (role === 'assistant' && sources) {
      var srcEl = renderSources(sources);
      if (srcEl) row.appendChild(srcEl);
    }

    $messages.appendChild(row);
    scrollToBottom();
    return bubble;
  }

  function showError(msg) {
    var el = document.createElement('div');
    el.className = 'chat-error';
    el.textContent = msg;
    $messages.appendChild(el);
    scrollToBottom();
  }

  function clearMessages() {
    $messages.innerHTML = '';
  }

  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  }

  // ── Sidebar Rendering ──

  function renderConversationList() {
    var convs = loadConversations();
    var activeId = getActiveId();
    $convList.innerHTML = '';

    convs.forEach(function (conv) {
      var item = document.createElement('div');
      item.className = 'conv-item' + (conv.id === activeId ? ' active' : '');

      var title = document.createElement('span');
      title.className = 'conv-item-title';
      title.textContent = conv.title;
      item.appendChild(title);

      var del = document.createElement('button');
      del.className = 'conv-item-delete';
      del.textContent = '\u00d7';
      del.setAttribute('aria-label', 'Delete conversation');
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteConversation(conv.id);
        renderConversationList();
        loadActiveConversation();
      });
      item.appendChild(del);

      item.addEventListener('click', function () {
        setActiveId(conv.id);
        renderConversationList();
        loadActiveConversation();
      });

      $convList.appendChild(item);
    });
  }

  function loadActiveConversation() {
    clearMessages();
    var id = getActiveId();
    if (!id) {
      var welcome = document.createElement('div');
      welcome.id = 'welcome-msg';
      welcome.className = 'welcome';
      welcome.innerHTML = '<h2>Ask your library anything</h2><p>Answers are grounded in your book collection with source citations.</p>';
      $messages.appendChild(welcome);
      return;
    }

    var conv = getConversation(id);
    if (!conv) return;

    conv.messages.forEach(function (msg) {
      appendMessageToDOM(msg.role, msg.content, msg.sources);
    });
  }

  // ── Send Message ──

  async function sendMessage(text) {
    text = text.trim();
    if (!text || isStreaming) return;

    // Ensure active conversation
    var activeId = getActiveId();
    if (!activeId) {
      var conv = createConversation();
      activeId = conv.id;
      renderConversationList();
    }

    var conversation = getConversation(activeId);
    if (!conversation) return;

    // Add user message
    var userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    updateConversation(activeId, function (c) {
      c.messages.push(userMsg);
      if (c.title === 'New Chat') {
        c.title = text.length > 50 ? text.slice(0, 50) + '...' : text;
      }
    });
    appendMessageToDOM('user', text);
    renderConversationList();

    // Create assistant placeholder
    setLoading(true);
    var bubble = appendMessageToDOM('assistant', '');
    bubble.classList.add('typing-indicator');

    var fullText = '';
    var sources = [];

    try {
      var stream = await streamChat(text, conversation.sessionId);
      bubble.classList.remove('typing-indicator');

      for await (var chunk of parseSSE(stream)) {
        if (chunk.error) {
          throw new Error(chunk.error);
        }

        if (chunk.textResponse) {
          fullText += chunk.textResponse;
          bubble.textContent = fullText;
          scrollToBottom();
        }

        if (chunk.sources && chunk.sources.length > 0) {
          sources = chunk.sources;
        }

        if (chunk.close) break;
      }

      // Final render with markdown
      bubble.innerHTML = renderMarkdown(fullText);

      // Add citations
      if (sources.length > 0) {
        var srcEl = renderSources(sources);
        if (srcEl) bubble.closest('.message-row').appendChild(srcEl);
      }

      // Save to localStorage
      updateConversation(activeId, function (c) {
        c.messages.push({
          role: 'assistant',
          content: fullText,
          sources: sources,
          timestamp: new Date().toISOString(),
        });
      });

    } catch (err) {
      bubble.classList.remove('typing-indicator');

      if (err.name === 'AbortError') {
        bubble.textContent = '(cancelled)';
      } else {
        bubble.remove();
        showError('Error: ' + err.message);

        // Try non-streaming fallback
        try {
          var data = await chatSync(text, conversation.sessionId);
          fullText = data.textResponse || '';
          sources = data.sources || [];

          var fallbackBubble = appendMessageToDOM('assistant', '');
          fallbackBubble.innerHTML = renderMarkdown(fullText);
          if (sources.length > 0) {
            var srcEl2 = renderSources(sources);
            if (srcEl2) fallbackBubble.closest('.message-row').appendChild(srcEl2);
          }

          updateConversation(activeId, function (c) {
            c.messages.push({
              role: 'assistant',
              content: fullText,
              sources: sources,
              timestamp: new Date().toISOString(),
            });
          });
        } catch (fallbackErr) {
          showError('Fallback also failed: ' + fallbackErr.message);
        }
      }
    }

    setLoading(false);
    scrollToBottom();
  }

  // ── Setup / Auth ──

  async function validateConnection(apiKey) {
    try {
      var resp = await fetch(HOST + '/api/v1/auth', {
        headers: { 'Authorization': 'Bearer ' + apiKey },
      });
      return resp.ok;
    } catch (e) {
      return false;
    }
  }

  function showSetup(prefill) {
    var overlay = document.getElementById('setup-overlay');
    var app = document.getElementById('app');
    var keyInput = document.getElementById('setup-key');
    var slugInput = document.getElementById('setup-slug');

    if (prefill) {
      keyInput.value = prefill.apiKey || '';
      slugInput.value = prefill.slug || '';
    } else {
      slugInput.value = slugInput.value || 'my-workspace';
    }

    overlay.hidden = false;
    app.hidden = true;
  }

  function showChat() {
    document.getElementById('setup-overlay').hidden = true;
    document.getElementById('app').hidden = false;
    renderConversationList();
    loadActiveConversation();
    $chatInput.focus();
  }

  // ── Init ──

  function init() {
    $messages = document.getElementById('messages');
    $chatInput = document.getElementById('chat-input');
    $sendBtn = document.getElementById('send-btn');
    $convList = document.getElementById('conversation-list');

    // Setup form
    var setupForm = document.getElementById('setup-form');
    var setupError = document.getElementById('setup-error');
    var setupBtn = document.getElementById('setup-btn');

    setupForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var apiKey = document.getElementById('setup-key').value.trim();
      var slug = document.getElementById('setup-slug').value.trim();

      if (!apiKey || !slug) return;

      setupBtn.disabled = true;
      setupBtn.textContent = 'Connecting...';
      setupError.hidden = true;

      var ok = await validateConnection(apiKey);
      if (ok) {
        saveConfig(apiKey, slug);
        showChat();
      } else {
        setupError.textContent = 'Could not connect. Check your API key and that AnythingLLM is running on localhost:3001.';
        setupError.hidden = false;
      }

      setupBtn.disabled = false;
      setupBtn.textContent = 'Connect';
    });

    // Chat form
    var chatForm = document.getElementById('chat-form');
    chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      sendMessage($chatInput.value);
      $chatInput.value = '';
      autoResize($chatInput);
    });

    // Textarea auto-resize and Enter to send
    $chatInput.addEventListener('input', function () {
      autoResize($chatInput);
    });

    $chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
      }
    });

    // New chat
    document.getElementById('new-chat-btn').addEventListener('click', function () {
      createConversation();
      renderConversationList();
      loadActiveConversation();
    });

    // Settings
    document.getElementById('settings-btn').addEventListener('click', function () {
      showSetup(getConfig());
    });

    // Sidebar toggle (mobile)
    document.getElementById('sidebar-toggle').addEventListener('click', function () {
      document.getElementById('app').classList.toggle('sidebar-open');
    });

    // Close sidebar on backdrop click (mobile)
    document.addEventListener('click', function (e) {
      var app = document.getElementById('app');
      if (app.classList.contains('sidebar-open') &&
          !e.target.closest('#sidebar') &&
          !e.target.closest('#sidebar-toggle')) {
        app.classList.remove('sidebar-open');
      }
    });

    // Check for existing config
    var config = getConfig();
    if (config.apiKey && config.slug) {
      showChat();
    } else {
      showSetup();
    }
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
