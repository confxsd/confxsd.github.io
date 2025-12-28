// Feed Module - Signal intelligence from tweets, blogs, charts
import { CONFIG } from './config.js';

let feedItems = [];
let runCallback = null;

export function setRunCallback(cb) {
  runCallback = cb;
}

// API functions
async function feedFetch(path, options = {}) {
  const userId = localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';
  const response = await fetch(`${CONFIG.PROXY_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
      ...options.headers
    }
  });
  return response.json();
}

export async function getFeedItems(status = null, ticker = null) {
  let query = '/api/feed?limit=100';
  if (status) query += `&status=${status}`;
  if (ticker) query += `&ticker=${ticker}`;
  return feedFetch(query);
}

export async function addFeedItem(item) {
  return feedFetch('/api/feed', {
    method: 'POST',
    body: JSON.stringify(item)
  });
}

export async function updateFeedItem(id, updates) {
  return feedFetch(`/api/feed/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });
}

export async function deleteFeedItem(id) {
  return feedFetch(`/api/feed/${id}`, { method: 'DELETE' });
}

export async function uploadImage(file) {
  const userId = localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${CONFIG.PROXY_URL}/api/feed/upload`, {
    method: 'POST',
    headers: { 'X-User-Id': userId },
    body: formData
  });
  return response.json();
}

// Load and render feed
export async function loadFeed() {
  const container = document.getElementById('feedList');
  if (!container) return;

  container.innerHTML = '<div class="loading">Loading feed...</div>';

  try {
    const response = await getFeedItems();
    console.log('Raw API response:', response);

    // Handle both array and object responses
    feedItems = Array.isArray(response) ? response : (response.results || response.data || []);

    if (!Array.isArray(feedItems)) {
      feedItems = [];
    }

    console.log('feedItems after processing:', feedItems);
    renderFeed(container);
    updateFeedStats();
  } catch (e) {
    console.error('Load error:', e);
    container.innerHTML = `<div class="error">Failed to load feed: ${e.message}</div>`;
  }
}

function renderFeed(container) {
  const items = feedItems || [];

  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📡</div>
        <div class="empty-text">No signals yet</div>
        <div class="empty-hint">Tap + to capture tweets, charts, or insights</div>
      </div>`;
    return;
  }

  container.innerHTML = items.map(item => renderFeedItem(item)).join('');
}

