/**
 * Signal Scorer Module
 * Client-side scoring of opportunities against live market data
 * Used for real-time re-scoring in the UI
 */

// Scoring weights (must match backend)
const SCORING_WEIGHTS = {
  novelty: 0.25,      // Is this new information?
  alignment: 0.20,    // Does it align with thesis?
  validation: 0.20,   // Does market data confirm?
  riskReward: 0.15,   // Is R/R attractive?
  timing: 0.10,       // Is timing right?
  credibility: 0.10   // Source reliability
};

/**
 * Score an opportunity against current market data and thesis
 * @param {Object} opportunity - The opportunity object
 * @param {Object} marketData - Current market data for the ticker
 * @param {Object} thesis - Current macro thesis
 * @returns {Object} Scores breakdown and composite
 */
export function scoreOpportunity(opportunity, marketData, thesis) {
  const validationResult = calculateValidationScore(opportunity, marketData);
  const scores = {
    novelty: calculateNoveltyScore(opportunity),
    alignment: calculateAlignmentScore(opportunity, thesis),
    validation: typeof validationResult === 'object' ? validationResult.score : validationResult,
    riskReward: calculateRiskRewardScore(opportunity),
    timing: calculateTimingScore(opportunity),
    credibility: calculateCredibilityScore(opportunity)
  };
  // Store checks separately for breakdown display
  scores._validationChecks = typeof validationResult === 'object' ? validationResult.checks : [];

  // Weighted composite score
  let composite = Object.entries(SCORING_WEIGHTS)
    .reduce((sum, [key, weight]) => sum + (scores[key] || 50) * weight, 0);

  // Time decay: -10 points per 6 hours, max 50 point decay
  const ageHours = getAgeHours(opportunity.created_at);
  const timeDecay = Math.min(ageHours / 6 * 10, 50);
  composite = Math.max(0, composite - timeDecay);

  return {
    composite: Math.round(composite),
    components: scores,
    timeDecay: Math.round(timeDecay),
    ageHours: Math.round(ageHours * 10) / 10
  };
}

/**
 * Calculate novelty score based on signal age and metadata
 */
function calculateNoveltyScore(opp) {
  const meta = opp.trade_idea?.metadata || opp.metadata || {};

  // First check explicit novelty field
  const noveltyMap = { breaking: 100, recent: 70, known: 40 };
  if (meta.novelty && noveltyMap[meta.novelty]) {
    return noveltyMap[meta.novelty];
  }

  // Fallback: calculate from age
  const ageHours = getAgeHours(opp.created_at);
  if (ageHours < 1) return 100;      // < 1 hour = breaking
  if (ageHours < 4) return 90;       // < 4 hours = very fresh
  if (ageHours < 12) return 70;      // < 12 hours = recent
  if (ageHours < 24) return 50;      // < 24 hours = today
  if (ageHours < 48) return 30;      // < 48 hours = yesterday
  return 20;                          // > 48 hours = old
}

/**
 * Calculate alignment score against macro thesis
 */
