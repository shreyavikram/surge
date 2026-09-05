// packages/engine/src/demand-system.ts
import type { DemandSystemConfig } from './types.js';
import { symmetricEigenvalues, zeros } from './linalg.js';

export interface DemandSystem {
  ids: string[];
  index: Record<string, number>;
  w: number[];          // budget shares of total expenditure
  eta: number[];        // expenditure elasticities
  eps: number[][];      // Marshallian price elasticities
  se?: number[][];
}

export function buildDemandSystem(cfg: DemandSystemConfig): DemandSystem {
  const ids = cfg.items.map((i) => i.id);
  const index: Record<string, number> = {};
  ids.forEach((id, k) => { index[id] = k; });
  const ds: DemandSystem = {
    ids, index,
    w: cfg.items.map((i) => i.budgetShare),
    eta: cfg.items.map((i) => i.expenditureElasticity),
    eps: cfg.marshallian.map((r) => r.slice()),
  };
  if (cfg.standardErrors) ds.se = cfg.standardErrors.map((r) => r.slice());
  return ds;
}

/** Slutsky: ε^c_ij = ε_ij + w_j η_i */
export function toHicksian(ds: DemandSystem): number[][] {
  const n = ds.ids.length;
  const out = zeros(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i]![j] = ds.eps[i]![j]! + ds.w[j]! * ds.eta[i]!;
  return out;
}

/** S_ij = w_i ε^c_ij is the Slutsky substitution matrix in expenditure-share units. */
export function slutskyMatrix(epsC: number[][], w: number[]): number[][] {
  const n = w.length;
  const S = zeros(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) S[i]![j] = w[i]! * epsC[i]![j]!;
  return S;
}

/**
 * Enforce Slutsky symmetry S_ij = S_ji with S_ij = w_i ε^c_ij.
 * The two published estimates of the same substitution term are combined by inverse-variance
 * weighting, var(S_ij) = (w_i · SE_ij)². Without SEs a floor of 0.005 is used, so the estimate
 * from the smaller-share good's own equation dominates (naive averaging rescales the large
 * good's noise by w_j/w_i, which is ~5,000 for nonfood vs frozen beverages).
 * Indices in `skip` (the numeraire, whose price never moves so its cross terms never enter CV)
 * are left as published. Reports the largest change to any ε^c_ij.
 */
export function symmetrize(epsC: number[][], w: number[], se?: number[][], skip?: Set<number>): { epsC: number[][]; maxAdjustment: number } {
  const n = w.length;
  const S = slutskyMatrix(epsC, w);
  const out = zeros(n, n);
  let maxAdjustment = 0;
  const floor = 0.005;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sym: number;
      if (i === j || skip?.has(i) || skip?.has(j)) {
        // own terms and numeraire (price never moves) rows/columns stay as published
        sym = S[i]![j]!;
      } else {
        const sij = Math.max(se?.[i]?.[j] ?? 0, floor);
        const sji = Math.max(se?.[j]?.[i] ?? 0, floor);
        const vij = (w[i]! * sij) ** 2;
        const vji = (w[j]! * sji) ** 2;
        sym = (S[i]![j]! / vij + S[j]![i]! / vji) / (1 / vij + 1 / vji);
      }
      const v = sym / w[i]!;
      maxAdjustment = Math.max(maxAdjustment, Math.abs(v - epsC[i]![j]!));
      out[i]![j] = v;
    }
  }
  return { epsC: out, maxAdjustment };
}

export function checkNSD(S: number[][]): { ok: boolean; maxEigenvalue: number } {
  if (S.length === 0) return { ok: true, maxEigenvalue: 0 };
  const ev = symmetricEigenvalues(S);
  const maxEigenvalue = Math.max(...ev);
  return { ok: maxEigenvalue <= 1e-9, maxEigenvalue };
}
