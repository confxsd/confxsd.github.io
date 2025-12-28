// Feed Module - Signal intelligence from tweets, blogs, charts
import { CONFIG } from './config.js';

let feedItems = [];
let currentThesis = null;
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

export async function getFeedItems(status = null) {
  let query = '/api/feed?limit=100';
  if (status) query += `&status=${status}`;
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

// Extract insights from unprocessed feeds
export async function extractInsights() {
  const btn = document.getElementById('extractBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Extracting...';
  }

  try {
    const result = await feedFetch('/api/feed/extract', { method: 'POST' });
    if (result.processed > 0) {
      showToast(`Extracted ${result.processed} insights`);
      loadFeed();
    } else {
      showToast(result.message || 'No items to process');
    }
  } catch (e) {
    showToast('Extract failed: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Extract';
    }
  }
}

// Update thesis with processed insights
export async function updateThesis() {
  const btn = document.getElementById('updateThesisBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Updating...';
  }

  try {
    const result = await feedFetch('/api/thesis/update', { method: 'POST' });
    if (result.success) {
      showToast(`Thesis v${result.version} updated`);
      loadThesis();
    } else {
      showToast(result.message || 'Update failed');
    }
  } catch (e) {
    showToast('Update failed: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Update Thesis';
    }
  }
}

// Get current thesis
export async function getThesis() {
  return feedFetch('/api/thesis');
}

// Load and render thesis
export async function loadThesis() {
  const card = document.getElementById('thesisCard');
  if (!card) return;

  try {
    const thesis = await getThesis();
    currentThesis = thesis;
    renderThesis(card, thesis);
  } catch (e) {
    card.innerHTML = '<div class="thesis-empty">Failed to load thesis</div>';
  }
}

function renderThesis(card, thesis) {
  if (!thesis || !thesis.thesis_data) {
    card.innerHTML = `
      <div class="thesis-empty">
        <div class="thesis-empty-text">No thesis yet</div>
        <div class="thesis-empty-hint">Extract insights then update thesis</div>
      </div>`;
    return;
  }

  const t = thesis.thesis_data;
  card.innerHTML = `
    <div class="thesis-header">
      <span class="thesis-regime ${t.regime}">${t.regime}</span>
      <span class="thesis-bias ${t.bias}">${t.bias}</span>
      <span class="thesis-version">v${thesis.version} · ${thesis.signals_count} signals</span>
    </div>
    <div class="thesis-narrative">${t.narrative}</div>
    <div class="thesis-row">
      <span class="thesis-label">Themes:</span>
      <span class="thesis-value">${(t.themes || []).join(', ')}</span>
    </div>
    <div class="thesis-row">
      <span class="thesis-label">OW:</span>
      <span class="thesis-value ow">${(t.sectors?.ow || []).join(', ')}</span>
    </div>
    <div class="thesis-row">
      <span class="thesis-label">UW:</span>
      <span class="thesis-value uw">${(t.sectors?.uw || []).join(', ')}</span>
    </div>
    <div class="thesis-row">
      <span class="thesis-label">Catalysts:</span>
      <span class="thesis-value">${(t.catalysts || []).join(', ')}</span>
    </div>
    <div class="thesis-row">
      <span class="thesis-label">Risks:</span>
      <span class="thesis-value risks">${(t.risks || []).join(', ')}</span>
    </div>`;
}

// Get current thesis for use in prompts
export function getCurrentThesis() {
  return currentThesis;
}

// Load and render feed
export async function loadFeed() {
  const container = document.getElementById('feedList');
  if (!container) return;

  container.innerHTML = '<div class="loading">Loading feed...</div>';

  try {
    const response = await getFeedItems();
    feedItems = Array.isArray(response) ? response : (response.results || response.data || []);

    if (!Array.isArray(feedItems)) {
      feedItems = [];
    }

    renderFeed(container);
    updateFeedStats();
    loadThesis();
  } catch (e) {
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

// Rewrite legacy workers.dev URLs to new custom domain
function rewriteImageUrl(url) {
  if (!url) return url;
  return url.replace('https://vhunter-proxy.vhunter.workers.dev/', 'https://api.rome.markets/');
}

function parseJsonField(field) {
  if (!field) return [];
  if (Array.isArray(field)) return field.map(rewriteImageUrl);
  try {
    const parsed = JSON.parse(field);
    return Array.isArray(parsed) ? parsed.map(rewriteImageUrl) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(field) {
  if (!field) return null;
  if (typeof field === 'object') return field;
  try {
    return JSON.parse(field);
  } catch {
    return null;
  }
}

function renderFeedItem(item) {
  if (!item) return '';

  const timeAgo = getTimeAgo(item.created_at);
  const sourceIcon = getSourceIcon(item.source_type);
  const images = parseJsonField(item.image_urls);
  const insight = parseJsonObject(item.insight_data);

  const imageHtml = images.length ? `
    <div class="feed-images-carousel">
      ${images.map(url => `<a href="${url}" target="_blank" class="feed-thumb"><img src="${url}" alt="chart" loading="lazy"></a>`).join('')}
    </div>` : '';

  const insightHtml = insight ? `
    <div class="feed-insight">
      <span class="insight-direction ${insight.direction}">${insight.direction}</span>
      <span class="insight-signal">${insight.signal}</span>
      <span class="insight-theme">${insight.theme}</span>
    </div>` : '';

  return `
    <div class="feed-item ${item.status}" data-id="${item.id}">
      <div class="feed-header">
        <span class="feed-source">${sourceIcon} ${item.author || item.source_type}</span>
        <span class="feed-time">${timeAgo}</span>
        <button class="feed-menu" onclick="toggleFeedMenu('${item.id}')">⋮</button>
      </div>
      <div class="feed-content">${escapeHtml(item.content)}</div>
      ${imageHtml}
      ${insightHtml}
      <div class="feed-meta">
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
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
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
  const images = window.pendingImages && window.pendingImages.length > 0 ? [...window.pendingImages] : null;

  const item = {
    source_type: document.getElementById('feedType').value,
    author: document.getElementById('feedAuthor').value || null,
    content: document.getElementById('feedContent').value,
    url: document.getElementById('feedUrl').value || null,
    image_urls: images
  };

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

// Image optimization settings
const IMAGE_MAX_WIDTH = 1600;
const IMAGE_MAX_HEIGHT = 1200;
const IMAGE_QUALITY = 0.85;

async function optimizeImage(file) {
  // Skip non-image files
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      const originalSize = file.size;

      // Calculate new dimensions maintaining aspect ratio
      if (width > IMAGE_MAX_WIDTH || height > IMAGE_MAX_HEIGHT) {
        const ratio = Math.min(IMAGE_MAX_WIDTH / width, IMAGE_MAX_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob - prefer WebP, fallback to JPEG
      const outputType = 'image/webp';
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const optimizedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
              type: outputType,
              lastModified: Date.now()
            });
            const savedKB = Math.round((originalSize - blob.size) / 1024);
            console.log(`Image optimized: ${Math.round(originalSize / 1024)}KB → ${Math.round(blob.size / 1024)}KB (saved ${savedKB}KB)`);
            resolve(optimizedFile);
          } else {
            resolve(file); // Fallback to original
          }
        },
        outputType,
        IMAGE_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // Fallback to original on error
    };

    img.src = url;
  });
}

export async function handleImageUpload(event) {
  const files = event.target.files;
  if (!files.length) return;

  const preview = document.getElementById('feedImagePreview');
  const saveBtn = document.querySelector('#feedForm button[type="submit"]');
  window.pendingImages = window.pendingImages || [];

  uploading = true;
  if (saveBtn) saveBtn.disabled = true;

  for (const file of files) {
    preview.innerHTML = '<div class="upload-progress">Optimizing & uploading...</div>';

    try {
      const optimizedFile = await optimizeImage(file);
      const result = await uploadImage(optimizedFile);
      if (result.error) {
        alert('Upload error: ' + result.error);
      } else if (result.url) {
        window.pendingImages.push(result.url);
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
window.extractInsights = extractInsights;
window.updateThesis = updateThesis;

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
  if (window.switchPage) window.switchPage('analyze');
};

window.filterFeed = function(type) {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase().includes(type) || (type === 'all' && btn.textContent === 'All'));
  });

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
  const processed = items.filter(i => i.status === 'processed').length;

  const totalEl = document.getElementById('feedTotal');
  const rawEl = document.getElementById('feedRaw');
  const processedEl = document.getElementById('feedProcessed');

  if (totalEl) totalEl.textContent = total;
  if (rawEl) rawEl.textContent = raw;
  if (processedEl) processedEl.textContent = processed;
}
