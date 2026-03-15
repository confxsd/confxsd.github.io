// VHunter Chat Module — Streaming conversation with Claude + tool access
import { CONFIG } from './config.js';

const API = CONFIG.PROXY_URL;
const userId = () => localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';

// ── State ──
let conversations = [];
let currentConvId = null;
let messages = [];
let isStreaming = false;
let abortController = null;
let listenersAttached = false;

// ── DOM refs ──
const $ = id => document.getElementById(id);

// ── Page loader ──
export async function loadChat() {
  await fetchConversations();
  renderConversationList();

  if (conversations.length > 0) {
    selectConversation(conversations[0].id);
  } else {
    showEmptyState();
  }

  // Attach listeners only once
  if (!listenersAttached) {
    const textarea = $('chatInput');
    if (textarea) {
      textarea.addEventListener('input', autoResize);
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
    }
    listenersAttached = true;
  }
}

// ── API calls ──
async function fetchConversations() {
  try {
    const res = await fetch(`${API}/api/chat/conversations`, {
      headers: { 'X-User-Id': userId() }
    });
    if (!res.ok) throw new Error(res.statusText);
    conversations = await res.json();
  } catch (e) {
    console.error('[CHAT] Failed to fetch conversations:', e);
    conversations = [];
  }
}

async function selectConversation(id) {
  currentConvId = id;
  renderConversationList();
  showLoadingMessages();

  try {
    const res = await fetch(`${API}/api/chat/conversations/${id}`, {
      headers: { 'X-User-Id': userId() }
    });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    messages = data.messages || [];
    renderMessages();
  } catch (e) {
    console.error('[CHAT] Failed to load conversation:', e);
    $('chatMessages').innerHTML = '<div class="chat-empty"><div>Failed to load conversation</div></div>';
  }
}

