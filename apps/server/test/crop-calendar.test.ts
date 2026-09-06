import { describe, it, expect } from 'vitest';
import { loadContext } from '@surge/config';
import type { SourceStamp } from '@surge/engine';
import type { FeedItem } from '../src/feeds/types.js';
import { feedItemsToThreats } from '../src/threats.js';
import { calendarWeight, monthOf } from '../src/crop-calendar.js';

const ctx = loadContext();
const src: SourceStamp = { feed: 'test', kind: 'live' };

describe('crop calendar', () => {
  it('covers every commodity and input with twelve weights in 0..1', () => {
    for (const id of [...Object.keys(ctx.commodities), ...Object.keys(ctx.inputs)]) {
      for (let m = 1; m <= 12; m++) {
        const w = calendarWeight(id, m);
        expect(w, `${id} month ${m}`).toBeGreaterThanOrEqual(0);
        expect(w, `${id} month ${m}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('peaks corn in its reproductive months and keeps livestock flat', () => {
    expect(calendarWeight('corn', 1)).toBe(0.1);
    expect(calendarWeight('corn', '2026-07')).toBe(1);
    expect(calendarWeight('corn', 5)).toBe(0.5);
    expect(calendarWeight('beef', 1)).toBe(1);
    expect(calendarWeight('beef', 7)).toBe(1);
    expect(calendarWeight('citrus', 12)).toBe(1);
    expect(calendarWeight('not-a-crop', 3)).toBe(1);
  });

  it('reads the month from YYYY-MM strings, numbers and dates, defaulting to now', () => {
    expect(monthOf('2026-01')).toBe(1);
    expect(monthOf('2026-11-15')).toBe(11);
    expect(monthOf(12)).toBe(12);
    expect(monthOf(new Date(Date.UTC(2026, 6, 1)))).toBe(7);
    expect(monthOf()).toBe(new Date().getUTCMonth() + 1);
    expect(monthOf('garbage')).toBe(new Date().getUTCMonth() + 1);
  });

  it('weights a Kansas drought by crop stage: January spares corn but not cattle, July hits corn fully', () => {
    const drought = (start: string): FeedItem => ({ id: `ks-${start}`, name: 'Kansas drought', category: 'drought', kind: 'natural', regionId: 'us-state-KS', iso3: 'USA', severity: 0.5, alertScore: true, start });
    const jan = feedItemsToThreats([drought('2026-01')], src, ctx)[0]!;
    const rel = (t: typeof jan, id: string) => t.commodities.find((c) => c.id === id)?.relevance;
    expect(rel(jan, 'corn')).toBe(0.1);
    expect(rel(jan, 'beef')).toBe(1);
    const jul = feedItemsToThreats([drought('2026-07')], src, ctx)[0]!;
    expect(rel(jul, 'corn')).toBe(1);
    expect(rel(jul, 'beef')).toBe(1);
  });

  it('leaves relevance at 1 for items that name their own commodities and for foreign supplier regions', () => {
    const own: FeedItem = { id: 'own', name: 'x', category: 'drought', kind: 'natural', regionId: 'us-state-KS', commodities: [{ id: 'corn', relevance: 0.7 }], severity: 0.5, start: '2026-01' };
    expect(feedItemsToThreats([own], src, ctx)[0]!.commodities[0]!.relevance).toBe(0.7);
    const mex: FeedItem = { id: 'mex', name: 'Mexico storm', category: 'storm', kind: 'natural', iso3: 'MEX', lat: 20, lng: -99, severity: 0.5, alertScore: true, start: '2026-01' };
    const t = feedItemsToThreats([mex], src, ctx)[0]!;
    expect(t.location.regionId).toBe('mexico');
    expect(t.commodities.every((c) => c.relevance === 1)).toBe(true);
  });
});
