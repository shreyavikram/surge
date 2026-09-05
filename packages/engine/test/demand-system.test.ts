import { describe, it, expect } from 'vitest';
import { symmetricEigenvalues } from '../src/linalg.js';
import { buildDemandSystem, toHicksian, symmetrize, slutskyMatrix, checkNSD } from '../src/demand-system.js';
import type { DemandSystemConfig } from '../src/types.js';

const cfg: DemandSystemConfig = {
  source: 'test',
  items: [
    { id: 'a', label: 'A', budgetShare: 0.10, expenditureElasticity: 0.8 },
    { id: 'b', label: 'B', budgetShare: 0.30, expenditureElasticity: 1.0 },
    { id: 'c', label: 'C', budgetShare: 0.60, expenditureElasticity: 1.0333 },
  ],
  marshallian: [
    [-0.9, 0.2, -0.1],
    [0.1, -1.1, 0.0],
    [-0.05, 0.02, -1.0],
  ],
};

describe('linalg', () => {
  it('finds eigenvalues of a diagonal matrix', () => {
    const ev = symmetricEigenvalues([[2, 0], [0, -3]]).sort((x: number, y: number) => x - y);
    expect(ev[0]).toBeCloseTo(-3, 9);
    expect(ev[1]).toBeCloseTo(2, 9);
  });
  it('finds eigenvalues of a 2x2 symmetric matrix', () => {
    const ev = symmetricEigenvalues([[2, 1], [1, 2]]).sort((x: number, y: number) => x - y);
    expect(ev[0]).toBeCloseTo(1, 9);
    expect(ev[1]).toBeCloseTo(3, 9);
  });
});

describe('demand system', () => {
  it('converts Marshallian to Hicksian with the Slutsky equation', () => {
    const ds = buildDemandSystem(cfg);
    const epsC = toHicksian(ds);
    expect(epsC[0]![0]).toBeCloseTo(-0.9 + 0.10 * 0.8, 12);
    expect(epsC[0]![1]).toBeCloseTo(0.2 + 0.30 * 0.8, 12);
    expect(epsC[2]![0]).toBeCloseTo(-0.05 + 0.10 * 1.0333, 12);
  });
  it('symmetrizes the Slutsky matrix and reports the largest adjustment', () => {
    const ds = buildDemandSystem(cfg);
    const { epsC, maxAdjustment } = symmetrize(toHicksian(ds), ds.w);
    const S = slutskyMatrix(epsC, ds.w);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(S[i]![j]).toBeCloseTo(S[j]![i]!, 12);
    expect(maxAdjustment).toBeGreaterThan(0);
    expect(maxAdjustment).toBeLessThan(0.5);
  });
  it('leaves an already-symmetric system unchanged', () => {
    const w = [0.5, 0.5];
    const epsC = [[-0.4, 0.4], [0.4, -0.4]];
    const r = symmetrize(epsC, w);
    expect(r.maxAdjustment).toBe(0);
    expect(r.epsC).toEqual(epsC);
  });
  it('flags negative semidefiniteness', () => {
    expect(checkNSD([[-1, 0], [0, -0.5]]).ok).toBe(true);
    expect(checkNSD([[1, 0], [0, -0.5]]).ok).toBe(false);
    expect(checkNSD([[0, 0], [0, 0]]).ok).toBe(true);
  });
  it('indexes ids', () => {
    const ds = buildDemandSystem(cfg);
    expect(ds.index['b']).toBe(1);
    expect(ds.ids).toEqual(['a', 'b', 'c']);
  });
});