async function deleteConversation(id) {
  try {
    await fetch(`${API}/api/chat/conversations/${id}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userId() }
    });
    conversations = conversations.filter(c => c.id !== id);
    if (currentConvId === id) {
      currentConvId = null;
      messages = [];
      if (conversations.length) {
        selectConversation(conversations[0].id);
      } else {
        showEmptyState();
      }
    }
    renderConversationList();
  } catch (e) {
    console.error('[CHAT] Failed to delete:', e);
  }
}

function newConversation() {
  currentConvId = null;
  messages = [];
  renderConversationList();
  showEmptyState();
  $('chatInput')?.focus();
}

// ── Streaming ──
async function sendMessage() {
  const textarea = $('chatInput');
  const text = textarea?.value?.trim();
  if (!text || isStreaming) return;

  textarea.value = '';
  textarea.style.height = 'auto';

  // Add user message to UI
  appendMessage({ role: 'user', content: text });

  // Show typing indicator
  const msgArea = $('chatMessages');
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-msg assistant';
  typingEl.id = 'chatTyping';
  typingEl.innerHTML = `
    <div class="chat-msg-avatar"><i class="fa-solid fa-landmark" style="font-size:12px"></i></div>
    <div class="chat-msg-body">
      <div class="chat-msg-content">
        <div class="chat-typing">
          <div class="chat-typing-dot"></div>
          <div class="chat-typing-dot"></div>
          <div class="chat-typing-dot"></div>
        </div>
      </div>
    </div>
  `;
  msgArea.appendChild(typingEl);
  scrollToBottom();

  isStreaming = true;
  abortController = new AbortController();
  updateSendButton();

  try {
    const res = await fetch(`${API}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId(),
      },
      body: JSON.stringify({
        conversation_id: currentConvId,
        message: text,
      }),
      signal: abortController.signal,
    });

    // Remove typing indicator
    $('chatTyping')?.remove();

    if (!res.ok) {
      appendMessage({ role: 'assistant', content: `Error: ${res.status} ${res.statusText}` });
      return;
    }

    // Create assistant message shell
    const assistantEl = createAssistantBubble();
    msgArea.appendChild(assistantEl);
    scrollToBottom();

    const toolsContainer = assistantEl.querySelector('.chat-tools');
    const contentEl = assistantEl.querySelector('.chat-msg-text');

    let fullText = '';

    // Read SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processSSEParts = async (parts) => {
      for (const part of parts) {
        const lines = part.split('\n');
        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7);
          else if (line.startsWith('data: ')) eventData = line.slice(6);
        }

        if (!eventType || !eventData) continue;

        let parsed;
        try { parsed = JSON.parse(eventData); } catch (_) { continue; }

        switch (eventType) {
          case 'conversation': {
            if (parsed.id && !currentConvId) {
              currentConvId = parsed.id;
            }
            break;
          }

          case 'text': {
            fullText += parsed.text;
            contentEl.innerHTML = renderMarkdown(fullText);
            scrollToBottom();
            break;
          }

          case 'tool_start': {
            const badge = document.createElement('span');
            badge.className = 'chat-tool-badge';
            badge.id = `tool-${parsed.id}`;
            badge.innerHTML = `<span class="chat-tool-spinner"></span> ${formatToolName(parsed.name)}`;
            toolsContainer.appendChild(badge);
            toolsContainer.style.display = 'flex';
            scrollToBottom();
            break;
          }

          case 'tool_result': {
            const badge = $(`tool-${parsed.id}`);
            if (badge) {
              badge.className = 'chat-tool-badge complete';
              badge.innerHTML = `<i class="fa-solid fa-check" style="font-size:9px"></i> ${formatToolName(parsed.name)}`;
            }
            break;
          }

          case 'done': {
            // Update conversation in sidebar
            if (currentConvId) {
              const existing = conversations.find(c => c.id === currentConvId);
              if (existing) {
                existing.updated_at = new Date().toISOString();
                existing.message_count = (existing.message_count || 0) + 2;
              } else {
                // New conversation — refetch list
                await fetchConversations();
              }
              renderConversationList();
            }
            break;
          }

          case 'error': {
            fullText += `\n\n**Error:** ${parsed.error}`;
            contentEl.innerHTML = renderMarkdown(fullText);
            break;
          }
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();
      await processSSEParts(parts);
    }

    // Process any remaining data in buffer after stream ends
    buffer += decoder.decode();
    if (buffer.trim()) {
      const remaining = buffer.split('\n\n').filter(p => p.trim());
      await processSSEParts(remaining);
    }

    // Add copy button and collapse if needed
    const copyBtn = document.createElement('button');
    copyBtn.className = 'chat-msg-copy';
    copyBtn.title = 'Copy';
    copyBtn.onclick = () => copyMessage(copyBtn);
    copyBtn.innerHTML = '<i class="fa-solid fa-copy" style="font-size:11px"></i>';
    assistantEl.querySelector('.chat-msg-body')?.appendChild(copyBtn);
    maybeCollapse(assistantEl);

    // Save to local messages array
    messages.push({ role: 'user', content: text });
    messages.push({ role: 'assistant', content: fullText });

  } catch (e) {
    $('chatTyping')?.remove();
    if (e.name !== 'AbortError') {
      appendMessage({ role: 'assistant', content: `**Error:** ${e.message}` });
    }
  } finally {
    isStreaming = false;
    abortController = null;
    updateSendButton();

    // Clean up any tool badges still showing spinners (stream ended unexpectedly)
    document.querySelectorAll('.chat-tool-badge:not(.complete)').forEach(badge => {
      badge.className = 'chat-tool-badge complete';
      badge.innerHTML = badge.innerHTML.replace(/<span class="chat-tool-spinner"><\/span>/, '<i class="fa-solid fa-xmark" style="font-size:9px"></i>');
    });
  }
}

function stopStreaming() {
  if (abortController) {
    abortController.abort();
  }
}

