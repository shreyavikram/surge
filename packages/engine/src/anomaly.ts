// packages/engine/src/anomaly.ts
// FAO Indicator of Food Price Anomalies (IFPA), the method behind SDG indicator 2.c.1 and the GIEWS
// Food Price Monitoring and Analysis early-warning flags (Baquedano 2015, FAO Statistics Working Paper
// "Developing an indicator of price anomalies as an early warning tool: a compound growth approach").
//
//   CQGR_t = (P_t / P_{t-3})^(1/3) − 1      compound monthly growth over the last quarter
//   CAGR_t = (P_t / P_{t-12})^(1/12) − 1    compound monthly growth over the last year
//   z_q, z_a = growth rate standardised against the same calendar month in earlier years (seasonality)
//   IFPA_t = γ_q · z_q + γ_a · z_a,  γ_q = σ_q² / (σ_q² + σ_a²),  γ_a = 1 − γ_q   (variance-share weights)
//
//   IFPA ≥ 1        abnormally high     0.5 ≤ IFPA < 1   moderately high
//   IFPA ≤ −1       abnormally low     −1 < IFPA ≤ −0.5  moderately low     otherwise normal
//
// Applied here to BLS average retail prices (via FRED) per commodity. Deterministic and unit-tested.

export type AnomalyLevel = 'abnormally-high' | 'moderately-high' | 'normal' | 'moderately-low' | 'abnormally-low';

export interface PriceAnomaly {
  month: string;               // YYYY-MM of the observation scored
  price: number;
  cqgr: number;                // compound monthly growth over the last quarter
  cagr: number;                // compound monthly growth over the last year
  zQuarter: number;
  zYear: number;
  weightQuarter: number;       // γ_q
  ifpa: number;
  level: AnomalyLevel;
  /** how many earlier same-month observations stood behind each z-score */
  history: { quarter: number; year: number };
  /** the last 12 IFPA values (oldest first), for context */
  recent: { month: string; ifpa: number }[];
}

export const IFPA_MIN_HISTORY = 5;

export function anomalyLevel(ifpa: number): AnomalyLevel {
  if (ifpa >= 1) return 'abnormally-high';
  if (ifpa >= 0.5) return 'moderately-high';
  if (ifpa <= -1) return 'abnormally-low';
  if (ifpa <= -0.5) return 'moderately-low';
  return 'normal';
}

function meanSd(xs: number[]): { mean: number; sd: number } {
  const n = xs.length;
  if (n === 0) return { mean: 0, sd: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const v = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, sd: Math.sqrt(v) };
}

interface Growth { cqgr: number | null; cagr: number | null }

/** Compound growth rates at every index (null where the lookback is missing or a price is non-positive). */
function growthRates(values: number[]): Growth[] {
  return values.map((p, t) => {
    const q = values[t - 3];
    const y = values[t - 12];
    const ok = (x: number | undefined): x is number => x !== undefined && x > 0;
    return {
      cqgr: ok(q) && p > 0 ? Math.pow(p / q, 1 / 3) - 1 : null,
      cagr: ok(y) && p > 0 ? Math.pow(p / y, 1 / 12) - 1 : null,
    };
  });
}

function scoreAt(months: string[], values: number[], g: Growth[], t: number): { ifpa: number; parts: Omit<PriceAnomaly, 'recent' | 'level' | 'month' | 'price'> } | null {
  const cur = g[t];
  if (!cur || cur.cqgr === null || cur.cagr === null) return null;
  const calMonth = months[t]!.slice(5, 7);
  const histQ: number[] = [];
  const histA: number[] = [];
  for (let s = 0; s < t; s++) {
    if (months[s]!.slice(5, 7) !== calMonth) continue;
    const gs = g[s]!;
    if (gs.cqgr !== null) histQ.push(gs.cqgr);
    if (gs.cagr !== null) histA.push(gs.cagr);
  }
  if (histQ.length < IFPA_MIN_HISTORY || histA.length < IFPA_MIN_HISTORY) return null;
  const q = meanSd(histQ);
  const a = meanSd(histA);
  const zQuarter = q.sd > 1e-12 ? (cur.cqgr - q.mean) / q.sd : 0;
  const zYear = a.sd > 1e-12 ? (cur.cagr - a.mean) / a.sd : 0;
  const varQ = q.sd * q.sd;
  const varA = a.sd * a.sd;
  const weightQuarter = varQ + varA > 1e-18 ? varQ / (varQ + varA) : 0.5;
  const ifpa = weightQuarter * zQuarter + (1 - weightQuarter) * zYear;
  return { ifpa, parts: { cqgr: cur.cqgr, cagr: cur.cagr, zQuarter, zYear, weightQuarter, ifpa, history: { quarter: histQ.length, year: histA.length } } };
}

/**
 * Score the latest observation of a monthly price series (or the observation at `atMonth`).
 * Returns null when fewer than IFPA_MIN_HISTORY same-month observations exist for either growth rate.
 */
export function priceAnomaly(months: string[], values: number[], atMonth?: string): PriceAnomaly | null {
  if (months.length !== values.length || months.length === 0) return null;
  const t = atMonth ? months.indexOf(atMonth) : months.length - 1;
  if (t < 0) return null;
  const g = growthRates(values);
  const s = scoreAt(months, values, g, t);
  if (!s) return null;
  const recent: PriceAnomaly['recent'] = [];
  for (let k = Math.max(0, t - 11); k <= t; k++) {
    const r = scoreAt(months, values, g, k);
    if (r) recent.push({ month: months[k]!, ifpa: r.ifpa });
  }
  return { month: months[t]!, price: values[t]!, ...s.parts, level: anomalyLevel(s.ifpa), recent };
}
