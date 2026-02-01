/**
 * @fileoverview Provider exports
 * Unix philosophy: Simple composition
 */

export { default as polygon } from './polygon.js';
export { default as claude } from './claude.js';

// Unified data provider that routes to the right source
export const data = {
  polygon: null,
  claude: null,

  async init() {
    const polygonMod = await import('./polygon.js');
    const claudeMod = await import('./claude.js');
    this.polygon = polygonMod.default;
    this.claude = claudeMod.default;
    return this;
  },

  // Market data (Polygon)
  getQuote: (...args) => import('./polygon.js').then(m => m.getQuote(...args)),
  getHistory: (...args) => import('./polygon.js').then(m => m.getHistory(...args)),
  getOptionsChain: (...args) => import('./polygon.js').then(m => m.getOptionsChain(...args)),
  getOptionsSnapshot: (...args) => import('./polygon.js').then(m => m.getOptionsSnapshot(...args)),
  getTickerDetails: (...args) => import('./polygon.js').then(m => m.getTickerDetails(...args)),
  getNews: (...args) => import('./polygon.js').then(m => m.getNews(...args)),
  getBatchQuotes: (...args) => import('./polygon.js').then(m => m.getBatchQuotes(...args)),

  // AI (Claude)
  generate: (...args) => import('./claude.js').then(m => m.generate(...args)),
  generateJSON: (...args) => import('./claude.js').then(m => m.generateJSON(...args)),
  reason: (...args) => import('./claude.js').then(m => m.reason(...args))
};

export default data;
