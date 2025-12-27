// VHunter Portfolio AI Analysis Module
import { fetchTickerData, fetchClaude } from './api.js';
import * as indicators from './indicators.js';
import { buildPortfolioPrompt } from './prompts.js';
import { positionsCache } from './positions.js';

let portfolioMarketData = {};

export async function analyzePortfolio() {
  const positions = positionsCache.open;

  if (!positions.length) {
    alert('No open positions to analyze');
    return;
  }

  // Show AI insights section
  document.getElementById('aiInsightsSection').style.display = 'block';
  document.getElementById('portfolioAiStatus').textContent = 'analyzing...';

  // Reset displays
  document.getElementById('portfolioRiskScore').textContent = '...';
  document.getElementById('portfolioRiskScore').className = 'insight-score';
  document.getElementById('portfolioRiskDetail').textContent = 'Analyzing...';
  document.getElementById('thesisAlignment').textContent = '...';
  document.getElementById('thesisAlignment').className = 'insight-value';
  document.getElementById('thesisDetail').textContent = 'Evaluating...';
  document.getElementById('expiryAlert').textContent = '...';
  document.getElementById('expiryAlert').className = 'insight-value';
  document.getElementById('expiryDetail').textContent = 'Checking...';
  document.getElementById('portfolioAnalysis').textContent = 'Loading analysis...';
  document.getElementById('positionSignals').textContent = 'Evaluating positions...';
  document.getElementById('portfolioRecommendations').textContent = 'Generating recommendations...';

  try {
    const uniqueTickers = [...new Set(positions.map(p =>
      p.optionInfo ? p.optionInfo.ticker : p.ticker
    ))];

    document.getElementById('portfolioAiStatus').textContent = `fetching data (${uniqueTickers.length} tickers)...`;

    const marketDataPromises = uniqueTickers.map(async ticker => {
      try {
        const { aggs } = await fetchTickerData(ticker);
        if (aggs?.results?.length > 0) {
          const prices = aggs.results.map(d => d.c);
          const rsiValues = indicators.calcRSI(prices, 14);
          const macd = indicators.calcMACD(prices);
          const adxData = indicators.calcADX(aggs.results, 14);

          return {
            ticker,
            price: prices[prices.length - 1],
            rsi: rsiValues[rsiValues.length - 1],
            macdH: macd.histogram[macd.histogram.length - 1],
            adx: adxData.adx[adxData.adx.length - 1]
          };
        }
      } catch (e) {
        console.error(`Failed to fetch data for ${ticker}:`, e);
      }
      return { ticker, price: 0, rsi: 50, macdH: 0, adx: 0 };
    });

    const marketDataArray = await Promise.all(marketDataPromises);
    portfolioMarketData = {};
    marketDataArray.forEach(d => {
      portfolioMarketData[d.ticker] = d;
    });

    const enrichedPositions = positions.map(p => {
      const underlyingTicker = p.optionInfo ? p.optionInfo.ticker : p.ticker;
      const displayPrice = p.optionInfo ? (p.optionPrice || 0) : (p.currentPrice || 0);
      const costBasis = p.type === 'long' || p.type === 'short'
        ? p.entry_price * p.quantity
        : p.entry_price * p.quantity * 100;

      let daysToExpiry = null;
      if (p.optionInfo?.expiry) {
        const expDate = new Date(p.optionInfo.expiry);
        const today = new Date();
        daysToExpiry = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
      }

      return {
        ...p,
        underlyingTicker,
        displayPrice,
        costBasis,
        daysToExpiry
      };
    });

    const totalUnrealized = enrichedPositions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
    const totalValue = enrichedPositions.reduce((sum, p) => sum + (p.costBasis || 0), 0);

    const portfolioData = {
      positions: enrichedPositions,
      marketData: portfolioMarketData,
      totalUnrealized,
      totalValue
    };

    document.getElementById('portfolioAiStatus').textContent = 'thinking...';

    const response = await fetchClaude(buildPortfolioPrompt(portfolioData), true);
    parsePortfolioResponse(response);

    document.getElementById('portfolioAiStatus').textContent = 'done';

  } catch (e) {
    console.error('Portfolio analysis failed:', e);
    document.getElementById('portfolioAiStatus').textContent = 'error';
    document.getElementById('portfolioAnalysis').textContent = 'Analysis failed: ' + e.message;
  }
}