// ── Rendering ──
function renderConversationList() {
  const list = $('chatConvList');
  if (!list) return;

  if (!conversations.length) {
    list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--tv-text-secondary);font-size:12px">No conversations yet</div>';
    return;
  }

  list.innerHTML = conversations.map(c => `
    <div class="chat-conv-item ${c.id === currentConvId ? 'active' : ''}" onclick="chatSelectConv('${c.id}')">
      <div class="chat-conv-info">
        <div class="chat-conv-title">${escapeHtml(c.title || 'Untitled')}</div>
        <div class="chat-conv-meta">${c.message_count || 0} msgs &middot; ${formatTimeAgo(c.updated_at)}</div>
      </div>
      <button class="chat-conv-delete" onclick="event.stopPropagation(); chatDeleteConv('${c.id}')" title="Delete">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `).join('');
}

function renderMessages() {
  const area = $('chatMessages');
  if (!area) return;

  if (!messages.length) {
    showEmptyState();
    return;
  }

  area.innerHTML = '';
  for (const msg of messages) {
    appendMessage(msg, false);
  }
  scrollToBottom();
}

function appendMessage(msg, animate = true) {
  const area = $('chatMessages');
  if (!area) return;

  // Remove empty state if present
  const empty = area.querySelector('.chat-empty');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = `chat-msg ${msg.role}`;
  if (!animate) el.style.animation = 'none';

  const copyBtn = `<button class="chat-msg-copy" onclick="chatCopyMsg(this)" title="Copy"><i class="fa-solid fa-copy" style="font-size:11px"></i></button>`;

  if (msg.role === 'user') {
    el.innerHTML = `
      <div class="chat-msg-avatar"><i class="fa-solid fa-user" style="font-size:12px"></i></div>
      <div class="chat-msg-body">
        <div class="chat-msg-content">${escapeHtml(msg.content)}</div>
        ${copyBtn}
      </div>
    `;
  } else {
    const toolCalls = msg.tool_calls ? (typeof msg.tool_calls === 'string' ? JSON.parse(msg.tool_calls) : msg.tool_calls) : [];
    const toolBadges = toolCalls.length
      ? `<div class="chat-tools" style="display:flex">${toolCalls.map(tc =>
          `<span class="chat-tool-badge complete"><i class="fa-solid fa-check" style="font-size:9px"></i> ${formatToolName(tc.name)}</span>`
        ).join('')}</div>`
      : '';

    el.innerHTML = `
      <div class="chat-msg-avatar"><i class="fa-solid fa-landmark" style="font-size:12px"></i></div>
      <div class="chat-msg-body">
        ${toolBadges}
        <div class="chat-msg-content">${renderMarkdown(msg.content)}</div>
        ${copyBtn}
      </div>
    `;
  }

  area.appendChild(el);
  maybeCollapse(el);
  if (animate) scrollToBottom();
}

// Collapse long messages with a "Show more" toggle
const COLLAPSE_HEIGHT = 300;

function maybeCollapse(msgEl) {
  const content = msgEl.querySelector('.chat-msg-content');
  if (!content) return;
  // Use rAF to measure after render
  requestAnimationFrame(() => {
    if (content.scrollHeight > COLLAPSE_HEIGHT + 40) {
      content.classList.add('collapsed');
      // Add toggle button if not already present
      if (!msgEl.querySelector('.chat-msg-toggle')) {
        const btn = document.createElement('button');
        btn.className = 'chat-msg-toggle';
        btn.textContent = 'Show more';
        btn.onclick = () => toggleCollapse(content, btn);
        content.parentElement.insertBefore(btn, content.nextSibling);
      }
    }
  });
}

function toggleCollapse(content, btn) {
  const isCollapsed = content.classList.toggle('collapsed');
  btn.textContent = isCollapsed ? 'Show more' : 'Show less';
}

function createAssistantBubble() {
  const el = document.createElement('div');
  el.className = 'chat-msg assistant';
  el.innerHTML = `
    <div class="chat-msg-avatar"><i class="fa-solid fa-landmark" style="font-size:12px"></i></div>
    <div class="chat-msg-body">
      <div class="chat-tools" style="display:none"></div>
      <div class="chat-msg-content"><span class="chat-msg-text"></span></div>
    </div>
  `;
  return el;
}