function calculateAlignmentScore(opp, thesis) {
  if (!thesis) return 50; // Neutral if no thesis

  let score = 50; // Base score

  // Direction alignment
  const thesisBias = thesis.bias?.toLowerCase();
  const oppDirection = opp.direction?.toLowerCase();

  if (thesisBias === 'bullish' && oppDirection === 'long') score += 20;
  else if (thesisBias === 'bearish' && oppDirection === 'short') score += 20;
  else if (thesisBias === 'bullish' && oppDirection === 'short') score -= 10;
  else if (thesisBias === 'bearish' && oppDirection === 'long') score -= 10;

  // Theme alignment
  const thesisThemes = (thesis.themes || []).map(t =>
    (typeof t === 'string' ? t : t.name)?.toLowerCase()
  );
  const oppTheme = opp.signal_type?.toLowerCase();
  if (thesisThemes.includes(oppTheme)) score += 15;

  // Sector alignment (if thesis has OW/UW sectors)
  const ticker = opp.ticker?.toUpperCase();
  const owSectors = (thesis.sectorAnalysis?.overweight || []).flatMap(s => s.tickers || []);
  const uwSectors = (thesis.sectorAnalysis?.underweight || []).flatMap(s => s.tickers || []);

  if (owSectors.includes(ticker) && oppDirection === 'long') score += 15;
  if (uwSectors.includes(ticker) && oppDirection === 'short') score += 15;
  if (owSectors.includes(ticker) && oppDirection === 'short') score -= 10;
  if (uwSectors.includes(ticker) && oppDirection === 'long') score -= 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate validation score based on market data confirmation
 */
function calculateValidationScore(opp, marketData) {
  if (!marketData) return 50; // Neutral if no market data

  let score = 0;
  const checks = [];
  const direction = opp.direction?.toLowerCase();

  // 1. GEX Regime Check (+25)
  const gexRegime = marketData.gexRegime || marketData.gex_regime;
  if (gexRegime) {
    const isPositiveGamma = gexRegime.includes('POSITIVE') || gexRegime.includes('positive');
    const isNegativeGamma = gexRegime.includes('NEGATIVE') || gexRegime.includes('negative');

    // Positive gamma = mean-reverting, good for bounces
    if (direction === 'long' && isPositiveGamma) {
      score += 25;
      checks.push('GEX confirms bounce setup');
    } else if (direction === 'short' && isNegativeGamma) {
      // Negative gamma = trending, good for continuation
      score += 25;
      checks.push('GEX confirms trend continuation');
    } else if (direction === 'long' && isNegativeGamma) {
      score -= 10;
      checks.push('GEX warns: negative gamma opposes long');
    } else if (direction === 'short' && isPositiveGamma) {
      score -= 10;
      checks.push('GEX warns: positive gamma opposes short');
    }
  }

  // 2. VRP Setup Check (+25)
  const vrpSetup = marketData.vrpSetup || marketData.vrp_setup;
  const instrument = opp.trade_idea?.instrument?.toLowerCase() || '';
  const isOptionsPlay = instrument.includes('call') || instrument.includes('put') || instrument.includes('straddle');

  if (vrpSetup && isOptionsPlay) {
    const isSellSetup = vrpSetup.includes('HIGH_VRP') || vrpSetup.includes('SELL');
    const isBuySetup = vrpSetup.includes('BUY_GAMMA') || vrpSetup.includes('LOW');
    const isSellStrategy = instrument.includes('short') || instrument.includes('sell') || instrument.includes('iron') || instrument.includes('credit');
    const isBuyStrategy = instrument.includes('long') || instrument.includes('buy') || instrument.includes('straddle') || instrument.includes('debit');

    if ((isSellSetup && isSellStrategy) || (isBuySetup && isBuyStrategy)) {
      score += 25;
      checks.push(`VRP aligns with ${isSellSetup ? 'selling' : 'buying'} strategy`);
    } else if ((isSellSetup && isBuyStrategy) || (isBuySetup && isSellStrategy)) {
      score -= 10;
      checks.push('VRP conflicts with strategy direction');
    }
  }

  // 3. Technical Score Check (+25)
  const techScore = marketData.technicals?.score || marketData.technicalScore;
  if (techScore !== undefined) {
    if (direction === 'long' && techScore > 60) {
      score += 25;
      checks.push('Technicals confirm bullish');
    } else if (direction === 'short' && techScore < 40) {
      score += 25;
      checks.push('Technicals confirm bearish');
    }
  }

  // 4. Options Flow Check (+25)
  const pcRatio = marketData.pcRatio || marketData.pc_ratio;
  if (pcRatio !== undefined) {
    if (direction === 'long' && pcRatio < 0.7) {
      score += 25;
      checks.push('Call flow confirms bullish');
    } else if (direction === 'short' && pcRatio > 1.3) {
      score += 25;
      checks.push('Put flow confirms bearish');
    }
  }

  return { score: Math.max(0, Math.min(100, score)), checks };
}

/**
 * Calculate risk/reward score
 */
function calculateRiskRewardScore(opp) {
  const idea = opp.trade_idea || {};

  // Try to parse target and stop
  const target = parseLevel(idea.target);
  const stop = parseLevel(idea.stop);
  const entry = parseLevel(idea.entry?.level);

  if (target && stop && entry) {
    const reward = Math.abs(target - entry);
    const risk = Math.abs(entry - stop);
    if (risk > 0) {
      const ratio = reward / risk;
      if (ratio >= 3) return 100;
      if (ratio >= 2.5) return 90;
      if (ratio >= 2) return 80;
      if (ratio >= 1.5) return 60;
      if (ratio >= 1) return 40;
      return 20;
    }
  }

  // Fallback: estimate from % strings
  const targetPct = parsePercent(idea.target);
  const stopPct = parsePercent(idea.stop);

  if (targetPct && stopPct) {
    const ratio = Math.abs(targetPct / stopPct);
    if (ratio >= 3) return 100;
    if (ratio >= 2) return 80;
    if (ratio >= 1.5) return 60;
    return 40;
  }

  // Default based on sizing
  const sizingMap = { full: 70, half: 60, quarter: 50, starter: 40 };
  return sizingMap[idea.sizing] || 50;
}

/**
 * Calculate timing score based on catalyst proximity
 */
function calculateTimingScore(opp) {
  const idea = opp.trade_idea || {};
  const meta = idea.metadata || {};

  // Check urgency field
  const urgencyMap = { immediate: 100, today: 80, this_week: 60, no_rush: 40 };
  if (meta.urgency && urgencyMap[meta.urgency]) {
    return urgencyMap[meta.urgency];
  }

  // Check catalyst date
  const catalystDate = idea.catalystDate || opp.catalystDate;
  if (catalystDate) {
    const daysUntil = getDaysUntil(catalystDate);
    if (daysUntil < 0) return 30;      // After catalyst
    if (daysUntil === 0) return 100;   // Today
    if (daysUntil <= 2) return 90;     // Next 2 days
    if (daysUntil <= 7) return 70;     // This week
    if (daysUntil <= 14) return 50;    // Next 2 weeks
    return 40;                          // Further out
  }

  // Default based on timeframe
  const timeframeMap = { '1d': 90, '1w': 70, '2w': 60, '1m': 50, '3m': 40 };
  return timeframeMap[idea.timeframe] || 60;
}

/**
 * Calculate credibility score from metadata
 */
function calculateCredibilityScore(opp) {
  const meta = opp.trade_idea?.metadata || opp.metadata || {};

  // Check explicit credibility
  const credMap = { high: 100, medium: 70, low: 40 };
  if (meta.sourceCredibility && credMap[meta.sourceCredibility]) {
    return credMap[meta.sourceCredibility];
  }

  // Factor in data quality
  const qualityMap = { high: 90, medium: 60, low: 30 };
  if (meta.dataQuality && qualityMap[meta.dataQuality]) {
    return qualityMap[meta.dataQuality];
  }

  return 50; // Default
}

// ============== HELPERS ==============

function getAgeHours(createdAt) {
  if (!createdAt) return 168; // Treat missing timestamp as 1 week old
  const created = new Date(createdAt);
  const now = new Date();
  return (now - created) / (1000 * 60 * 60);
}

function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

function parseLevel(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? null : num;
}

function parsePercent(value) {
  if (!value) return null;
  const str = String(value);
  const match = str.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  if (match) return parseFloat(match[1]);
  return null;
}

/**
 * Format score for display
 */
export function formatScore(score) {
  if (score >= 80) return { value: score, label: 'HOT', class: 'score-hot' };
  if (score >= 60) return { value: score, label: 'WARM', class: 'score-warm' };
  if (score >= 40) return { value: score, label: 'WATCH', class: 'score-watch' };
  return { value: score, label: 'LOW', class: 'score-low' };
}

/**
 * Get score breakdown as readable text
 */
export function getScoreBreakdown(scores) {
  const items = [
    { name: 'Novelty', value: scores.novelty, weight: SCORING_WEIGHTS.novelty },
    { name: 'Alignment', value: scores.alignment, weight: SCORING_WEIGHTS.alignment },
    { name: 'Validation', value: typeof scores.validation === 'object' ? scores.validation.score : scores.validation, weight: SCORING_WEIGHTS.validation },
    { name: 'Risk/Reward', value: scores.riskReward, weight: SCORING_WEIGHTS.riskReward },
    { name: 'Timing', value: scores.timing, weight: SCORING_WEIGHTS.timing },
    { name: 'Credibility', value: scores.credibility, weight: SCORING_WEIGHTS.credibility }
  ];

  return items.map(i => ({
    ...i,
    contribution: Math.round(i.value * i.weight),
    weightPct: Math.round(i.weight * 100)
  }));
}

/**
 * Check if opportunity should trigger AI validation
 * Based on moderate setting: score > 60
 */
export function shouldValidateWithAI(opportunity, scores) {
  const composite = scores?.composite ?? opportunity.composite_score ?? 0;

  // Moderate threshold: 60+
  if (composite >= 60) return true;

  // Breaking news always validates
  const meta = opportunity.trade_idea?.metadata || opportunity.metadata || {};
  if (meta.novelty === 'breaking') return true;

  return false;
}
