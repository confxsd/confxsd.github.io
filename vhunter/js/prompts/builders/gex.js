// GEX (Gamma Exposure) Context Builder
// SIG-level dealer positioning analysis

/**
 * Build GEX context string for AI prompts
 * @param {Object} data - Market data with GEX metrics
 * @param {Object} data.gexMetrics - GEX metrics object
 * @param {Object} data.gammaLevels - Gamma levels object
 * @param {Object} data.dexMetrics - DEX metrics object
 * @param {Object} data.deltaFlow - Delta flow data
 * @param {Object} data.charmPressure - Charm pressure data
 * @param {Object} data.wallShift - Wall shift data
 * @param {number} data.price - Current spot price
 * @returns {string} Formatted GEX context
 */
export function buildGEXContext(data) {
  if (!data.gexMetrics && !data.gammaLevels) {
    return '';
  }

  const gex = data.gexMetrics || data.gammaLevels || {};
  const deltaFlow = data.deltaFlow || {};
  const charm = data.charmPressure || {};

  // Skip if no meaningful data
  if (!gex.netGEX && !gex.zeroGamma && !gex.gexZeroLine) {
    return '';
  }

  const netGEX = gex.netGEX || gex.netGEXFormatted;
  const zeroGamma = gex.zeroGamma || gex.gexZeroLine;
  const callWall = gex.callWall || gex.levels?.callWall;
  const putWall = gex.putWall || gex.levels?.putWall;
  const volTrigger = gex.volTrigger || gex.levels?.volTrigger;
  const regime = gex.regime?.regime || gex.regime || 'UNKNOWN';

  const { regimeSignal, tradingImplication } = getRegimeAnalysis(regime);

  let context = `
GAMMA EXPOSURE (GEX) - Dealer Positioning:
- Net GEX: ${typeof netGEX === 'string' ? netGEX : formatGEX(netGEX)} → ${regimeSignal}
- Zero Gamma: $${zeroGamma?.toFixed(0) || '--'} ${data.price > zeroGamma ? '(SPOT ABOVE - stabilizing zone)' : '(SPOT BELOW - amplifying zone)'}
- Call Wall: $${callWall?.toFixed(0) || '--'} (RESISTANCE - 83% hold rate)
- Put Wall: $${putWall?.toFixed(0) || '--'} (SUPPORT)`;

  if (volTrigger) {
    context += `\n- Vol Trigger: $${volTrigger.toFixed(0)} (Below = vol expansion zone)`;
  }

  context += `\n- TRADING IMPLICATION: ${tradingImplication}`;

  // Add delta flow if available
  if (deltaFlow.hedgingPressure) {
    context += `\n- Delta Flow: ${deltaFlow.hedgingPressure} (${deltaFlow.intensity || 'N/A'})`;
  }

  // Add pinning info if near expiry
  if (charm.pinningStrike && charm.charmPressure !== 'NONE') {
    context += `\n- Charm/Pinning: ${charm.signal} (${charm.charmPressure})`;
  }

  // Add wall shift data if available
  context += buildWallShiftContext(data.wallShift);

  return context;
}

/**
 * Get regime analysis with signal and trading implications
 */
export function getRegimeAnalysis(regime) {
  const regimeMap = {
    'POSITIVE': {
      regimeSignal: '+GEX (Dealers LONG gamma)',
      tradingImplication: 'MEAN-REVERTING: Fade moves, sell vol, expect pinning. Dealers hedge BY SELLING rallies, BUYING dips.'
    },
    'POSITIVE_GAMMA': {
      regimeSignal: '+GEX (Dealers LONG gamma)',
      tradingImplication: 'MEAN-REVERTING: Fade moves, sell vol, expect pinning. Dealers hedge BY SELLING rallies, BUYING dips.'
    },
    'NEGATIVE': {
      regimeSignal: '-GEX (Dealers SHORT gamma)',
      tradingImplication: 'TRENDING: Follow momentum, buy vol. Dealers hedge BY BUYING rallies, SELLING dips = AMPLIFICATION.'
    },
    'NEGATIVE_GAMMA': {
      regimeSignal: '-GEX (Dealers SHORT gamma)',
      tradingImplication: 'TRENDING: Follow momentum, buy vol. Dealers hedge BY BUYING rallies, SELLING dips = AMPLIFICATION.'
    },
    'NEGATIVE_DEEP': {
      regimeSignal: '-GEX DEEP (Below Vol Trigger)',
      tradingImplication: 'HIGH VOL REGIME: Expect outsized moves. Dealer hedging creates feedback loop.'
    }
  };

  return regimeMap[regime] || {
    regimeSignal: '~GEX (Near neutral)',
    tradingImplication: 'MIXED: No strong dealer-driven bias.'
  };
}

/**
 * Build wall shift context section
 */
function buildWallShiftContext(wallShift) {
  if (!wallShift?.shifts) return '';

  const { shifts, trends } = wallShift;
  if (shifts.callWall == null && shifts.putWall == null) return '';

  let context = `\n\nWALL SHIFTS (vs yesterday):`;

  if (shifts.callWall != null) {
    const dir = shifts.callWall > 0 ? '↑' : shifts.callWall < 0 ? '↓' : '→';
    context += `\n- Call Wall: ${dir}$${Math.abs(shifts.callWall).toFixed(0)} (${shifts.callWallSignal})`;
  }

  if (shifts.putWall != null) {
    const dir = shifts.putWall > 0 ? '↑' : shifts.putWall < 0 ? '↓' : '→';
    context += `\n- Put Wall: ${dir}$${Math.abs(shifts.putWall).toFixed(0)} (${shifts.putWallSignal})`;
  }

  if (trends?.callWall5d != null) {
    context += `\n- 5d Trend: Call Wall ${trends.callWallSignal5d}, Put Wall ${trends.putWallSignal5d}`;
  }

  return context;
}

/**
 * Format GEX value for display
 */
export function formatGEX(val) {
  if (val == null) return '--';
  const abs = Math.abs(val);
  if (abs >= 1e9) return (val / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (val / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (val / 1e3).toFixed(0) + 'K';
  return val.toFixed(0);
}
