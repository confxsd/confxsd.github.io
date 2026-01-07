// VHunter Shared Utilities

export function formatNum(n) {
  if (n == null || isNaN(n)) return '--';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toFixed(2);
}

export function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Error function approximation for delta calculation
export function erf(x) {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

export function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return mins + 'm';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h';
  const days = Math.floor(hrs / 24);
  return days + 'd';
}

// Calculate TRUE max pain: strike where option writers pay out the LEAST
export function calculateMaxPain(optionsArray) {
  if (!optionsArray?.length) return null;

  const strikeData = {};
  let totalOI = 0;

  optionsArray.forEach(o => {
    const strike = o.details?.strike_price;
    const oi = o.open_interest || 0;
    const type = o.details?.contract_type;
    if (!strike) return;

    totalOI += oi;
    if (!strikeData[strike]) strikeData[strike] = { callOI: 0, putOI: 0 };
    if (type === 'call') strikeData[strike].callOI += oi;
    else strikeData[strike].putOI += oi;
  });

  const strikes = Object.keys(strikeData).map(Number).sort((a, b) => a - b);
  if (strikes.length === 0) return null;

  if (totalOI === 0) {
    return strikes[Math.floor(strikes.length / 2)];
  }

  let minPayout = Infinity;
  let maxPainStrike = null;

  strikes.forEach(expiryPrice => {
    let totalPayout = 0;

    Object.entries(strikeData).forEach(([strikeStr, data]) => {
      const strike = parseFloat(strikeStr);

      if (expiryPrice > strike) {
        totalPayout += (expiryPrice - strike) * data.callOI;
      }

      if (strike > expiryPrice) {
        totalPayout += (strike - expiryPrice) * data.putOI;
      }
    });

    if (totalPayout < minPayout) {
      minPayout = totalPayout;
      maxPainStrike = expiryPrice;
    }
  });

  return maxPainStrike;
}

export function calculateHistoricalVolatility(prices, days) {
  if (prices.length < days + 1) days = prices.length - 1;
  const returns = [];
  for (let i = prices.length - days; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

// Parse option from notes format: "IONQ 23JAN26 49 P"
export function parseOptionFromNotes(notes) {
  if (!notes) return null;
  const match = notes.match(/(\w+)\s+(\d+)([A-Z]+)(\d+)\s+(\d+(?:\.\d+)?)\s+([CP])/i);
  if (match) {
    const day = match[2].padStart(2, '0');
    const monthStr = match[3].toUpperCase();
    const year = match[4].length === 2 ? '20' + match[4] : match[4];
    const months = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
                     JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
    const month = months[monthStr] || '01';
    const expiry = `${year}-${month}-${day}`;
    return {
      ticker: match[1].toUpperCase(),
      expiry,
      expiryRaw: match[2] + match[3] + match[4],
      strike: parseFloat(match[5]),
      type: match[6].toUpperCase() === 'C' ? 'call' : 'put'
    };
  }
  return null;
}

// Build Polygon option ticker: O:IONQ250123P00049000
export function buildOptionTicker(optInfo) {
  const [year, month, day] = optInfo.expiry.split('-');
  const yy = year.slice(-2);
  const strikeStr = (optInfo.strike * 1000).toFixed(0).padStart(8, '0');
  const typeChar = optInfo.type === 'put' ? 'P' : 'C';
  return `O:${optInfo.ticker}${yy}${month}${day}${typeChar}${strikeStr}`;
}