function showEmptyState() {
  const area = $('chatMessages');
  if (!area) return;
  area.innerHTML = `
    <div class="chat-empty">
      <div class="chat-empty-icon"><i class="fa-solid fa-landmark"></i></div>
      <div class="chat-empty-title">VHunter Chat</div>
      <div class="chat-empty-subtitle">
        Ask anything about your trading system. I have access to market data, positions, filings, daily checks, thesis, and can query the database directly.
      </div>
    </div>
  `;
}

function showLoadingMessages() {
  const area = $('chatMessages');
  if (area) area.innerHTML = '<div class="chat-empty"><div class="chat-typing"><div class="chat-typing-dot"></div><div class="chat-typing-dot"></div><div class="chat-typing-dot"></div></div></div>';
}

function updateSendButton() {
  const sendBtn = $('chatSendBtn');
  const stopBtn = $('chatStopBtn');
  if (sendBtn) sendBtn.style.display = isStreaming ? 'none' : 'flex';
  if (stopBtn) stopBtn.style.display = isStreaming ? 'flex' : 'none';
}

// ── Markdown renderer ──
function renderMarkdown(text) {
  if (!text) return '';

  let html = escapeHtml(text);

  // Code blocks (must be first to protect content from other transforms)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold (must be before italic)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic (use negative lookbehind/ahead to avoid matching inside bold)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

  // Tables
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, (_, header, sep, body) => {
    const ths = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
    const rows = body.trim().split('\n').map(row => {
      const tds = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
  });

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Numbered lists
  html = html.replace(/(^\d+\. .+$\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map(line => `<li>${line.replace(/^\d+\.\s*/, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // Line breaks (but not inside pre/table)
  html = html.replace(/\n/g, '<br>');

  // Clean up extra <br> around block elements
  html = html.replace(/<br>(<\/?(?:pre|h[23]|ul|ol|li|table|thead|tbody|tr|th|td)>)/g, '$1');
  html = html.replace(/(<\/?(?:pre|h[23]|ul|ol|li|table|thead|tbody|tr|th|td)>)<br>/g, '$1');

  return html;
}

// ── Utilities ──
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatToolName(name) {
  return name.replace(/_/g, ' ').replace(/^get /, '');
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  // Handle both ISO (with Z) and bare datetime strings
  const ts = dateStr.endsWith('Z') || dateStr.includes('+') ? new Date(dateStr).getTime() : new Date(dateStr + 'Z').getTime();
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

// Throttled scroll — avoids flooding RAF during fast streaming
let scrollPending = false;
function scrollToBottom() {
  if (scrollPending) return;
  scrollPending = true;
  requestAnimationFrame(() => {
    const area = $('chatMessages');
    if (area) area.scrollTop = area.scrollHeight;
    scrollPending = false;
  });
}

function autoResize() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 160) + 'px';
}

function toggleChatSidebar() {
  const sidebar = $('chatSidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

// Close chat sidebar when clicking outside (mobile)
document.addEventListener('click', (e) => {
  const sidebar = $('chatSidebar');
  if (!sidebar || !sidebar.classList.contains('open')) return;
  const toggleBtn = document.querySelector('.chat-sidebar-toggle');
  if (sidebar.contains(e.target) || (toggleBtn && toggleBtn.contains(e.target))) return;
  sidebar.classList.remove('open');
});

function copyMessage(btn) {
  const msgEl = btn.closest('.chat-msg');
  const content = msgEl?.querySelector('.chat-msg-content');
  if (!content) return;
  navigator.clipboard.writeText(content.innerText).then(() => {
    const icon = btn.querySelector('i');
    icon.className = 'fa-solid fa-check';
    icon.style.color = '#22c55e';
    setTimeout(() => { icon.className = 'fa-solid fa-copy'; icon.style.color = ''; }, 1500);
  });
}

// ── Window bindings ──
window.chatNewConversation = newConversation;
window.chatSendMessage = sendMessage;
window.chatSelectConv = selectConversation;
window.chatDeleteConv = deleteConversation;
window.chatStopStreaming = stopStreaming;
window.chatToggleSidebar = toggleChatSidebar;
window.chatCopyMsg = copyMessage;
