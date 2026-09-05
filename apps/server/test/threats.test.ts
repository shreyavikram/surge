import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadContext } from '@surge/config';
import { rankThreats } from '@surge/engine';
import type { SourceStamp } from '@surge/engine';
import type { FeedItem } from '../src/feeds/types.js';
import { feedItemsToThreats, threatsFromResults } from '../src/threats.js';
import { gdacs } from '../src/feeds/gdacs.js';
import { portwatch } from '../src/feeds/portwatch.js';

const ctx = loadContext();
const src: SourceStamp = { feed: 'test', kind: 'live' };
const fx = (p: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${p}`, import.meta.url)), 'utf8'));

describe('feedItemsToThreats', () => {
  it('maps a California drought point to Central Valley commodities and prices a loss', () => {
    const items: FeedItem[] = [{ id: 't1', name: 'CA drought', category: 'drought', kind: 'natural', lat: 36.7, lng: -119.8, severity: 0.6, start: '2026-09' }];
    const threats = feedItemsToThreats(items, src, ctx);
    expect(threats.length).toBe(1);
    expect(threats[0]!.location.regionId).toBe('us-california-central-valley');
    expect(threats[0]!.commodities.map((c) => c.id)).toContain('lettuce');
    expect(rankThreats(threats, ctx)[0]!.cv).toBeGreaterThan(0);
  });

  it('maps a chokepoint item by regionId to its transiting commodities', () => {
    const items: FeedItem[] = [{ id: 'pw', name: 'Suez transit', category: 'chokepoint', kind: 'geopolitical', regionId: 'suez-red-sea', severity: 0.5, physical: { kind: 'transit_decline_fraction', value: 0.5 }, start: '2026-09' }];
    const threats = feedItemsToThreats(items, src, ctx);
    expect(threats[0]!.commodities.map((c) => c.id)).toContain('coffee');
    expect(rankThreats(threats, ctx)[0]!.cv).toBeGreaterThan(0);
  });

  it('drops items outside the gazetteer', () => {
    const items: FeedItem[] = [{ id: 'x', name: 'Flood in Chad', category: 'flood', kind: 'natural', lat: 13.5, lng: 14.4, severity: 0.5 }];
    expect(feedItemsToThreats(items, src, ctx)).toEqual([]);
  });

  it('runs real GDACS + PortWatch fixtures through to finite ranked CVs', () => {
    const threats = threatsFromResults([gdacs.parse(fx('gdacs.json')), portwatch.parse(fx('portwatch.json'))], ctx);
    for (const r of rankThreats(threats, ctx)) expect(Number.isFinite(r.cv)).toBe(true);
  });
});
