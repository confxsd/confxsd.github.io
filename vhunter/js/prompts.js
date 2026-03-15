// AI Prompts Module (Legacy - re-exports from prompts/)
// For backward compatibility, this file re-exports from the modular prompts folder
//
// New code should import directly from './prompts/index.js':
//   import { buildCombinedPrompt, buildSummaryPrompt } from './prompts/index.js';

export {
  // Main prompt builders
  buildCombinedPrompt,
  buildAnalysisPrompt,
  buildTradePrompt,
  buildSummaryPrompt,

  // Context builders
  buildVRPContext,
  buildGEXContext,
  buildMacroContext,

  // System roles
  COMBINED_SYSTEM_ROLE,
  SUMMARY_SYSTEM_ROLE,

  // Factory and utilities
  PromptFactory,
  composePrompt,
  builders
} from './prompts/index.js';
