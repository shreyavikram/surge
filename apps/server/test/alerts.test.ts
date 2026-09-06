import { describe, it, expect } from 'vitest';
import { makeMailer, diffNewThreats, deliver, AlertStore, memoryBackend, upstashBackend, subscribe, confirmSubscription } from '../src/alerts.js';
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
    const store = { subscriptions: [{ email: 'ia@x.co', enabled: true, focus: 'Iowa', createdAt: '' }, { email: 'ny@x.co', enabled: true, focus: 'New York', createdAt: '' }], seen: ['baseline'], pending: [] };
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
    ], seen: ['baseline'], pending: [] };
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

describe('alert store', () => {
  const ctx = loadContext();
  const t: Threat = { id: 'n9', name: 'Iowa layers', category: 'disease', kind: 'natural', location: { lat: 42, lng: -93.5, regionId: 'us-iowa' }, commodities: [{ id: 'eggs', relevance: 1 }], severity: 0.3, start: '2026-09', source: { feed: 't', kind: 'user' } };
  it('the first run on an empty store is a baseline: nothing is alerted, everything is marked seen', () => {
    const store = { subscriptions: [{ email: 'a@x.co', enabled: true, focus: 'United States', createdAt: '' }], seen: [], pending: [] };
    expect(diffNewThreats([t], ctx, store)).toEqual([]);
    expect(store.seen).toEqual(['n9']);
    const t2 = { ...t, id: 'n10' };
    expect(diffNewThreats([t, t2], ctx, store).map((p) => p.threatId)).toEqual(['n10']);
  });
  it('subscribe replaces an earlier subscription for the same address and keeps its last-sent time', () => {
    const store = { subscriptions: [{ email: 'a@x.co', enabled: true, focus: 'Iowa', createdAt: '', lastSentAt: '2026-09-01T00:00:00.000Z' }], seen: ['x'], pending: [] };
    const sub = subscribe(store, 'a@x.co', true, 'Texas', { frequency: 'weekly' });
    expect(store.subscriptions.length).toBe(1);
    expect(sub.focus).toBe('Texas');
    expect(sub.lastSentAt).toBe('2026-09-01T00:00:00.000Z');
  });
  it('persists through the Upstash REST API when configured', async () => {
    const kv = new Map<string, string>();
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const [cmd, key, value] = JSON.parse(String(init?.body)) as [string, string, string?];
      if (cmd === 'SET') { kv.set(key, value!); return new Response(JSON.stringify({ result: 'OK' })); }
      return new Response(JSON.stringify({ result: kv.get(key) ?? null }));
    }) as unknown as typeof fetch;
    const backend = upstashBackend('https://kv.example', 'tok', fetchImpl);
    const st = await AlertStore.open(backend);
    expect(st.data.subscriptions).toEqual([]);
    subscribe(st.data, 'a@x.co', true, 'United States');
    await st.save();
    const again = await AlertStore.open(backend);
    expect(again.data.subscriptions[0]!.email).toBe('a@x.co');
    const mem = await AlertStore.open(memoryBackend());
    expect(mem.backend.name).toBe('memory');
  });
  it('confirms a subscription with the threats that already match', async () => {
    const sent: string[] = [];
    const mailer = { async send(to: string, subject: string, body: string) { sent.push(`${to}|${subject}|${body}`); } };
    const sub = { email: 'a@x.co', enabled: true, focus: 'Iowa', createdAt: '', filters: { focus: { kind: 'state' as const, ids: ['IA'] }, commodities: ['eggs'], families: [] } };
    const r = await confirmSubscription(sub, [t], ctx, mailer, 'http://x');
    expect(r.sent).toBe(true);
    expect(r.matches).toBe(1);
    expect(sent[0]).toContain('you are subscribed');
    expect(sent[0]).toContain('Iowa layers');
    const none = await confirmSubscription(sub, [t], ctx, null, 'http://x');
    expect(none.sent).toBe(false);
  });
});
