// VHunter Tooltip System
// Auto-positioning tooltips with edge detection

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  offset: 8,           // Gap between trigger and tooltip
  arrowSize: 6,        // Arrow border size (matches CSS)
  padding: 8,          // Viewport edge padding
  showDelay: 100,      // Delay before showing (ms)
  hideDelay: 100,      // Delay before hiding (ms)
  defaultPosition: 'bottom'
};

// ============================================
// POSITION CALCULATOR
// ============================================

/**
 * Calculate the best position for a tooltip based on available space
 * @param {DOMRect} triggerRect - Bounding rect of trigger element
 * @param {DOMRect} tooltipRect - Bounding rect of tooltip element
 * @param {string} preferredPosition - Preferred position (top, bottom, left, right)
 * @returns {Object} Position data { position, x, y, arrowX, arrowY }
 */
function calculatePosition(triggerRect, tooltipRect, preferredPosition = CONFIG.defaultPosition) {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY
  };

  const space = {
    top: triggerRect.top,
    bottom: viewport.height - triggerRect.bottom,
    left: triggerRect.left,
    right: viewport.width - triggerRect.right
  };

  const needed = {
    vertical: tooltipRect.height + CONFIG.offset + CONFIG.padding,
    horizontal: tooltipRect.width + CONFIG.offset + CONFIG.padding
  };

  // Determine best position
  let position = preferredPosition;

  // Check if preferred position fits, otherwise find best alternative
  const fits = {
    top: space.top >= needed.vertical,
    bottom: space.bottom >= needed.vertical,
    left: space.left >= needed.horizontal,
    right: space.right >= needed.horizontal
  };

  if (!fits[position]) {
    // Try opposite first
    const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    if (fits[opposite[position]]) {
      position = opposite[position];
    } else {
      // Find position with most space
      const sortedPositions = Object.entries(space)
        .sort(([, a], [, b]) => b - a)
        .map(([pos]) => pos);

      for (const pos of sortedPositions) {
        if (fits[pos]) {
          position = pos;
          break;
        }
      }
    }
  }

  // Calculate coordinates
  let x, y;
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;
  const triggerCenterY = triggerRect.top + triggerRect.height / 2;

  switch (position) {
    case 'top':
      x = triggerCenterX - tooltipRect.width / 2;
      y = triggerRect.top - tooltipRect.height - CONFIG.offset;
      break;
    case 'bottom':
      x = triggerCenterX - tooltipRect.width / 2;
      y = triggerRect.bottom + CONFIG.offset;
      break;
    case 'left':
      x = triggerRect.left - tooltipRect.width - CONFIG.offset;
      y = triggerCenterY - tooltipRect.height / 2;
      break;
    case 'right':
      x = triggerRect.right + CONFIG.offset;
      y = triggerCenterY - tooltipRect.height / 2;
      break;
  }

  // Clamp to viewport bounds
  const minX = CONFIG.padding;
  const maxX = viewport.width - tooltipRect.width - CONFIG.padding;
  const minY = CONFIG.padding;
  const maxY = viewport.height - tooltipRect.height - CONFIG.padding;

  const clampedX = Math.max(minX, Math.min(maxX, x));
  const clampedY = Math.max(minY, Math.min(maxY, y));

  // Calculate arrow offset (how much tooltip shifted from center)
  let arrowOffset = 0;
  if (position === 'top' || position === 'bottom') {
    arrowOffset = x - clampedX;
  } else {
    arrowOffset = y - clampedY;
  }

  return {
    position,
    x: clampedX,
    y: clampedY,
    arrowOffset // Positive = arrow should shift right/down
  };
}

// ============================================
// TOOLTIP MANAGER
// ============================================

class TooltipManager {
  constructor() {
    this.activeTooltips = new Map();
    this.showTimeouts = new Map();
    this.hideTimeouts = new Map();
    this.portal = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;

    // Create portal for fixed tooltips
    this.portal = document.createElement('div');
    this.portal.id = 'tooltip-portal';
    this.portal.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 9999; pointer-events: none;';
    document.body.appendChild(this.portal);

    // Auto-attach to [data-tooltip-auto] elements
    this.attachAutoTooltips();

    // Listen for dynamically added elements
    this.observeDOM();

    this.initialized = true;
  }

  /**
   * Attach tooltips to elements with data-tooltip-auto attribute
   */
  attachAutoTooltips() {
    document.querySelectorAll('[data-tooltip-auto]').forEach(el => {
      if (!el._tooltipAttached) {
        this.attach(el);
        el._tooltipAttached = true;
      }
    });
  }

