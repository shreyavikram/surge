import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { EngineContext, Threat } from '@surge/engine';
import { threatAffectsArea, getArea, categoryFamily } from '@surge/engine';

/** Email alert subscriptions and the new-threat diff. Delivery uses SMTP_URL when set; otherwise alerts queue. */
export type AlertFrequency = 'immediate' | 'weekly' | 'monthly';
/** The same filters as the watchlist: importer area(s), commodities, threat families. Empty lists mean "all". */
export interface AlertFilters { focus: { kind: 'us' | 'state' | 'district'; ids: string[] }; commodities: string[]; families: string[] }
export interface Subscription { email: string; enabled: boolean; focus: string; filters?: AlertFilters; frequency?: AlertFrequency; lastSentAt?: string; createdAt: string }
export const DIGEST_DAYS: Record<AlertFrequency, number> = { immediate: 0, weekly: 7, monthly: 30 };
export interface PendingAlert { email: string; threatId: string; name: string; at: string; sent: boolean }
interface Store { subscriptions: Subscription[]; seen: string[]; pending: PendingAlert[] }

interface Store { subscriptions: Subscription[]; seen: string[]; pending: PendingAlert[] }
export type { Store as AlertStoreData };
export const emptyStore = (): Store => ({ subscriptions: [], seen: [], pending: [] });

/**
 * Where subscriptions live. Render's free instances have no disk, so a file there is wiped by every deploy;
 * with UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN set (free tier) the store survives deploys.
 */
export interface StoreBackend { name: string; load(): Promise<Store>; save(s: Store): Promise<void> }

