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

const FILE = fileURLToPath(new URL('../../../data/alerts.json', import.meta.url));

export function loadStore(): Store {
  if (!existsSync(FILE)) return { subscriptions: [], seen: [], pending: [] };
  try { return JSON.parse(readFileSync(FILE, 'utf8')) as Store; } catch { return { subscriptions: [], seen: [], pending: [] }; }
}
export function saveStore(s: Store): void {
  const dir = FILE.slice(0, FILE.lastIndexOf('/'));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(FILE, JSON.stringify(s, null, 2));
}

export function subscribe(email: string, enabled: boolean, focus: string, store = loadStore(), prefs: { filters?: AlertFilters; frequency?: AlertFrequency } = {}): Store {
  const prev = store.subscriptions.find((s) => s.email === email);
  const rest = store.subscriptions.filter((s) => s.email !== email);
  const sub: Subscription = { email, enabled, focus, createdAt: new Date().toISOString() };
  if (prefs.filters) sub.filters = prefs.filters;
  if (prefs.frequency) sub.frequency = prefs.frequency;
  if (prev?.lastSentAt) sub.lastSentAt = prev.lastSentAt;
  store.subscriptions = [...rest, sub];
  saveStore(store);
  return store;
}

/** Threats not seen before that reach a subscriber's focus (a state name, district id, or "United States"). */
export function diffNewThreats(threats: Threat[], ctx: EngineContext, store: Store): PendingAlert[] {
  const seen = new Set(store.seen);
  const fresh = threats.filter((t) => !seen.has(t.id));
  const out: PendingAlert[] = [];
  const at = new Date().toISOString();
  for (const sub of store.subscriptions.filter((s) => s.enabled)) {
    for (const t of fresh) {
      if (!matchesSubscription(t, sub, ctx)) continue;
      out.push({ email: sub.email, threatId: t.id, name: t.name, at, sent: false });
    }
  }
  store.seen = [...seen, ...fresh.map((t) => t.id)].slice(-5000);
  store.pending = [...store.pending, ...out].slice(-500);
  saveStore(store);
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
  saveStore(store);
  return n;
}

export { getArea };
