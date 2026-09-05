import { describe, it, expect } from 'vitest';
import { FeedRegistry } from '../src/feeds/registry.js';
import type { FeedAdapter, FeedResult, StoredSnapshot } from '../src/feeds/types.js';
import { readEnv } from '../src/env.js';

function liveResult(n: number): FeedResult {
  return { items: [{ id: `x${n}`, name: `live ${n}` }], source: { feed: 'Fake', kind: 'live' } };
}

function makeAdapter(over: Partial<FeedAdapter> = {}) {
  let n = 0;
  const adapter: FeedAdapter = {
    id: 'fake', label: 'Fake', kind: 'live', ttlMs: 1000, snapshotName: 'fake',
    async fetch() { n++; return liveResult(n); },
    parse() { return liveResult(0); },
    ...over,
  };
  return { adapter, calls: () => n };
}

const snap: StoredSnapshot = {
  fetchedAt: '2026-09-01T00:00:00.000Z',
  result: { items: [{ id: 's1', name: 'snap item' }], source: { feed: 'Fake', kind: 'live' } },
};
const loadSnapshot = (name: string) => (name === 'fake' ? snap : null);

describe('FeedRegistry', () => {
  it('fetches, marks live, and caches within the TTL', async () => {
    const { adapter, calls } = makeAdapter();
    let t = 0;
    const reg = new FeedRegistry([adapter], { loadSnapshot, now: () => t });
    const r1 = await reg.get('fake', readEnv({}));
    expect(r1.source.stale).toBe(false);
    expect(r1.items[0]!.name).toBe('live 1');
    t = 500;
    await reg.get('fake', readEnv({})); // within ttl → cached, no new fetch
    expect(calls()).toBe(1);
    expect(reg.healthRows()[0]!.status).toBe('live');
  });

  it('re-fetches after the TTL expires', async () => {
    const { adapter, calls } = makeAdapter();
    let t = 0;
    const reg = new FeedRegistry([adapter], { loadSnapshot, now: () => t });
    await reg.get('fake', readEnv({}));
    t = 2000; // past ttl 1000
    await reg.get('fake', readEnv({}));
    expect(calls()).toBe(2);
  });

  it('serves the snapshot (stale) on a forced outage', async () => {
    const { adapter, calls } = makeAdapter();
    const reg = new FeedRegistry([adapter], { loadSnapshot, now: () => 0 });
    const r = await reg.get('fake', readEnv({ SURGE_FORCE_OUTAGE: 'fake' }));
    expect(r.source.stale).toBe(true);
    expect(r.items[0]!.name).toBe('snap item');
    expect(calls()).toBe(0); // never hit the network
    expect(reg.healthRows()[0]!.status).toBe('snapshot');
  });

  it('serves the snapshot when a required key is missing', async () => {
    const { adapter } = makeAdapter({ requiresKey: 'FRED_API_KEY' });
    const reg = new FeedRegistry([adapter], { loadSnapshot, now: () => 0 });
    const r = await reg.get('fake', readEnv({}));
    expect(r.source.stale).toBe(true);
    const row = reg.healthRows()[0]!;
    expect(row.status).toBe('missing-key');
    expect(row.requiresKey).toBe('FRED_API_KEY');
  });

  it('falls back to the snapshot (stale) when fetch throws', async () => {
    const { adapter } = makeAdapter({ async fetch() { throw new Error('boom'); } });
    const reg = new FeedRegistry([adapter], { loadSnapshot, now: () => 0 });
    const r = await reg.get('fake', readEnv({}));
    expect(r.source.stale).toBe(true);
    expect(r.items[0]!.name).toBe('snap item');
    expect(reg.healthRows()[0]!.status).toBe('stale');
  });

  it('returns an empty result with error status when no snapshot exists', async () => {
    const { adapter } = makeAdapter({ snapshotName: 'missing', async fetch() { throw new Error('boom'); } });
    const reg = new FeedRegistry([adapter], { loadSnapshot, now: () => 0 });
    const r = await reg.get('fake', readEnv({}));
    expect(r.items).toEqual([]);
    expect(reg.healthRows()[0]!.status).toBe('error');
  });
});