const FILE = fileURLToPath(new URL('../../../data/alerts-store.json', import.meta.url));
export function fileBackend(file = FILE): StoreBackend {
  return {
    name: 'file',
    async load() {
      if (!existsSync(file)) return emptyStore();
      try { return { ...emptyStore(), ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<Store>) }; } catch { return emptyStore(); }
    },
    async save(s) {
      const dir = file.slice(0, file.lastIndexOf('/'));
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(s, null, 2));
    },
  };
}
export function memoryBackend(initial: Store = emptyStore()): StoreBackend {
  let data = initial;
  return { name: 'memory', async load() { return data; }, async save(s) { data = s; } };
}
/** Upstash Redis over its REST API (one key holding the JSON store). */
export function upstashBackend(url: string, token: string, fetchImpl: typeof fetch = fetch, key = 'greenfield:alerts'): StoreBackend {
  const call = async (cmd: unknown[]): Promise<unknown> => {
    const res = await fetchImpl(url.replace(/\/$/, ''), { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
    if (!res.ok) throw new Error(`upstash ${res.status}: ${(await res.text()).slice(0, 120)}`);
    return ((await res.json()) as { result?: unknown }).result;
  };
  return {
    name: 'upstash',
    async load() {
      const raw = await call(['GET', key]);
      if (typeof raw !== 'string' || !raw) return emptyStore();
      try { return { ...emptyStore(), ...(JSON.parse(raw) as Partial<Store>) }; } catch { return emptyStore(); }
    },
    async save(s) { await call(['SET', key, JSON.stringify(s)]); },
  };
}

/** The in-memory working copy plus its backend; call save() after every change. */
export class AlertStore {
  constructor(public backend: StoreBackend, public data: Store = emptyStore()) {}
  static async open(backend: StoreBackend): Promise<AlertStore> {
    const st = new AlertStore(backend);
    try { st.data = await backend.load(); } catch (e) { console.error(`alert store (${backend.name}) failed to load: ${(e as Error).message}`); }
    return st;
  }
  /** Picks Upstash when configured, else the local file. */
  static async fromEnv(env: { UPSTASH_REDIS_REST_URL?: string; UPSTASH_REDIS_REST_TOKEN?: string }): Promise<AlertStore> {
    const backend = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? upstashBackend(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN) : fileBackend();
    return AlertStore.open(backend);
  }
  async save(): Promise<void> { await this.backend.save(this.data); }
}

export function subscribe(store: Store, email: string, enabled: boolean, focus: string, prefs: { filters?: AlertFilters; frequency?: AlertFrequency } = {}): Subscription {
  const prev = store.subscriptions.find((s) => s.email === email);
  const rest = store.subscriptions.filter((s) => s.email !== email);
  const sub: Subscription = { email, enabled, focus, createdAt: new Date().toISOString() };
  if (prefs.filters) sub.filters = prefs.filters;
  if (prefs.frequency) sub.frequency = prefs.frequency;
  if (prev?.lastSentAt) sub.lastSentAt = prev.lastSentAt;
  store.subscriptions = [...rest, sub];
  return sub;
}

/** Threats not seen before that reach a subscriber's focus (a state name, district id, or "United States"). */
export function diffNewThreats(threats: Threat[], ctx: EngineContext, store: Store): PendingAlert[] {
  const seen = new Set(store.seen);
  const at = new Date().toISOString();
  // first run on a fresh store: everything on the map is the baseline, not news to anyone
  if (seen.size === 0 && threats.length > 0) { store.seen = threats.map((t) => t.id).slice(-5000); return []; }
  const fresh = threats.filter((t) => !seen.has(t.id));
  const out: PendingAlert[] = [];
  for (const sub of store.subscriptions.filter((s) => s.enabled)) {
    for (const t of fresh) {
      if (!matchesSubscription(t, sub, ctx)) continue;
      out.push({ email: sub.email, threatId: t.id, name: t.name, at, sent: false });
    }
  }
  store.seen = [...seen, ...fresh.map((t) => t.id)].slice(-5000);
  store.pending = [...store.pending, ...out].slice(-500);
  return out;
}

/** A threat reaches a subscriber when it touches one of their importer areas and matches their commodity and family filters. */
export function matchesSubscription(t: Threat, sub: Subscription, ctx: EngineContext): boolean {
  const f = sub.filters;
  const areas = f && f.focus.kind !== 'us'
    ? f.focus.ids.map((id) => ctx.focus?.areas.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a)
    : [ctx.focus?.areas.find((a) => a.name === sub.focus || a.id === sub.focus)].filter((a): a is NonNullable<typeof a> => !!a);
  if (areas.length > 0 && ctx.focus && !areas.some((a) => threatAffectsArea(t, a, ctx.focus!))) return false;
  if (f && f.commodities.length > 0 && !t.commodities.some((c) => f.commodities.includes(c.id))) return false;
  if (f && f.families.length > 0 && !f.families.includes(categoryFamily(t.category))) return false;
  return true;
}

export interface Mailer { send(to: string, subject: string, body: string): Promise<void> }

/** Resend's HTTP API when RESEND_API_KEY is set; else nodemailer over SMTP_URL; else a queue-only (null) mailer. */
export async function makeMailer(smtpUrl: string | undefined, resendKey?: string, fetchImpl: typeof fetch = fetch): Promise<Mailer | null> {
  const from = process.env['ALERT_FROM'] ?? 'Greenfield <onboarding@resend.dev>';
  if (resendKey) {
    return {
      async send(to, subject, body) {
        const res = await fetchImpl('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to, subject, text: body }) });
        if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      },
    };
  }
  if (!smtpUrl) return null;
  try {
    const nm = await import('nodemailer');
    const transport = nm.createTransport(smtpUrl);
    return { async send(to, subject, body) { await transport.sendMail({ from, to, subject, text: body }); } };
  } catch { return null; }
}

/** Immediate subscribers get every run; weekly and monthly subscribers get one digest once their interval has passed. */
export async function deliver(store: Store, mailer: Mailer | null, publicUrl: string, now: Date = new Date()): Promise<number> {
  if (!mailer) return 0;
  let n = 0;
  const byEmail = new Map<string, PendingAlert[]>();
  for (const p of store.pending.filter((x) => !x.sent)) byEmail.set(p.email, [...(byEmail.get(p.email) ?? []), p]);
  for (const [email, list] of byEmail) {
    const sub = store.subscriptions.find((s) => s.email === email);
    const freq: AlertFrequency = sub?.frequency ?? 'immediate';
    const days = DIGEST_DAYS[freq];
    if (days > 0 && sub?.lastSentAt && now.getTime() - new Date(sub.lastSentAt).getTime() < days * 864e5) continue; // digest not due yet
    const label = freq === 'immediate' ? 'New threats' : freq === 'weekly' ? 'This week\'s new threats' : 'This month\'s new threats';
    const body = `${label} on Greenfield that match your alert filters:\n\n${list.map((p) => `• ${p.name}`).join('\n')}\n\n${publicUrl}`;
    const subject = freq === 'immediate' ? `Greenfield: ${list.length} new food-supply threat${list.length > 1 ? 's' : ''}` : `Greenfield ${freq} digest: ${list.length} new food-supply threat${list.length > 1 ? 's' : ''}`;
    try { await mailer.send(email, subject, body); list.forEach((p) => { p.sent = true; }); n += list.length; if (sub) sub.lastSentAt = now.toISOString(); } catch { /* stays pending */ }
  }
  return n;
}

export { getArea };

/** What a new subscriber gets straight away: proof that delivery works, and the threats that already match their filters. */
export async function confirmSubscription(sub: Subscription, threats: Threat[], ctx: EngineContext, mailer: Mailer | null, publicUrl: string): Promise<{ sent: boolean; reason?: string; matches: number }> {
  const matches = threats.filter((t) => matchesSubscription(t, sub, ctx));
  if (!mailer) return { sent: false, reason: 'no mail provider is configured on the server', matches: matches.length };
  const cadence = sub.frequency === 'weekly' ? 'a weekly digest' : sub.frequency === 'monthly' ? 'a monthly digest' : 'an email as each new threat appears';
  const lines = matches.slice(0, 12).map((t) => `• ${t.name}${t.summary ? ` — ${t.summary}` : ''}`);
  const body = `You are subscribed to Greenfield alerts: ${cadence}, filtered to ${sub.focus}${sub.filters?.commodities.length ? `, ${sub.filters.commodities.join(', ')}` : ', all commodities'}${sub.filters?.families.length ? `, ${sub.filters.families.join(', ')}` : ', all threat types'}.\n\n${matches.length ? `${matches.length} threat${matches.length > 1 ? 's' : ''} on the map match your filters right now:\n\n${lines.join('\n')}${matches.length > 12 ? `\n… and ${matches.length - 12} more` : ''}` : 'Nothing on the map matches your filters right now.'}\n\n${publicUrl}`;
  try { await mailer.send(sub.email, 'Greenfield: you are subscribed to food-supply alerts', body); return { sent: true, matches: matches.length }; }
  catch (e) { return { sent: false, reason: (e as Error).message, matches: matches.length }; }
}
