// Macro Context Builder
// Dynamic macro thesis from feed system

import { getCurrentThesis } from '../../feed.js';

/**
 * Default thesis when none is established
 */
const DEFAULT_THESIS = {
  regime: 'neutral',
  bias: 'neutral',
  narrative: 'No thesis established. Using default: Monitor for opportunities.',
  themes: ['awaiting signal'],
  sectors: { ow: [], uw: [] },
  catalysts: [],
  risks: []
};

/**
 * Build macro context string for AI prompts
 * Uses thesis from feed system if available
 * @returns {string} Formatted macro context
 */
export function buildMacroContext() {
  const thesis = getCurrentThesis();

  if (!thesis?.thesis_data) {
    return formatThesis(DEFAULT_THESIS);
  }

  return formatThesis(thesis.thesis_data);
}

/**
 * Build macro context with custom thesis data
 * @param {Object} thesisData - Custom thesis data
 * @returns {string} Formatted macro context
 */
export function buildMacroContextWithThesis(thesisData) {
  return formatThesis(thesisData || DEFAULT_THESIS);
}

/**
 * Format thesis data into context string
 */
function formatThesis(t) {
  const themes = Array.isArray(t.themes) ? t.themes.join(', ') : 'awaiting signal';
  const ow = Array.isArray(t.sectors?.ow) ? t.sectors.ow.join(', ') : '--';
  const uw = Array.isArray(t.sectors?.uw) ? t.sectors.uw.join(', ') : '--';
  const catalysts = Array.isArray(t.catalysts) ? t.catalysts.join(', ') : '--';
  const risks = Array.isArray(t.risks) ? t.risks.join(', ') : '--';

  return `MACRO CONTEXT: ${t.regime} | ${t.bias}
${t.narrative}
Themes: ${themes}
OW: ${ow} | UW: ${uw}
Catalysts: ${catalysts}
Risks: ${risks}`;
}

/**
 * Get the default thesis object
 */
export function getDefaultThesis() {
  return { ...DEFAULT_THESIS };
}
