// AI Prompts Module

export function buildAnalysisPrompt(data) {
  return `You are a senior quant analyst. Analyze this real-time market data and provide:

MARKET DATA FOR ${data.ticker}:
- Current Price: $${data.price} (${data.change > 0 ? '+' : ''}${data.change.toFixed(2)}%)
- Volume: ${data.volume} (${data.rvol.toFixed(1)}x avg)
- RSI(14): ${data.rsi.toFixed(1)}
- MACD Histogram: ${data.macdH.toFixed(2)}
- ADX: ${data.adx.toFixed(1)} (+DI: ${data.pdi.toFixed(1)}, -DI: ${data.mdi.toFixed(1)})
- Bollinger %B: ${data.bbPct}%
- MFI(14): ${data.mfi.toFixed(1)}
- ATR(14): $${data.atr.toFixed(2)}
- 20-day SMA: $${data.sma20.toFixed(2)}
- 50-day SMA: $${data.sma50.toFixed(2)}
- Money Flow: ${data.buyPct}% buy / ${100 - data.buyPct}% sell
- A/D Line trend: ${data.adlTrend > 0 ? 'Accumulation' : 'Distribution'} (${data.adlTrend.toFixed(1)}%)

OPTIONS DATA:
- Call Volume: ${data.callVol}, Put Volume: ${data.putVol}
- Put/Call Ratio: ${data.pcRatio.toFixed(2)}
- Top Call Strikes: ${data.topCalls}
- Top Put Strikes: ${data.topPuts}
- Max Pain: $${data.maxPain}

Provide a concise analysis in this exact format:

**THESIS:** [1-2 sentence market thesis based on technicals]

**BIAS:** [BULLISH/BEARISH/NEUTRAL] - [confidence %]

**KEY SIGNALS:**
- [Most important signal 1]
- [Most important signal 2]
- [Most important signal 3]

**RISK:** [Key risk to watch]`;
}

export function buildTradePrompt(data) {
  return `Based on this data for ${data.ticker} at $${data.price}:
- RSI: ${data.rsi.toFixed(1)}, MACD: ${data.macdH.toFixed(2)}, ADX: ${data.adx.toFixed(1)}
- ATR: $${data.atr.toFixed(2)}, Volatility environment: ${data.vol > 40 ? 'HIGH' : 'NORMAL'}
- Options P/C Ratio: ${data.pcRatio.toFixed(2)}
- Top Call strikes: ${data.topCalls}
- Top Put strikes: ${data.topPuts}

Suggest 2-3 specific trade ideas. For each:
**TRADE [#]:** [Direction] [Instrument]
- Entry: $[price] | Stop: $[price] | Target: $[price]
- Risk/Reward: [ratio]
- Thesis: [1 sentence why]

Include at least one OPTIONS trade (calls, puts, or spread) if conditions favor it. Be specific with strike prices based on the options flow data. If no good setups exist, say "NO CLEAR EDGE - STAY FLAT" and explain why.`;
}
