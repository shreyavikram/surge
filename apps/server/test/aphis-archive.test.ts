import { describe, it, expect } from 'vitest';
import { parseDetectionsCsv, monthlyBirds, commodityFor } from '../src/feeds/aphis-archive.js';
import { threatsFromDetections } from '../src/feeds/aphis.js';
import { feedItemsToThreats } from '../src/threats.js';
import { redactThreat } from '../src/gate.js';
import { loadContext } from '@surge/config';

const csv = `date,state,county,production,birds
2026-01-10,Iowa,Sioux,Commercial Table Egg Layer,2500000
2026-02-03,Ohio,Darke,Commercial Table Egg Layer,1200000
2026-02-20,Minnesota,Kandiyohi,Commercial Turkey Meat Bird,40000
2026-03-05,Iowa,Buena Vista,Commercial Table Egg Layer,800000
2025-06-01,Iowa,Sioux,Commercial Table Egg Layer,5000000
2024-03-05,Texas,Parmer,Commercial Table Egg Layer,1900000
`;

describe('aphis archive', () => {
  const dets = parseDetectionsCsv(csv);
  it('parses rows and maps production types to commodities', () => {
    expect(dets).toHaveLength(6);
    expect(commodityFor('Commercial Table Egg Layer')).toBe('eggs');
    expect(commodityFor('Commercial Turkey Meat Bird')).toBe('turkey');
    expect(commodityFor('WOAH Non-Poultry')).toBeNull();
  });
  it('sums birds by month for a commodity from a start month', () => {
    const m = monthlyBirds(dets, 'eggs', '2026-01');
    expect(m).toEqual([{ month: '2026-01', birds: 2500000 }, { month: '2026-02', birds: 1200000 }, { month: '2026-03', birds: 800000 }]);
  });
  it('builds a national egg threat with a timeline and county detail behind the gate', () => {
    const items = threatsFromDetections(dets, new Date('2026-04-15T00:00:00Z'));
    const eggs = items.find((i) => i.id === 'aphis-hpai-eggs')!;
    expect(eggs).toBeDefined();
    // trailing twelve months from April 2026 reach back to May 2025, so the June 2025 flock counts
    expect(eggs.severity).toBeCloseTo(9.5e6 / 325e6, 6);
    expect(eggs.physical?.timeline).toHaveLength(4);
    expect(items.some((i) => i.id === 'aphis-hpai-turkey')).toBe(false); // below the floor
    const ctx = loadContext();
    const t = feedItemsToThreats(items, { feed: 'APHIS', kind: 'archive' }, ctx)[0]!;
    expect(t.gated).toBeDefined();
    expect(redactThreat(t, false).gated).toBeUndefined();
    expect(redactThreat(t, true).gated).toBeDefined();
  });
});
