// packages/engine/src/welfare.ts
/**
 * Second-order compensating variation from the expenditure function:
 *   CV ≈ Σ_i X_i π_i + ½ Σ_i Σ_j X_i ε^c_ij π_i π_j
 * where X_i is baseline expenditure on i, π_i = Δp_i/p_i, ε^c the Hicksian (compensated) elasticity.
 * Derivation: docs/economics/methodology.md §3.
 */
export function cvSecondOrder(X: number[], epsC: number[][], pi: number[]): { cv: number; firstOrder: number; secondOrder: number } {
  const n = X.length;
  let firstOrder = 0;
  let secondOrder = 0;
  for (let i = 0; i < n; i++) {
    const pii = pi[i] ?? 0;
    firstOrder += X[i]! * pii;
    if (pii === 0) continue; // cross terms with π_i = 0 vanish
    for (let j = 0; j < n; j++) {
      const pij = pi[j] ?? 0;
      if (pij === 0) continue;
      secondOrder += 0.5 * X[i]! * epsC[i]![j]! * pii * pij;
    }
  }
  return { cv: firstOrder + secondOrder, firstOrder, secondOrder };
}

/** Willig-type income correction: EV ≈ CV − (Σ X_i η_i π_i)(Σ_k X_k π_k)/M. Approximate. */
export function evApprox(cv: number, X: number[], eta: number[], pi: number[], M: number): number {
  let a = 0, b = 0;
  for (let i = 0; i < X.length; i++) {
    a += X[i]! * eta[i]! * (pi[i] ?? 0);
    b += X[i]! * (pi[i] ?? 0);
  }
  return cv - (a * b) / M;
}

/** Exact Marshallian consumer-surplus loss for one good with constant-elasticity demand q = q0 (p/p0)^ε. */
export function csConstantElasticity(X0: number, pi: number, eps: number): number {
  const k = 1 + eps;
  if (Math.abs(k) < 1e-9) return X0 * Math.log(1 + pi);
  return (X0 * (Math.pow(1 + pi, k) - 1)) / k;
}

/** Marshallian quantity response of every item to the price vector; significance from SEs where given. */
export function substitutionPct(eps: number[][], pi: number[], se?: number[][]): { pct: number[]; significant: boolean[] } {
  const n = eps.length;
  const pct: number[] = new Array(n).fill(0);
  const significant: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    let sig = false;
    let anyMoving = false;
    for (let j = 0; j < n; j++) {
      const pij = pi[j] ?? 0;
      if (pij === 0) continue;
      anyMoving = true;
      pct[i]! += eps[i]![j]! * pij;
      const s = se?.[i]?.[j];
      if (s !== undefined && Math.abs(eps[i]![j]!) >= 1.645 * s) sig = true;
    }
    significant[i] = anyMoving && sig;
  }
  return { pct, significant };
}

/** Loss per household by income quintile: spend_k π (1 + ½ ε^c π). */
export function incidenceByQuintile(spend: number[], pi: number, epsC: number): { quintile: number; lossPerHousehold: number }[] {
  return spend.map((s, k) => ({ quintile: k + 1, lossPerHousehold: s * pi * (1 + 0.5 * epsC * pi) }));
}
