/**
 * @fileoverview Base agent class
 * Unix philosophy: Common interface, specific implementations
 */

/**
 * Base agent class - all agents extend this
 */
export class Agent {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this.initialized = false;
    this.metrics = {
      runs: 0,
      successes: 0,
      failures: 0,
      avgLatency: 0
    };
  }

  /**
   * Initialize the agent (override in subclass)
   */
  async initialize(context) {
    this.context = context;
    this.initialized = true;
  }

  /**
   * Process input (must be implemented by subclass)
   * @param {any} input - Input data
   * @returns {Promise<any>} - Output
   */
  async process(input) {
    throw new Error('process() must be implemented');
  }

  /**
   * Run with metrics tracking
   * @param {any} input - Input data
   * @returns {Promise<any>} - Output
   */
  async run(input) {
    const start = Date.now();
    this.metrics.runs++;

    try {
      const result = await this.process(input);
      this.metrics.successes++;
      this._updateLatency(Date.now() - start);
      return result;
    } catch (error) {
      this.metrics.failures++;
      this._updateLatency(Date.now() - start);
      throw error;
    }
  }

  /**
   * Update average latency
   */
  _updateLatency(latency) {
    const n = this.metrics.runs;
    this.metrics.avgLatency = ((this.metrics.avgLatency * (n - 1)) + latency) / n;
  }

  /**
   * Get agent metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.runs > 0
        ? this.metrics.successes / this.metrics.runs
        : 0
    };
  }

  /**
   * Cleanup (override if needed)
   */
  async cleanup() {
    this.initialized = false;
  }
}

/**
 * Create a simple agent from a function
 * @param {string} name - Agent name
 * @param {Function} fn - Process function
 * @returns {Agent} - Agent instance
 */
export function createAgent(name, fn) {
  const agent = new Agent(name, '');
  agent.process = fn;
  return agent;
}

export default Agent;