function parseJsonField(field) {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  try {
    const parsed = JSON.parse(field);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderFeedItem(item) {
  if (!item) return '';

  const timeAgo = getTimeAgo(item.created_at);
  const sourceIcon = getSourceIcon(item.source_type);
  const tickers = parseJsonField(item.tickers);
  const images = parseJsonField(item.image_urls);

  const tickerTags = tickers.map(t =>
    `<span class="feed-ticker" onclick="window.analyzeTicker('${t}')">${t}</span>`
  ).join('');

  const sentimentClass = item.sentiment === 'bullish' ? 'g' :
                         item.sentiment === 'bearish' ? 'r' : '';

  const imageHtml = images.length ? `
    <div class="feed-images-carousel">
      ${images.map(url => `<a href="${url}" target="_blank" class="feed-thumb"><img src="${url}" alt="chart"></a>`).join('')}
    </div>` : '';

  return `
    <div class="feed-item" data-id="${item.id}">
      <div class="feed-header">
        <span class="feed-source">${sourceIcon} ${item.author || item.source_type}</span>
        <span class="feed-time">${timeAgo}</span>
        <button class="feed-menu" onclick="toggleFeedMenu('${item.id}')">⋮</button>
      </div>
      <div class="feed-content">${escapeHtml(item.content)}</div>
      ${imageHtml}
      <div class="feed-meta">
        <div class="feed-tickers">${tickerTags}</div>
        ${item.sentiment ? `<span class="feed-sentiment ${sentimentClass}">${item.sentiment}</span>` : ''}
        ${item.signal_type ? `<span class="feed-signal">${item.signal_type}</span>` : ''}
        <span class="feed-status ${item.status}">${item.status}</span>
      </div>
      <div class="feed-actions hidden" id="menu-${item.id}">
        <button onclick="editFeedItem('${item.id}')">Edit</button>
        <button onclick="deleteFeedItemConfirm('${item.id}')" class="danger">Delete</button>
      </div>
    </div>`;
}

function getSourceIcon(type) {
  const icons = { tweet: '🐦', blog: '📝', chart: '📊', link: '🔗' };
  return icons[type] || '📌';
}

function getTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = (now - date) / 1000;

  if (diff < 60) return 'now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Modal functions
export function openFeedModal(editId = null) {
  const modal = document.getElementById('feedModal');
  const form = document.getElementById('feedForm');
  const title = document.getElementById('feedModalTitle');

  form.reset();
  document.getElementById('feedId').value = '';
  document.getElementById('feedImagePreview').innerHTML = '';
  window.pendingImages = [];

  if (editId) {
    const item = feedItems.find(i => i.id === editId);
    if (item) {
      title.textContent = 'Edit Signal';
      document.getElementById('feedId').value = item.id;
      document.getElementById('feedType').value = item.source_type || 'tweet';
      document.getElementById('feedAuthor').value = item.author || '';
      document.getElementById('feedContent').value = item.content || '';
      document.getElementById('feedUrl').value = item.url || '';
      document.getElementById('feedTickers').value = parseJsonField(item.tickers).join(', ');
      document.getElementById('feedSentiment').value = item.sentiment || '';
      document.getElementById('feedSignalType').value = item.signal_type || '';

      // Show existing images
      const existingImages = parseJsonField(item.image_urls);
      if (existingImages.length) {
        window.pendingImages = existingImages;
        renderImagePreview();
      }
    }
  } else {
    title.textContent = 'New Signal';
  }

  modal.classList.add('active');
}

export function closeFeedModal() {
  document.getElementById('feedModal').classList.remove('active');
}

export async function saveFeedItem(event) {
  event.preventDefault();

  const id = document.getElementById('feedId').value;
  const tickers = document.getElementById('feedTickers').value
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(t => t);

  const images = window.pendingImages && window.pendingImages.length > 0 ? [...window.pendingImages] : null;
  console.log('pendingImages before save:', window.pendingImages, 'images to save:', images);

  const item = {
    source_type: document.getElementById('feedType').value,
    author: document.getElementById('feedAuthor').value || null,
    content: document.getElementById('feedContent').value,
    url: document.getElementById('feedUrl').value || null,
    tickers: tickers.length ? tickers : null,
    sentiment: document.getElementById('feedSentiment').value || null,
    signal_type: document.getElementById('feedSignalType').value || null,
    image_urls: images
  };

  console.log('Saving feed item:', item);

  try {
    if (id) {
      await updateFeedItem(id, item);
    } else {
      await addFeedItem(item);
    }
    closeFeedModal();
    loadFeed();
  } catch (e) {
    alert('Error saving: ' + e.message);
  }
}

// Image handling
let uploading = false;

export async function handleImageUpload(event) {
  const files = event.target.files;
  if (!files.length) return;

  const preview = document.getElementById('feedImagePreview');
  const saveBtn = document.querySelector('#feedForm button[type="submit"]');
  window.pendingImages = window.pendingImages || [];

  uploading = true;
  if (saveBtn) saveBtn.disabled = true;

  for (const file of files) {
    preview.innerHTML = '<div class="upload-progress">Uploading image...</div>';

    try {
      const result = await uploadImage(file);
      if (result.error) {
        alert('Upload error: ' + result.error);
      } else if (result.url) {
        window.pendingImages.push(result.url);
        console.log('Image uploaded, pendingImages now:', window.pendingImages);
      }
    } catch (e) {
      alert('Upload failed: ' + e.message);
    }
  }

  uploading = false;
  if (saveBtn) saveBtn.disabled = false;
  renderImagePreview();
}

function renderImagePreview() {
  const preview = document.getElementById('feedImagePreview');
  preview.innerHTML = window.pendingImages.map((url, i) => `
    <div class="preview-img">
      <img src="${url}" alt="preview">
      <button type="button" onclick="removePreviewImage(${i})">×</button>
    </div>
  `).join('');
}

// Global functions for onclick handlers
window.openFeedModal = openFeedModal;
window.closeFeedModal = closeFeedModal;
window.saveFeedItem = saveFeedItem;
window.handleImageUpload = handleImageUpload;

window.removePreviewImage = function(index) {
  window.pendingImages.splice(index, 1);
  renderImagePreview();
};

window.toggleFeedMenu = function(id) {
  const menu = document.getElementById(`menu-${id}`);
  menu.classList.toggle('hidden');
};

window.editFeedItem = function(id) {
  openFeedModal(id);
};

window.deleteFeedItemConfirm = async function(id) {
  if (confirm('Delete this signal?')) {
    await deleteFeedItem(id);
    loadFeed();
  }
};

window.analyzeTicker = function(ticker) {
  document.getElementById('tk').value = ticker;
  if (runCallback) runCallback();
  // Switch to analyze page
  if (window.switchPage) window.switchPage('analyze');
};

window.filterFeed = function(type) {
  // Update active filter button
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase().includes(type) || (type === 'all' && btn.textContent === 'All'));
  });

  // Filter items
  const container = document.getElementById('feedList');
  const items = feedItems || [];

  if (type === 'all') {
    container.innerHTML = items.length ? items.map(item => renderFeedItem(item)).join('') : '<div class="empty-state"><div class="empty-text">No signals yet</div></div>';
  } else {
    const filtered = items.filter(item => item.source_type === type);
    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-text">No ${type}s yet</div></div>`;
    } else {
      container.innerHTML = filtered.map(item => renderFeedItem(item)).join('');
    }
  }
};

// Update stats when feed loads
function updateFeedStats() {
  const items = feedItems || [];
  const total = items.length;
  const raw = items.filter(i => i.status === 'raw').length;
  const bearish = items.filter(i => i.sentiment === 'bearish').length;

  const totalEl = document.getElementById('feedTotal');
  const rawEl = document.getElementById('feedRaw');
  const bearishEl = document.getElementById('feedBearish');

  if (totalEl) totalEl.textContent = total;
  if (rawEl) rawEl.textContent = raw;
  if (bearishEl) bearishEl.textContent = bearish;
}