function parsePortfolioResponse(response) {
  const riskScoreMatch = response.match(/\*\*RISK_SCORE:\*\*\s*(\d+)/);
  const riskLevelMatch = response.match(/\*\*RISK_LEVEL:\*\*\s*(LOW|MEDIUM|HIGH)/i);
  const thesisStatusMatch = response.match(/\*\*THESIS_STATUS:\*\*\s*(ALIGNED|PARTIAL|DIVERGENT)/i);
  const thesisDetailMatch = response.match(/\*\*THESIS_DETAIL:\*\*\s*(.+?)(?=\n\*\*|$)/s);
  const expiryStatusMatch = response.match(/\*\*EXPIRY_STATUS:\*\*\s*(SAFE|WARNING|URGENT)/i);
  const expiryDetailMatch = response.match(/\*\*EXPIRY_DETAIL:\*\*\s*(.+?)(?=\n\*\*|$)/s);
  const analysisMatch = response.match(/\*\*PORTFOLIO_ANALYSIS:\*\*\s*([\s\S]+?)(?=\n\*\*POSITION_SIGNALS|$)/);
  const signalsMatch = response.match(/\*\*POSITION_SIGNALS:\*\*\s*([\s\S]+?)(?=\n\*\*RECOMMENDATIONS|$)/);
  const recsMatch = response.match(/\*\*RECOMMENDATIONS:\*\*\s*([\s\S]+?)$/);

  if (riskScoreMatch) {
    const score = parseInt(riskScoreMatch[1]);
    const scoreEl = document.getElementById('portfolioRiskScore');
    scoreEl.textContent = score;
    scoreEl.className = 'insight-score ' + (score <= 3 ? 'low' : score <= 6 ? 'medium' : 'high');
  }

  if (riskLevelMatch) {
    const level = riskLevelMatch[1].toUpperCase();
    document.getElementById('portfolioRiskDetail').textContent = level + ' RISK';
  }

  if (thesisStatusMatch) {
    const status = thesisStatusMatch[1].toUpperCase();
    const thesisEl = document.getElementById('thesisAlignment');
    thesisEl.textContent = status;
    thesisEl.className = 'insight-value ' + status.toLowerCase();
  }
  if (thesisDetailMatch) {
    document.getElementById('thesisDetail').textContent = thesisDetailMatch[1].trim();
  }

  if (expiryStatusMatch) {
    const status = expiryStatusMatch[1].toUpperCase();
    const expiryEl = document.getElementById('expiryAlert');
    expiryEl.textContent = status;
    expiryEl.className = 'insight-value ' + status.toLowerCase();
  }
  if (expiryDetailMatch) {
    document.getElementById('expiryDetail').textContent = expiryDetailMatch[1].trim();
  }

  if (analysisMatch) {
    document.getElementById('portfolioAnalysis').textContent = analysisMatch[1].trim();
  }

  if (signalsMatch) {
    let signalsHtml = signalsMatch[1].trim();
    signalsHtml = signalsHtml.replace(/TAKE_PROFIT/g, '<span class="signal-take">TAKE PROFIT</span>');
    signalsHtml = signalsHtml.replace(/HOLD/g, '<span class="signal-hold">HOLD</span>');
    signalsHtml = signalsHtml.replace(/CUT_LOSS/g, '<span class="signal-cut">CUT LOSS</span>');
    signalsHtml = signalsHtml.replace(/ADD/g, '<span class="signal-add">ADD</span>');
    document.getElementById('positionSignals').innerHTML = signalsHtml;
  }

  if (recsMatch) {
    document.getElementById('portfolioRecommendations').textContent = recsMatch[1].trim();
  }
}

export function hideAiInsights() {
  document.getElementById('aiInsightsSection').style.display = 'none';
}

// Expose to window for onclick handlers
window.analyzePortfolio = analyzePortfolio;
window.hideAiInsights = hideAiInsights;
