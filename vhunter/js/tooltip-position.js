// Unified Tooltip Positioning System
// Industry-standard approach: portal + dynamic positioning + edge detection

const TOOLTIP_CONFIG = {
  offset: 8,
  viewportPadding: 8,
  selectors: {
    triggers: [
      '.teaching-tooltip',
      '.opt-stat',
      '.macro-tooltip',
      '[data-tooltip-trigger]'
    ],
    popups: [
      '.tip-popup',
      '.tooltip-content',
      '.tooltip'
    ]
  }
};

let portal = null;
let activeTooltip = null;
let activeTrigger = null;

/**
 * Initialize the tooltip positioning system
 */
export function initTooltipPositioning() {
  createPortal();
  attachEventListeners();
}

/**
 * Create portal container for tooltips
 */
function createPortal() {
  if (portal) return;

  portal = document.createElement('div');
  portal.id = 'tooltip-portal';
  portal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 0;
    overflow: visible;
    pointer-events: none;
    z-index: 99999;
  `;
  document.body.appendChild(portal);
}

/**
 * Attach global event listeners
 */
function attachEventListeners() {
  // Use event delegation for efficiency
  document.addEventListener('mouseenter', handleMouseEnter, true);
  document.addEventListener('mouseleave', handleMouseLeave, true);
  document.addEventListener('scroll', handleScroll, true);
  window.addEventListener('resize', handleResize);
}

/**
 * Handle mouse enter on potential tooltip triggers
 */
function handleMouseEnter(e) {
  const target = e.target;
  if (!target || !target.closest) return;

  // Find trigger element
  const trigger = findTrigger(target);
  if (!trigger) return;

  // Find popup element within trigger
  const popup = findPopup(trigger);
  if (!popup) return;

  showTooltip(trigger, popup);
}

/**
 * Handle mouse leave
 */
function handleMouseLeave(e) {
  const target = e.target;
  if (!target || !target.closest) return;

  const trigger = findTrigger(target);
  if (!trigger) return;

  // Check if we're moving to the tooltip itself (for interactive tooltips)
  const relatedTarget = e.relatedTarget;
  if (relatedTarget && activeTooltip && activeTooltip.contains(relatedTarget)) {
    return;
  }

  hideTooltip();
}

/**
 * Handle scroll - reposition or hide tooltip
 */
function handleScroll() {
  if (activeTooltip && activeTrigger) {
    positionTooltip(activeTrigger, activeTooltip);
  }
}

/**
 * Handle resize - reposition tooltip
 */
function handleResize() {
  if (activeTooltip && activeTrigger) {
    positionTooltip(activeTrigger, activeTooltip);
  }
}

/**
 * Find tooltip trigger from event target
 */
function findTrigger(target) {
  for (const selector of TOOLTIP_CONFIG.selectors.triggers) {
    const trigger = target.closest(selector);
    if (trigger) return trigger;
  }
  return null;
}

/**
 * Find popup element within trigger
 */
function findPopup(trigger) {
  for (const selector of TOOLTIP_CONFIG.selectors.popups) {
    const popup = trigger.querySelector(selector);
    if (popup) return popup;
  }
  return null;
}

/**
 * Show tooltip with proper positioning
 */
function showTooltip(trigger, popup) {
  // Hide any existing tooltip
  hideTooltip();

  // Clone popup to portal
  const clone = popup.cloneNode(true);

  const padding = TOOLTIP_CONFIG.viewportPadding;
  const maxWidth = window.innerWidth - (padding * 2);

  // First, reset all positioning - let CSS handle horizontal positioning
  clone.setAttribute('style', `
    position: fixed !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    top: 0 !important;
    bottom: auto !important;
    transition: opacity 0.15s ease, visibility 0.15s ease !important;
    box-sizing: border-box !important;
    z-index: 99999 !important;
  `);

  portal.appendChild(clone);

  // Force reflow to get accurate dimensions
  clone.offsetHeight;

  // Position tooltip
  positionTooltip(trigger, clone);

  // Show tooltip
  requestAnimationFrame(() => {
    clone.style.setProperty('visibility', 'visible', 'important');
    clone.style.setProperty('opacity', '1', 'important');
    clone.style.setProperty('pointer-events', 'auto', 'important');
  });

  activeTooltip = clone;
  activeTrigger = trigger;

  // Hide original popup by adding class (CSS :hover won't override)
  popup.classList.add('tooltip-hidden');
  trigger.classList.add('tooltip-active');
}

/**
 * Hide active tooltip
 */
function hideTooltip() {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }

  if (activeTrigger) {
    // Restore original popup visibility
    const popup = findPopup(activeTrigger);
    if (popup) {
      popup.classList.remove('tooltip-hidden');
    }
    activeTrigger.classList.remove('tooltip-active');
    activeTrigger = null;
  }
}

/**
 * Calculate and apply optimal tooltip position
 */
function positionTooltip(trigger, tooltip) {
  const triggerRect = trigger.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  };

  const padding = TOOLTIP_CONFIG.viewportPadding;
  const offset = TOOLTIP_CONFIG.offset;

  // Calculate available space in each direction
  const space = {
    top: triggerRect.top - padding,
    bottom: viewport.height - triggerRect.bottom - padding
  };

  // Determine best vertical position (prefer bottom)
  let verticalPosition = 'bottom';
  let top;

  if (space.bottom >= tooltipRect.height + offset) {
    // Fits below
    verticalPosition = 'bottom';
    top = triggerRect.bottom + offset;
  } else if (space.top >= tooltipRect.height + offset) {
    // Fits above
    verticalPosition = 'top';
    top = triggerRect.top - tooltipRect.height - offset;
  } else {
    // Neither fits well, use the one with more space
    if (space.bottom >= space.top) {
      verticalPosition = 'bottom';
      top = triggerRect.bottom + offset;
    } else {
      verticalPosition = 'top';
      top = triggerRect.top - tooltipRect.height - offset;
    }
  }

  // Clamp vertical position to viewport
  top = Math.max(padding, Math.min(viewport.height - tooltipRect.height - padding, top));

  // Calculate horizontal position - center on trigger, clamp to viewport
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;
  let left = triggerCenterX - tooltipRect.width / 2;

  // Clamp to viewport bounds
  const minLeft = padding;
  const maxLeft = viewport.width - tooltipRect.width - padding;
  left = Math.max(minLeft, Math.min(maxLeft, left));

  // Apply position - only set top, let CSS handle horizontal centering
  tooltip.style.setProperty('top', `${top}px`, 'important');

  // On mobile, let CSS handle centering. On desktop, position normally.
  const isMobile = window.innerWidth <= 768;
  if (!isMobile) {
    tooltip.style.setProperty('left', `${left}px`, 'important');
    tooltip.style.setProperty('transform', 'none', 'important');
  }
  // On mobile, CSS will center with left:50% + translateX(-50%)

  // Calculate arrow position - how far from tooltip left edge is the trigger center
  const arrowLeft = triggerCenterX - left;

  // Update arrow position
  updateArrow(tooltip, verticalPosition, arrowLeft, tooltipRect.width);
}

/**
 * Update arrow position and direction
 */
function updateArrow(tooltip, position, arrowLeft, tooltipWidth) {
  // Clamp arrow position within tooltip bounds (with 16px minimum from edges)
  const clampedArrowLeft = Math.max(16, Math.min(tooltipWidth - 16, arrowLeft));

  // Apply via CSS custom property
  tooltip.style.setProperty('--arrow-left', `${clampedArrowLeft}px`);

  // Set data attribute and class for CSS styling
  tooltip.setAttribute('data-position', position);
  tooltip.classList.remove('arrow-top', 'arrow-bottom');
  tooltip.classList.add(position === 'top' ? 'arrow-top' : 'arrow-bottom');
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTooltipPositioning);
} else {
  initTooltipPositioning();
}
