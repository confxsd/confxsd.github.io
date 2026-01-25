// VRP (Volatility Risk Premium) Context Builder

/**
 * Build VRP context string for AI prompts
 * @param {Object} data - Market data object
 * @param {number} data.vrp - Volatility Risk Premium (IV - RV)
 * @param {number} data.ivRank - IV Rank percentile (0-100)
 * @param {number} data.rv30 - 30-day Realized Volatility
 * @param {number} data.avgIV - Average Implied Volatility
 * @param {number} data.termSteepness - Term structure steepness
 * @param {Object} data.volSetup - Vol setup classification
 * @returns {string} Formatted VRP context
 */
export function buildVRPContext(data) {
  if (!data.vrp && !data.ivRank) {
    return 'VOLATILITY: No VRP data available';
  }

  const { vrp, ivRank, rv30, avgIV, termSteepness, volSetup } = data;

  const vrpSignal = getVRPSignal(vrp);
  const ivRankSignal = getIVRankSignal(ivRank);

  let context = `VOLATILITY ANALYSIS:
- IV (Implied): ${avgIV?.toFixed(1) || '--'}% | RV (30d Realized): ${rv30?.toFixed(1) || '--'}%
- VRP (IV - RV): ${vrp != null ? (vrp >= 0 ? '+' : '') + vrp.toFixed(1) + '%' : '--'} → ${vrpSignal}
- IV Rank (52w): ${ivRank?.toFixed(0) || '--'}% → ${ivRankSignal}`;

  if (termSteepness != null) {
    const termSignal = getTermStructureSignal(termSteepness);
    context += `\n- Term Structure: ${termSteepness >= 0 ? '+' : ''}${termSteepness.toFixed(1)}% → ${termSignal}`;
  }

  if (volSetup) {
    context += `\n- Vol Setup: ${volSetup.setup.replace('_', ' ')} (${volSetup.confidence}% confidence)`;
    context += `\n- Recommendation: ${volSetup.description}`;
  }

  return context;
}

/**
 * Get VRP trading signal
 */
export function getVRPSignal(vrp) {
  if (vrp > 10) return 'SELL PREMIUM (options expensive)';
  if (vrp > 5) return 'SLIGHT PREMIUM (lean toward selling)';
  if (vrp < -5) return 'BUY PREMIUM (options cheap)';
  if (vrp < 0) return 'SLIGHT DISCOUNT (lean toward buying)';
  return 'NEUTRAL';
}

/**
 * Get IV Rank interpretation
 */
export function getIVRankSignal(ivRank) {
  if (ivRank > 80) return 'VERY HIGH (top 20% of 52w range)';
  if (ivRank > 60) return 'HIGH';
  if (ivRank < 20) return 'VERY LOW (bottom 20% of 52w range)';
  if (ivRank < 40) return 'LOW';
  return 'MEDIUM';
}

/**
 * Get term structure interpretation
 */
export function getTermStructureSignal(steepness) {
  if (steepness > 10) return 'STEEP (contango - back months expensive)';
  if (steepness < -5) return 'INVERTED (backwardation - fear)';
  return 'FLAT';
}
