// Technical Indicators Module

export function average(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function calcRSI(prices, period) {
  const result = [];
  let gains = 0, losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    change > 0 ? gains += change : losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  result.push(100 - 100 / (1 + avgGain / (avgLoss || 0.001)));

  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
    result.push(100 - 100 / (1 + avgGain / (avgLoss || 0.001)));
  }

  return result;
}

export function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calcMACD(prices) {
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calcEMA(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

export function calcATR(data, period) {
  const tr = [0];
  for (let i = 1; i < data.length; i++) {
    tr.push(Math.max(
      data[i].h - data[i].l,
      Math.abs(data[i].h - data[i - 1].c),
      Math.abs(data[i].l - data[i - 1].c)
    ));
  }

  const result = [];
  for (let i = 0; i < tr.length; i++) {
    result.push(i >= period ? average(tr.slice(i - period + 1, i + 1)) : null);
  }
  return result;
}

export function calcMFI(data, period) {
  const result = [null];

  for (let i = 1; i < data.length; i++) {
    if (i < period) {
      result.push(null);
      continue;
    }

    const slice = [];
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (data[j].h + data[j].l + data[j].c) / 3;
      const prevTp = (data[j - 1].h + data[j - 1].l + data[j - 1].c) / 3;
      slice.push({
        pos: tp > prevTp ? tp * data[j].v : 0,
        neg: tp < prevTp ? tp * data[j].v : 0
      });
    }

    const posFlow = slice.reduce((s, x) => s + x.pos, 0);
    const negFlow = slice.reduce((s, x) => s + x.neg, 0);
    result.push(100 - 100 / (1 + posFlow / (negFlow || 1)));
  }

  return result;
}

export function calcADX(data, period) {
  const pdi = [], mdi = [], adx = [];
  let pSum = 0, mSum = 0, trSum = 0;

  for (let i = 1; i < data.length; i++) {
    const upMove = data[i].h - data[i - 1].h;
    const downMove = data[i - 1].l - data[i].l;
    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(
      data[i].h - data[i].l,
      Math.abs(data[i].h - data[i - 1].c),
      Math.abs(data[i].l - data[i - 1].c)
    );

    if (i <= period) {
      pSum += plusDM;
      mSum += minusDM;
      trSum += tr;
      if (i === period) {
        pdi.push(100 * pSum / trSum);
        mdi.push(100 * mSum / trSum);
      } else {
        pdi.push(null);
        mdi.push(null);
      }
    } else {
      pSum = (pSum * (period - 1) + plusDM) / period;
      mSum = (mSum * (period - 1) + minusDM) / period;
      trSum = (trSum * (period - 1) + tr) / period;
      pdi.push(100 * pSum / trSum);
      mdi.push(100 * mSum / trSum);
    }
  }

  for (let i = 0; i < pdi.length; i++) {
    if (pdi[i] === null) {
      adx.push(null);
    } else {
      const dx = 100 * Math.abs(pdi[i] - mdi[i]) / (pdi[i] + mdi[i] || 1);
      adx.push(dx);
    }
  }

  return { pdi, mdi, adx };
}

export function calcADL(data) {
  const adl = [];
  let cumulative = 0;

  for (const bar of data) {
    const mfm = ((bar.c - bar.l) - (bar.h - bar.c)) / ((bar.h - bar.l) || 1);
    cumulative += mfm * bar.v;
    adl.push(cumulative);
  }

  return adl;
}

export function calcBollingerBands(prices, period = 20) {
  const upper = [], middle = [], lower = [];

  for (let i = 0; i < prices.length; i++) {
    if (i >= period - 1) {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = average(slice);
      const std = Math.sqrt(slice.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / period);
      middle.push(mean);
      upper.push(mean + 2 * std);
      lower.push(mean - 2 * std);
    } else {
      middle.push(null);
      upper.push(null);
      lower.push(null);
    }
  }

  return { upper, middle, lower };
}

export function calcSMA(prices, period) {
  const result = [];
  for (let i = 0; i < prices.length; i++) {
    result.push(i >= period - 1 ? average(prices.slice(i - period + 1, i + 1)) : null);
  }
  return result;
}
