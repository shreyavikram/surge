import { describe, it, expect } from 'vitest';
import { makeMailer, diffNewThreats, deliver } from '../src/alerts.js';
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

describe('alert filters and digests', () => {
  const ctx = loadContext();
  const egg: Threat = { id: 'e1', name: 'Iowa layers', category: 'disease', kind: 'natural', location: { lat: 42, lng: -93.5, regionId: 'us-iowa' }, commodities: [{ id: 'eggs', relevance: 1 }], severity: 0.3, start: '2026-09', source: { feed: 't', kind: 'user' } };
  const coffee: Threat = { id: 'c1', name: 'Brazil coffee imports down', category: 'import_decline', kind: 'geopolitical', location: { lat: -10, lng: -55, regionId: 'brazil', iso3: 'BRA' }, commodities: [{ id: 'coffee', relevance: 1 }], severity: 0.4, start: '2026-09', status: 'breaking', source: { feed: 't', kind: 'live' } };
  it('a subscriber hears only about the commodities and threat types they chose, in their importer area', () => {
    const store = { subscriptions: [
      { email: 'eggs-ia@x.co', enabled: true, focus: 'Iowa', createdAt: '', filters: { focus: { kind: 'state' as const, ids: ['IA'] }, commodities: ['eggs'], families: [] } },
      { email: 'trade@x.co', enabled: true, focus: 'United States', createdAt: '', filters: { focus: { kind: 'us' as const, ids: [] }, commodities: [], families: ['geopolitical'] } },
      { email: 'all@x.co', enabled: true, focus: 'United States', createdAt: '', filters: { focus: { kind: 'us' as const, ids: [] }, commodities: [], families: [] } },
    ], seen: [], pending: [] };
    const out = diffNewThreats([egg, coffee], ctx, store);
    const byEmail = (e: string) => out.filter((p) => p.email === e).map((p) => p.threatId).sort();
    expect(byEmail('eggs-ia@x.co')).toEqual(['e1']);
    expect(byEmail('trade@x.co')).toEqual(['c1']);
    expect(byEmail('all@x.co')).toEqual(['c1', 'e1']);
  });
  it('weekly digests wait for their interval; immediate alerts go every run', async () => {
    const sent: string[] = [];
    const mailer = { async send(to: string, subject: string) { sent.push(`${to}|${subject}`); } };
    const store = { subscriptions: [
      { email: 'now@x.co', enabled: true, focus: 'United States', createdAt: '', frequency: 'immediate' as const },
      { email: 'weekly@x.co', enabled: true, focus: 'United States', createdAt: '', frequency: 'weekly' as const, lastSentAt: '2026-09-04T00:00:00.000Z' },
    ], seen: [], pending: [
      { email: 'now@x.co', threatId: 'e1', name: 'Iowa layers', at: '', sent: false },
      { email: 'weekly@x.co', threatId: 'e1', name: 'Iowa layers', at: '', sent: false },
    ] };
    const n1 = await deliver(store, mailer, 'http://x', new Date('2026-09-06T00:00:00Z'));
    expect(n1).toBe(1);
    expect(sent[0]).toContain('now@x.co');
    expect(store.pending.find((p) => p.email === 'weekly@x.co')!.sent).toBe(false);
    const n2 = await deliver(store, mailer, 'http://x', new Date('2026-09-12T00:00:00Z'));
    expect(n2).toBe(1);
    expect(sent[1]).toContain('weekly digest');
    expect(store.subscriptions[1]!.lastSentAt).toBe('2026-09-12T00:00:00.000Z');
  });
});
