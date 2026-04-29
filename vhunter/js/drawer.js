// Common right-side drawer module.
// Shared across pages (memory, daily-checker, etc.).
// API:
//   openDrawer({ id, title, subtitle, content, width, panelClass, onClose })
//   closeDrawer(id)
//   isDrawerOpen(id)
//
// - `id` is the unique key for an open drawer. Re-opening with the same id
//   replaces its content rather than stacking.
// - `content` may be a string of HTML or a DOM Node.
// - Outside-click on the overlay and ESC key both close the top drawer.

const drawers = new Map(); // id -> { overlay, panel, contentEl, onClose }
let escBound = false;

function setContent(el, content) {
  if (content == null) {
    el.innerHTML = '';
  } else if (typeof content === 'string') {
    el.innerHTML = content;
  } else {
    el.innerHTML = '';
    el.appendChild(content);
  }
}

function onEsc(e) {
  if (e.key !== 'Escape' || drawers.size === 0) return;
  const ids = Array.from(drawers.keys());
  closeDrawer(ids[ids.length - 1]);
}

export function openDrawer({
  id,
  title = '',
  subtitle = '',
  content = '',
  width,
  panelClass = '',
  onClose
} = {}) {
  if (!id) throw new Error('openDrawer: id is required');

  // Replace existing drawer with same id
  if (drawers.has(id)) {
    const d = drawers.get(id);
    d.titleEl.innerHTML = title;
    d.subtitleEl.innerHTML = subtitle;
    setContent(d.contentEl, content);
    d.onClose = onClose;
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.dataset.drawerId = id;
  overlay.addEventListener('click', () => closeDrawer(id));

  const panel = document.createElement('div');
  panel.className = 'drawer-panel' + (panelClass ? ' ' + panelClass : '');
  panel.dataset.drawerId = id;
  if (width) panel.style.width = width;

  panel.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-title-wrap">
        <div class="drawer-title"></div>
        <div class="drawer-subtitle"></div>
      </div>
      <button class="drawer-close" type="button" aria-label="Close">×</button>
    </div>
    <div class="drawer-content"></div>
  `;

  const titleEl = panel.querySelector('.drawer-title');
  const subtitleEl = panel.querySelector('.drawer-subtitle');
  const contentEl = panel.querySelector('.drawer-content');
  const closeBtn = panel.querySelector('.drawer-close');

  titleEl.innerHTML = title;
  subtitleEl.innerHTML = subtitle;
  setContent(contentEl, content);
  closeBtn.addEventListener('click', () => closeDrawer(id));

  document.body.appendChild(overlay);
  document.body.appendChild(panel);

  drawers.set(id, { overlay, panel, titleEl, subtitleEl, contentEl, onClose });

  if (!escBound) {
    document.addEventListener('keydown', onEsc);
    escBound = true;
  }

  // Trigger transition on next frame
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    panel.classList.add('active');
  });
}

export function closeDrawer(id) {
  const d = drawers.get(id);
  if (!d) return;
  d.overlay.classList.remove('active');
  d.panel.classList.remove('active');
  drawers.delete(id);

  setTimeout(() => {
    d.overlay.remove();
    d.panel.remove();
  }, 300);

  if (drawers.size === 0 && escBound) {
    document.removeEventListener('keydown', onEsc);
    escBound = false;
  }

  if (typeof d.onClose === 'function') {
    try { d.onClose(); } catch (e) { console.error('drawer onClose error', e); }
  }
}

export function isDrawerOpen(id) {
  return drawers.has(id);
}

// Expose for inline onclick handlers
window.closeDrawer = closeDrawer;
