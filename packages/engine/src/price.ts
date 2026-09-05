// packages/engine/src/price.ts
export interface PriceParams {
  eps: number;               // domestic retail demand elasticity (<0)
  exportShare: number;       // exports / production
  exportElasticity: number;  // export demand elasticity (<=0)
  passThrough: number;       // retail moves θ × wholesale
  lagMonths: number;
}

/**
 * Market clearing in log changes with short-run supply fixed by biology:
 *   (1−x)·ε·π_r + x·εₓ·π_w = −s,  π_w = π_r/θ
 *   ⇒ π_r = −s / ((1−x)·ε + x·εₓ/θ)
 * Derivation: docs/economics/methodology.md §2.
 */
export function retailPriceChange(s: number, p: PriceParams): number {
  const denom = (1 - p.exportShare) * p.eps + (p.exportShare * p.exportElasticity) / p.passThrough;
  if (!(Math.abs(denom) > 1e-12)) throw new Error('price clearing denominator is zero: check elasticities');
  return -s / denom;
}

export function pricePaths(supplyPath: number[], costPath: number[] | undefined, p: PriceParams): { wholesalePct: number[]; retailPct: number[]; quantityPct: number[] } {
  const n = supplyPath.length;
  const wholesalePct: number[] = new Array(n).fill(0);
  for (let t = 0; t < n; t++) {
    const s = supplyPath[t] ?? 0;
    const fromSupply = s > 0 ? retailPriceChange(s, p) / p.passThrough : 0;
    wholesalePct[t] = fromSupply + (costPath?.[t] ?? 0);
  }
  const retailPct: number[] = new Array(n).fill(0);
  for (let t = 0; t < n; t++) {
    const src = t - p.lagMonths;
    retailPct[t] = src >= 0 ? p.passThrough * wholesalePct[src]! : 0;
  }
  const quantityPct = retailPct.map((r) => p.eps * r);
  return { wholesalePct, retailPct, quantityPct };
}

/** Replays: observed price relative to a counterfactual path, scaled by the share attributed to the threat. */
export function observedRetailPath(observed: number[], counterfactual: number[], attributionShare: number): number[] {
  return observed.map((o, t) => {
    const c = counterfactual[t];
    if (c === undefined || c <= 0) return 0;
    return attributionShare * (o / c - 1);
  });
}
