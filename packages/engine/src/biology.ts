// packages/engine/src/biology.ts
export interface LivestockEvent { month: number; headLost: number }
export interface LivestockParams {
  inventory: number;        // head in production at baseline
  lagMin: number;           // months until the first replacement cohort is back
  lagMax: number;           // months until the last is back (uniform ramp between)
  producerOffset: number;   // share of naive loss offset by delayed culling, higher lay rates, etc.
  months: number;
}

/** Share of a lost cohort back in production k months after the loss (uniform ramp lagMin..lagMax). */
export function recoveredFraction(k: number, lagMin: number, lagMax: number): number {
  if (k < lagMin) return 0;
  if (k > lagMax) return 1;
  const span = lagMax - lagMin + 1;
  return (k - lagMin + 1) / span;
}

export function livestockShortfall(events: LivestockEvent[], p: LivestockParams): number[] {
  const out: number[] = new Array(p.months).fill(0);
  for (let t = 0; t < p.months; t++) {
    let head = 0;
    for (const e of events) {
      if (t < e.month) continue;
      head += e.headLost * (1 - recoveredFraction(t - e.month, p.lagMin, p.lagMax));
    }
    out[t] = (head / p.inventory) * (1 - p.producerOffset);
  }
  return out;
}

/**
 * A single-season yield loss materializes at lossMonth and is spread evenly over the marketing
 * year; stocks absorb at most half the stocks-to-use ratio (modeled assumption).
 */
export function cropShortfall(p: { yieldLossFraction: number; affectedShare: number; lossMonth: number; marketingMonths: number; stocksToUse: number; months: number }): number[] {
  const out: number[] = new Array(p.months).fill(0);
  const buffer = Math.min(0.5, Math.max(0, p.stocksToUse));
  const loss = p.yieldLossFraction * p.affectedShare * (1 - buffer);
  for (let t = p.lossMonth; t < Math.min(p.months, p.lossMonth + p.marketingMonths); t++) out[t] = loss;
  return out;
}

export function manufacturingShortfall(p: { capacityOutFraction: number; outMonths: number; rampMonths: number; months: number }): number[] {
  const out: number[] = new Array(p.months).fill(0);
  for (let t = 0; t < p.months; t++) {
    if (t < p.outMonths) out[t] = p.capacityOutFraction;
    else if (t < p.outMonths + p.rampMonths) out[t] = p.capacityOutFraction * (1 - (t - p.outMonths + 1) / p.rampMonths);
    else out[t] = 0;
  }
  return out;
}

export function quarterlyMeans(path: number[], firstMonthOffset: number): number[] {
  const out: number[] = [];
  for (let t = firstMonthOffset; t + 2 < path.length; t += 3) out.push((path[t]! + path[t + 1]! + path[t + 2]!) / 3);
  return out;
}
