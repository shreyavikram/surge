import { describe, it, expect } from 'vitest';
import { loadContext } from '@surge/config';
import { createApp } from '../src/app.js';
import { readEnv } from '../src/env.js';
import { FeedRegistry } from '../src/feeds/registry.js';
import type { FeedAdapter, FeedResult } from '../src/feeds/types.js';

const gdacsStub: FeedAdapter = {
  id: 'gdacs', label: 'GDACS', kind: 'live', ttlMs: 1000, snapshotName: 'gdacs',
  async fetch() { return this.parse(null); },
  parse(): FeedResult {
    return { items: [{ id: 'ca', name: 'CA drought', category: 'drought', kind: 'natural', lat: 36.7, lng: -119.8, severity: 0.6, start: '2026-09' }], source: { feed: 'GDACS', kind: 'live' } };
  },
};
const fredStub: FeedAdapter = {
  id: 'fred', label: 'FRED', kind: 'live', ttlMs: 1000, producesThreats: false, snapshotName: 'fred',
  async fetch(): Promise<FeedResult> { return { items: [], series: { eggs: { months: ['2024-01'], values: [2.5] } }, source: { feed: 'FRED', kind: 'live' } }; },
  parse(): FeedResult { return { items: [], source: { feed: 'FRED', kind: 'live' } }; },
};

function app(vettedKey?: string) {
  const registry = new FeedRegistry([gdacsStub, fredStub]);
  return createApp({ registry, ctx: loadContext(), env: readEnv(vettedKey ? { SURGE_VETTED_KEY: vettedKey } : {}) });
}

describe('routes', () => {
  it('/api/context returns the config bundle', async () => {
    const res = await app().request('/api/context');
    const body = await res.json() as any;
    expect(body.commodities.eggs).toBeDefined();
    expect(Array.isArray(body.levers)).toBe(true);
  });

  it('/api/cases returns the calibrated cases', async () => {
    const body = await (await app().request('/api/cases')).json() as any;
    expect(body.cases.length).toBe(3);
    expect(body.cases.map((c: { id: string }) => c.id)).toContain('egg-2022');
  });

  it('/api/threats returns ranked priced threats, public by default', async () => {
    const body = await (await app('secret').request('/api/threats')).json() as any;
    expect(body.threats.length).toBeGreaterThan(0);
    expect(body.threats[0].cv).toBeGreaterThan(0);
    expect(body.vetted).toBe(false);
  });

  it('/api/threats reports vetted when the header matches the key', async () => {
    const res = await app('secret').request('/api/threats', { headers: { 'x-surge-vetted': 'secret' } });
    expect((await res.json() as any).vetted).toBe(true);
  });

  it('/api/series/:id returns a FRED series', async () => {
    const body = await (await app().request('/api/series/eggs')).json() as any;
    expect(body.values).toEqual([2.5]);
  });

  it('/api/vetted sets a cookie for the right key and rejects a wrong one', async () => {
    const ok = await app('secret').request('/api/vetted', { method: 'POST', body: JSON.stringify({ key: 'secret' }), headers: { 'content-type': 'application/json' } });
    expect((await ok.json() as any).vetted).toBe(true);
    expect(ok.headers.get('set-cookie')).toContain('surge_vetted=');
    const bad = await app('secret').request('/api/vetted', { method: 'POST', body: JSON.stringify({ key: 'nope' }), headers: { 'content-type': 'application/json' } });
    expect((await bad.json() as any).vetted).toBe(false);
  });
});
