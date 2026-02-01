/**
 * @fileoverview Claude AI provider for reasoning
 * Unix philosophy: One provider, one purpose
 */

import config from '../config.js';

const PROXY = config.endpoints.proxy;

/**
 * Generate structured output from Claude
 * @param {string} prompt - The prompt
 * @param {string} systemPrompt - System instructions
 * @returns {Promise<string>} - Generated text
 */
export async function generate(prompt, systemPrompt = '') {
  const res = await fetch(`${PROXY}/claude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) throw new Error(`Claude: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

/**
 * Generate with JSON output
 * @param {string} prompt - The prompt
 * @param {string} systemPrompt - System instructions
 * @returns {Promise<Object>} - Parsed JSON
 */
export async function generateJSON(prompt, systemPrompt = '') {
  const fullSystem = `${systemPrompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no explanations.`;
  const text = await generate(prompt, fullSystem);

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON in response');

  return JSON.parse(jsonMatch[0]);
}

/**
 * Analyze with reasoning chain
 * @param {string} problem - Problem to analyze
 * @param {Object} context - Additional context
 * @returns {Promise<Object>} - Analysis with reasoning
 */
export async function reason(problem, context = {}) {
  const systemPrompt = `You are an elite quantitative trader and market analyst.
Think step by step. Be contrarian. Focus on asymmetric opportunities.
Context: ${JSON.stringify(context)}`;

  const prompt = `Analyze this:

${problem}

Provide your analysis as JSON:
{
  "reasoning": ["step 1", "step 2", ...],
  "conclusion": "main insight",
  "confidence": 0.0-1.0,
  "risks": ["risk 1", "risk 2"],
  "opportunities": ["opp 1", "opp 2"]
}`;

  return generateJSON(prompt, systemPrompt);
}

/**
 * Score an opportunity
 * @param {Object} opportunity - The opportunity to score
 * @returns {Promise<Object>} - Scores
 */
export async function scoreOpportunity(opportunity) {
  const systemPrompt = `You are a quantitative analyst scoring trade opportunities.
Score each dimension 1-10. Be critical and realistic.`;

  const prompt = `Score this opportunity:

${JSON.stringify(opportunity, null, 2)}

Return JSON:
{
  "edge_score": 1-10,
  "timing_score": 1-10,
  "asymmetry_score": 1-10,
  "conviction": "low|medium|high|max",
  "reasoning": "brief explanation"
}`;

  return generateJSON(prompt, systemPrompt);
}

/**
 * Generate macro thesis
 * @param {Object} data - Market data for analysis
 * @returns {Promise<Object>} - Macro report
 */
export async function generateMacroThesis(data) {
  const availableThemes = data.availableThemes || [];

  const systemPrompt = `You are a macro strategist synthesizing market signals.
Be contrarian. Identify what the crowd is missing.
Focus on regime changes and inflection points.

IMPORTANT: When identifying themes, use these exact theme names when applicable:
${availableThemes.join(', ')}

This allows the system to auto-expand themes into specific tickers.`;

  const prompt = `Generate a macro thesis from this data:

${JSON.stringify({ ...data, availableThemes: undefined }, null, 2)}

Return JSON:
{
  "regime": "risk-on|risk-off|transition",
  "themes": [
    {
      "name": "use exact theme name like: ai_infrastructure, rates_sensitive, etc.",
      "description": "brief description",
      "conviction": 1-10,
      "timeframe": "days|weeks|months",
      "affected_sectors": ["sector1"],
      "catalysts": ["catalyst1"]
    }
  ],
  "risk_signals": [
    {
      "type": "geopolitical|financial|liquidity|sentiment",
      "severity": "low|medium|high|critical",
      "description": "signal description"
    }
  ],
  "contrarian_view": "what is the crowd missing?"
}`;

  return generateJSON(prompt, systemPrompt);
}

/**
 * Construct trade from opportunity
 * @param {Object} opportunity - Enriched opportunity
 * @param {Object} optionsData - Available options
 * @returns {Promise<Object>} - Trade recommendation
 */
export async function constructTrade(opportunity, optionsData) {
  const systemPrompt = `You are an options strategist constructing asymmetric trades.
Prioritize: limited downside, unlimited upside.
Always define entry, stop-loss, and take-profit.
Size conservatively using Kelly criterion principles.`;

  const prompt = `Construct an optimal trade for:

Opportunity:
${JSON.stringify(opportunity, null, 2)}

Available Options:
${JSON.stringify(optionsData, null, 2)}

Return JSON:
{
  "instrument": {
    "type": "stock|call|put|spread|straddle",
    "description": "e.g. Feb 150/160 Call Spread",
    "legs": [{"action": "buy|sell", "strike": 150, "expiry": "2025-02-21", "type": "call"}]
  },
  "asymmetry": {
    "max_loss": 1000,
    "expected_gain": 3000,
    "potential_gain": 10000,
    "risk_reward_ratio": 3.0,
    "probability_of_profit": 0.40
  },
  "entry": {"price": 5.00, "condition": "on dip below X"},
  "stop_loss": {"price": 2.50, "rationale": "50% loss"},
  "take_profit": {"targets": [{"price": 10, "size_pct": 50}, {"price": 15, "size_pct": 50}]},
  "sizing": {"recommended_pct": 2, "max_loss_pct": 0.3},
  "reasoning": ["reason 1", "reason 2"]
}`;

  return generateJSON(prompt, systemPrompt);
}

/**
 * Analyze equity fundamentals
 * @param {Object} data - Financial and price data
 * @returns {Promise<Object>} - Analysis
 */
export async function analyzeEquity(data) {
  const systemPrompt = `You are a fundamental analyst. Be concise and actionable.`;

  const prompt = `Analyze this equity:

${JSON.stringify(data, null, 2)}

Return JSON:
{
  "valuation": {"relative": "cheap|fair|expensive", "reasoning": "brief"},
  "quality": {"score": 1-10, "strengths": [], "weaknesses": []},
  "catalysts": [{"event": "event", "date": "date or unknown", "impact": "positive|negative|neutral"}],
  "sentiment": "improving|stable|deteriorating",
  "summary": "one sentence summary"
}`;

  return generateJSON(prompt, systemPrompt);
}

/**
 * Batch classify themes to config keys (uses Haiku for cost)
 * @param {string[]} themeNames - Raw theme names from AI
 * @param {string[]} validKeys - Valid config keys to map to
 * @returns {Promise<Object>} - Map of themeName -> configKey
 */
export async function classifyThemes(themeNames, validKeys) {
  if (!themeNames.length) return {};

  const res = await fetch(`${PROXY}/claude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-20250514', // Cheap & fast
      max_tokens: 512,
      system: 'Map theme names to valid keys. Return only JSON.',
      messages: [{
        role: 'user',
        content: `Map these themes to the closest valid key (or null if no match):

Themes: ${JSON.stringify(themeNames)}
Valid keys: ${JSON.stringify(validKeys)}

Return: {"theme_name": "valid_key_or_null", ...}`
      }]
    })
  });

  if (!res.ok) return {}; // Fail silently, keyword matching is fallback

  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  const match = text.match(/\{[\s\S]*\}/);

  try {
    return match ? JSON.parse(match[0]) : {};
  } catch {
    return {};
  }
}

export default {
  generate,
  generateJSON,
  reason,
  scoreOpportunity,
  generateMacroThesis,
  constructTrade,
  analyzeEquity,
  classifyThemes
};
