// VHunter Prompts Module
// Central export for all AI prompts
//
// Usage:
//   import { buildCombinedPrompt, buildSummaryPrompt } from './prompts/index.js';
//   import * as prompts from './prompts/index.js';
//   import { builders } from './prompts/index.js';

// Main prompt builders
export { buildCombinedPrompt, buildAnalysisPrompt, buildTradePrompt, COMBINED_SYSTEM_ROLE } from './combined.js';
export { buildSummaryPrompt, SUMMARY_SYSTEM_ROLE } from './summary.js';

// Context builders (for custom prompt composition)
export { buildVRPContext, getVRPSignal, getIVRankSignal, getTermStructureSignal } from './builders/vrp.js';
export { buildGEXContext, getRegimeAnalysis, formatGEX } from './builders/gex.js';
export { buildMacroContext, buildMacroContextWithThesis, getDefaultThesis } from './builders/macro.js';

// Grouped exports for namespaced access
import * as vrpBuilders from './builders/vrp.js';
import * as gexBuilders from './builders/gex.js';
import * as macroBuilders from './builders/macro.js';

export const builders = {
  vrp: vrpBuilders,
  gex: gexBuilders,
  macro: macroBuilders
};

/**
 * Prompt factory for dynamic prompt generation
 *
 * @example
 * const prompt = PromptFactory.create('combined', marketData);
 */
export const PromptFactory = {
  /**
   * Create a prompt by type
   * @param {'combined' | 'summary' | 'analysis' | 'trade'} type - Prompt type
   * @param {Object} data - Data to pass to prompt builder
   * @returns {string} Generated prompt
   */
  create(type, data) {
    const builders = {
      combined: () => import('./combined.js').then(m => m.buildCombinedPrompt(data)),
      analysis: () => import('./combined.js').then(m => m.buildAnalysisPrompt(data)),
      trade: () => import('./combined.js').then(m => m.buildTradePrompt(data)),
      summary: () => import('./summary.js').then(m => m.buildSummaryPrompt(data))
    };

    const builder = builders[type];
    if (!builder) {
      throw new Error(`Unknown prompt type: ${type}. Valid types: ${Object.keys(builders).join(', ')}`);
    }

    return builder();
  },

  /**
   * Create a prompt synchronously (requires modules to be pre-imported)
   */
  createSync(type, data) {
    const { buildCombinedPrompt } = require('./combined.js');
    const { buildSummaryPrompt } = require('./summary.js');

    const builders = {
      combined: buildCombinedPrompt,
      analysis: buildCombinedPrompt,
      trade: buildCombinedPrompt,
      summary: buildSummaryPrompt
    };

    const builder = builders[type];
    if (!builder) {
      throw new Error(`Unknown prompt type: ${type}`);
    }

    return builder(data);
  },

  /**
   * Get available prompt types
   */
  getTypes() {
    return ['combined', 'summary', 'analysis', 'trade'];
  }
};

/**
 * Compose a custom prompt with selected contexts
 *
 * @example
 * const prompt = composePrompt({
 *   systemRole: 'You are a vol trader',
 *   contexts: ['macro', 'vrp', 'gex'],
 *   data: marketData,
 *   customContent: 'Additional instructions...',
 *   outputFormat: '**SIGNAL:** ...'
 * });
 */
export function composePrompt({ systemRole, contexts = [], data = {}, customContent = '', outputFormat = '' }) {
  const contextBuilders = {
    macro: () => macroBuilders.buildMacroContext(),
    vrp: () => vrpBuilders.buildVRPContext(data),
    gex: () => gexBuilders.buildGEXContext(data)
  };

  const contextParts = contexts
    .map(ctx => contextBuilders[ctx]?.())
    .filter(Boolean);

  const parts = [
    systemRole,
    ...contextParts,
    customContent,
    outputFormat
  ].filter(Boolean);

  return parts.join('\n\n---\n\n');
}
