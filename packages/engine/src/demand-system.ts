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

/** Enforce Slutsky symmetry by averaging S_ij and S_ji; report the largest change to any ε^c_ij. */
export function symmetrize(epsC: number[][], w: number[]): { epsC: number[][]; maxAdjustment: number } {
  const n = w.length;
  const S = slutskyMatrix(epsC, w);
  const out = zeros(n, n);
  let maxAdjustment = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const sym = (S[i]![j]! + S[j]![i]!) / 2;
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