  /**
   * Observe DOM for new tooltip elements
   */
  observeDOM() {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            if (node.hasAttribute && node.hasAttribute('data-tooltip-auto')) {
              this.attach(node);
              node._tooltipAttached = true;
            }
            node.querySelectorAll?.('[data-tooltip-auto]').forEach(el => {
              if (!el._tooltipAttached) {
                this.attach(el);
                el._tooltipAttached = true;
              }
            });
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Attach tooltip behavior to an element
   * @param {HTMLElement} trigger - Element to attach tooltip to
   * @param {Object} options - Tooltip options
   */
  attach(trigger, options = {}) {
    const config = {
      content: options.content || trigger.getAttribute('data-tooltip-content') || trigger.title,
      position: options.position || trigger.getAttribute('data-tooltip-position') || CONFIG.defaultPosition,
      variant: options.variant || trigger.getAttribute('data-tooltip-variant') || '',
      size: options.size || trigger.getAttribute('data-tooltip-size') || '',
      showDelay: options.showDelay ?? CONFIG.showDelay,
      hideDelay: options.hideDelay ?? CONFIG.hideDelay,
      interactive: options.interactive ?? trigger.hasAttribute('data-tooltip-interactive'),
      fixed: options.fixed ?? trigger.hasAttribute('data-tooltip-fixed')
    };

    // Remove native title to prevent double tooltip
    if (trigger.title) {
      trigger.setAttribute('data-original-title', trigger.title);
      trigger.removeAttribute('title');
    }

    const showHandler = () => this.scheduleShow(trigger, config);
    const hideHandler = () => this.scheduleHide(trigger);

    trigger.addEventListener('mouseenter', showHandler);
    trigger.addEventListener('mouseleave', hideHandler);
    trigger.addEventListener('focus', showHandler);
    trigger.addEventListener('blur', hideHandler);

    // Store handlers for cleanup
    trigger._tooltipHandlers = { show: showHandler, hide: hideHandler };
    trigger._tooltipConfig = config;
  }

  /**
   * Detach tooltip from element
   * @param {HTMLElement} trigger - Element to detach from
   */
  detach(trigger) {
    if (trigger._tooltipHandlers) {
      trigger.removeEventListener('mouseenter', trigger._tooltipHandlers.show);
      trigger.removeEventListener('mouseleave', trigger._tooltipHandlers.hide);
      trigger.removeEventListener('focus', trigger._tooltipHandlers.show);
      trigger.removeEventListener('blur', trigger._tooltipHandlers.hide);
      delete trigger._tooltipHandlers;
      delete trigger._tooltipConfig;
      trigger._tooltipAttached = false;
    }

    // Restore original title
    if (trigger.hasAttribute('data-original-title')) {
      trigger.title = trigger.getAttribute('data-original-title');
      trigger.removeAttribute('data-original-title');
    }

    this.hide(trigger);
  }

  /**
   * Schedule showing a tooltip
   */
  scheduleShow(trigger, config) {
    this.clearTimeout(trigger, 'hide');

    const timeout = setTimeout(() => {
      this.show(trigger, config);
    }, config.showDelay);

    this.showTimeouts.set(trigger, timeout);
  }

  /**
   * Schedule hiding a tooltip
   */
  scheduleHide(trigger) {
    this.clearTimeout(trigger, 'show');

    const config = trigger._tooltipConfig || {};
    const timeout = setTimeout(() => {
      this.hide(trigger);
    }, config.hideDelay ?? CONFIG.hideDelay);

    this.hideTimeouts.set(trigger, timeout);
  }

  /**
   * Clear scheduled timeout
   */
  clearTimeout(trigger, type) {
    const map = type === 'show' ? this.showTimeouts : this.hideTimeouts;
    const timeout = map.get(trigger);
    if (timeout) {
      clearTimeout(timeout);
      map.delete(trigger);
    }
  }

  /**
   * Show tooltip for element
   */
  show(trigger, config) {
    // Hide any existing tooltip for this trigger
    this.hide(trigger);

    const tooltip = this.createTooltipElement(config);

    if (config.fixed) {
      // Use portal for fixed positioning
      this.portal.appendChild(tooltip);
      tooltip.classList.add('tooltip-fixed');
    } else {
      // Use relative positioning within trigger
      trigger.appendChild(tooltip);
    }

    // Force layout calculation
    tooltip.offsetHeight;

    if (config.fixed) {
      // Calculate and apply position
      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const pos = calculatePosition(triggerRect, tooltipRect, config.position);

      tooltip.style.left = `${pos.x}px`;
      tooltip.style.top = `${pos.y}px`;
      tooltip.setAttribute('data-position', pos.position);

      // Adjust arrow position if tooltip was clamped
      if (pos.arrowOffset !== 0) {
        const arrowShift = -pos.arrowOffset;
        tooltip.style.setProperty('--arrow-offset', `${arrowShift}px`);
        const arrow = tooltip.querySelector('::before') || tooltip;
        if (pos.position === 'top' || pos.position === 'bottom') {
          tooltip.style.setProperty('--arrow-left', `calc(50% + ${arrowShift}px)`);
        }
      }
    } else {
      // Apply CSS class for position
      tooltip.classList.add(`tooltip-${config.position}`);
    }

    // Activate tooltip
    requestAnimationFrame(() => {
      tooltip.classList.add('active');
    });

    this.activeTooltips.set(trigger, tooltip);

    // For interactive tooltips, keep visible when hovering tooltip
    if (config.interactive) {
      tooltip.style.pointerEvents = 'auto';
      tooltip.addEventListener('mouseenter', () => this.clearTimeout(trigger, 'hide'));
      tooltip.addEventListener('mouseleave', () => this.scheduleHide(trigger));
    }
  }

  /**
   * Hide tooltip for element
   */
  hide(trigger) {
    const tooltip = this.activeTooltips.get(trigger);
    if (tooltip) {
      tooltip.classList.remove('active');
      setTimeout(() => {
        tooltip.remove();
      }, 150); // Match CSS transition
      this.activeTooltips.delete(trigger);
    }
  }

  /**
   * Create tooltip DOM element
   */
  createTooltipElement(config) {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';

    if (config.variant) tooltip.classList.add(`tooltip-${config.variant}`);
    if (config.size) tooltip.classList.add(`tooltip-${config.size}`);

    // Parse content - can be HTML string or plain text
    if (typeof config.content === 'string') {
      if (config.content.includes('<')) {
        tooltip.innerHTML = config.content;
      } else {
        tooltip.textContent = config.content;
      }
    } else if (config.content instanceof HTMLElement) {
      tooltip.appendChild(config.content.cloneNode(true));
    }

    return tooltip;
  }

  /**
   * Update tooltip content dynamically
   */
  updateContent(trigger, content) {
    const tooltip = this.activeTooltips.get(trigger);
    if (tooltip) {
      if (typeof content === 'string') {
        if (content.includes('<')) {
          tooltip.innerHTML = content;
        } else {
          tooltip.textContent = content;
        }
      }
    }

    // Also update config for future shows
    if (trigger._tooltipConfig) {
      trigger._tooltipConfig.content = content;
    }
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

const tooltipManager = new TooltipManager();

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a tooltip trigger icon
 * @param {string} content - Tooltip content
 * @param {Object} options - Options (position, variant, size, icon)
 * @returns {string} HTML string
 */
export function createTooltipIcon(content, options = {}) {
  const {
    position = 'bottom',
    variant = '',
    size = 'sm',
    icon = '?',
    interactive = false
  } = options;

  const attrs = [
    `data-tooltip-auto`,
    `data-tooltip-content="${escapeHtml(content)}"`,
    `data-tooltip-position="${position}"`,
    variant ? `data-tooltip-variant="${variant}"` : '',
    size ? `data-tooltip-size="${size}"` : '',
    interactive ? 'data-tooltip-interactive' : '',
    'data-tooltip-fixed'
  ].filter(Boolean).join(' ');

  return `<span class="tooltip-trigger tooltip-trigger-${size}" ${attrs}>${icon}</span>`;
}

/**
 * Create inline tooltip wrapper
 * @param {string} text - Visible text
 * @param {string} tooltipContent - Tooltip content
 * @param {Object} options - Options
 * @returns {string} HTML string
 */
export function createInlineTooltip(text, tooltipContent, options = {}) {
  const {
    position = 'top',
    variant = '',
    tag = 'span'
  } = options;

  return `<${tag} data-tooltip-auto data-tooltip-content="${escapeHtml(tooltipContent)}" data-tooltip-position="${position}" ${variant ? `data-tooltip-variant="${variant}"` : ''} data-tooltip-fixed style="border-bottom: 1px dotted currentColor; cursor: help;">${text}</${tag}>`;
}

/**
 * Programmatically show tooltip
 */
export function showTooltip(trigger, content, options = {}) {
  const config = {
    content,
    position: options.position || CONFIG.defaultPosition,
    variant: options.variant || '',
    size: options.size || '',
    interactive: options.interactive || false,
    fixed: true
  };

  tooltipManager.show(trigger, config);
}

/**
 * Programmatically hide tooltip
 */
export function hideTooltip(trigger) {
  tooltipManager.hide(trigger);
}

/**
 * Escape HTML for safe attribute insertion
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================
// AUTO-INIT
// ============================================

export function initTooltips() {
  tooltipManager.init();
}

// ============================================
// EXPORTS
// ============================================

export {
  tooltipManager,
  calculatePosition,
  CONFIG as TOOLTIP_CONFIG
};
