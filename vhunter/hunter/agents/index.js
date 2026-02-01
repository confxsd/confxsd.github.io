/**
 * @fileoverview Agent exports
 * Unix philosophy: Simple composition
 */

export { default as Agent } from './base.js';
export { default as macroAgent } from './macro.js';
export { default as opportunityAgent } from './opportunity.js';
export { default as analystAgent } from './analyst.js';
export { default as traderAgent } from './trader.js';

export const agents = {
  macro: () => import('./macro.js').then(m => m.default),
  opportunity: () => import('./opportunity.js').then(m => m.default),
  analyst: () => import('./analyst.js').then(m => m.default),
  trader: () => import('./trader.js').then(m => m.default)
};

export default agents;
