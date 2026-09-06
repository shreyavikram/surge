import { describe, it, expect } from 'vitest';
import { getContext, buildBaseList, rankEntries, runEntry } from '../src/engine.js';
import { SEED_THREATS } from '../src/seed.js';

describe('seed threats', () => {
  const ctx = getContext();

  it('reference only known regions', () => {
    for (const t of SEED_THREATS) {
      const rid = t.location.regionId!;
      expect(ctx.regions[rid], `${t.id} region ${rid}`).toBeDefined();
    }
  });

  it('reference only known commodities or inputs', () => {
    for (const t of SEED_THREATS) {
      for (const { id } of t.commodities) {
        const known = !!ctx.commodities[id] || !!ctx.inputs[id];
        expect(known, `${t.id} commodity ${id}`).toBe(true);
      }
    }
  });

  it('each seed produces a real (non-zero, finite) consumer loss', () => {
    for (const t of SEED_THREATS) {
      const { impact } = runEntry({ threat: t, origin: 'seed' }, ctx);
      expect(Number.isFinite(impact.welfare.cv), `${t.id} cv finite`).toBe(true);
      expect(impact.welfare.cv, `${t.id} cv > 0`).toBeGreaterThan(0);
    }
  });

  it('ranks the full list (seeds + replays) by consumer loss, descending', () => {
    const ranked = rankEntries(buildBaseList(), ctx);
    expect(ranked.length).toBe(SEED_THREATS.length + 2); // + egg-2022, formula-2022
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.cv).toBeGreaterThanOrEqual(ranked[i]!.cv);
    }
    expect(ranked[0]!.cv).toBeGreaterThan(0);
  });
});
