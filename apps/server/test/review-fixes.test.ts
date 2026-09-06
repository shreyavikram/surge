import { describe, it, expect } from 'vitest';
import { loadContext } from '@surge/config';
import type { SourceStamp } from '@surge/engine';
import type { FeedItem, FeedAdapter, FeedResult, StoredSnapshot } from '../src/feeds/types.js';
import { feedItemsToThreats } from '../src/threats.js';
import { FeedRegistry } from '../src/feeds/registry.js';
import { readEnv } from '../src/env.js';

// Regression tests for the 2026-09-06 red-team review findings on the server side.
const ctx = loadContext();
const src: SourceStamp = { feed: 'test', kind: 'live' };

describe('gazetteer', () => {
  it('keeps input-cost items that name their region and commodities', () => {
    const items: FeedItem[] = [{ id: 'eia-energy', name: 'Diesel up 26%', category: 'input_cost', kind: 'geopolitical', regionId: 'us-national', commodities: [{ id: 'energy', relevance: 1 }], severity: 0.1, start: '2026-09' }];
    const threats = feedItemsToThreats(items, src, ctx);
    expect(threats.length).toBe(1);
    expect(threats[0]!.location.regionId).toBe('us-national');
  });
  it('does not hand a Bolivian wildfire to Brazil because of the bounding box', () => {
    const items: FeedItem[] = [{ id: 'bol', name: 'Wildfire, Bolivia', category: 'wildfire', kind: 'natural', lat: -17.8, lng: -63.2, iso3: 'BOL', severity: 0.5, alertScore: true, start: '2026-09' }];
    expect(feedItemsToThreats(items, src, ctx)).toEqual([]);
  });
  it('places a Brazilian point in the brazil region by its country code', () => {
    const items: FeedItem[] = [{ id: 'bra', name: 'Drought, Brazil', category: 'drought', kind: 'natural', lat: -20, lng: -47, iso3: 'BRA', severity: 0.5, alertScore: true, start: '2026-09' }];
    const t = feedItemsToThreats(items, src, ctx);
    expect(t[0]?.location.regionId).toBe('brazil');
  });
  it('a US point never lands in a foreign region', () => {
    const items: FeedItem[] = [{ id: 'tx', name: 'Storm, Texas', category: 'storm', kind: 'natural', lat: 26.2, lng: -98.2, iso3: 'USA', severity: 0.5, alertScore: true, start: '2026-09' }];
    const t = feedItemsToThreats(items, src, ctx);
    expect(t[0]?.location.regionId?.startsWith('us-')).toBe(true);
  });
});

describe('registry keeps the last successful fetch when a refresh fails', () => {
  const snap: StoredSnapshot = { fetchedAt: '2026-09-01T00:00:00.000Z', result: { items: [{ id: 's1', name: 'snapshot item' }], source: { feed: 'Fake', kind: 'live' } } };
  const loadSnapshot = (name: string) => (name === 'fake' ? snap : null);
  it('serves the expired cache, not the older committed snapshot, after a failed refresh', async () => {
    let n = 0;
    const adapter: FeedAdapter = {
      id: 'fake', label: 'Fake', kind: 'live', ttlMs: 1000, snapshotName: 'fake',
      async fetch(): Promise<FeedResult> { n++; if (n > 1) throw new Error('boom'); return { items: [{ id: 'live1', name: 'live item' }], source: { feed: 'Fake', kind: 'live' } }; },
      parse() { return snap.result; },
    };
    let t = 0;
    const reg = new FeedRegistry([adapter], { loadSnapshot, now: () => t });
    const first = await reg.get('fake', readEnv({}));
    expect(first.items[0]!.id).toBe('live1');
    t = 5000; // cache expired → refresh fails
    const second = await reg.get('fake', readEnv({}));
    expect(second.items[0]!.id).toBe('live1');
    t = 6000; // inside the failure back-off → still the last good fetch
    const third = await reg.get('fake', readEnv({}));
    expect(third.items[0]!.id).toBe('live1');
    expect(reg.healthRows()[0]!.status).toBe('stale');
  });
});
