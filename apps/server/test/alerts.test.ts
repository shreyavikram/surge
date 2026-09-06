import { describe, it, expect } from 'vitest';
import { makeMailer, diffNewThreats } from '../src/alerts.js';
import { loadContext } from '@surge/config';
import type { Threat } from '@surge/engine';

describe('alerts', () => {
  it('sends through Resend when a key is present', async () => {
    let seen: { url: string; body: string } | null = null;
    const fetchImpl = (async (url: string, init?: RequestInit) => { seen = { url, body: String(init?.body) }; return new Response('{"id":"x"}', { status: 200 }); }) as unknown as typeof fetch;
    const m = await makeMailer(undefined, 'key', fetchImpl);
    await m!.send('a@b.co', 'hi', 'body');
    expect(seen!.url).toContain('api.resend.com');
    expect(seen!.body).toContain('a@b.co');
  });
  it('queues nothing without a provider', async () => {
    expect(await makeMailer(undefined, undefined)).toBeNull();
  });
  it('diffs new threats against a store and respects the focus area', () => {
    const ctx = loadContext();
    const t: Threat = { id: 'n1', name: 'Iowa layers', category: 'disease', kind: 'natural', location: { lat: 42, lng: -93.5, regionId: 'us-iowa' }, commodities: [{ id: 'eggs', relevance: 1 }], severity: 0.3, start: '2026-09', source: { feed: 't', kind: 'user' } };
    const store = { subscriptions: [{ email: 'ia@x.co', enabled: true, focus: 'Iowa', createdAt: '' }, { email: 'ny@x.co', enabled: true, focus: 'New York', createdAt: '' }], seen: [], pending: [] };
    const out = diffNewThreats([t], ctx, store);
    expect(out.map((p) => p.email)).toEqual(['ia@x.co']);
    expect(store.seen).toContain('n1');
  });
});
