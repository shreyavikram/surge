import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { setCookie } from 'hono/cookie';
import type { EngineContext } from '@surge/engine';
import { rankThreats, interpretScenario, validateCandidate } from '@surge/engine';
import { loadContext, loadCase, CASE_IDS } from '@surge/config';
import { readEnv, type Env } from './env.js';
import { FeedRegistry } from './feeds/registry.js';
import { allAdapters } from './feeds/index.js';
import { threatsFromResults } from './threats.js';
import { priceStress, applyPriceStress } from './price-stress.js';
import { ANOMALY_SERIES } from './feeds/fred.js';
import { TRADE_THRESHOLDS } from './feeds/trade.js';
import { checkVetted, redactThreat } from './gate.js';
import { loadStore, subscribe, diffNewThreats, deliver, makeMailer } from './alerts.js';
import { proposeWithGemini, mergeCandidates } from './ai/llm.js';

export interface AppDeps {
  env: Env;
  ctx: EngineContext;
  registry: FeedRegistry;
}

export function createApp(deps: Partial<AppDeps> = {}): Hono {
  const env = deps.env ?? readEnv();
  const ctx = deps.ctx ?? loadContext();
  const registry = deps.registry ?? new FeedRegistry(allAdapters);
  const app = new Hono();

  app.use('/api/*', cors());

  app.get('/api/health', (c) => c.json({ ok: true, feeds: registry.healthRows().map(({ requiresKey: _k, note: _n, ...row }) => row) }));

  // Config bundle for the browser engine (so the web can run without bundling config).
  app.get('/api/context', (c) => c.json({
    commodities: ctx.commodities, inputs: ctx.inputs, regions: ctx.regions,
    plate: ctx.plate, levers: ctx.levers, threatTypes: ctx.threatTypes,
    population: ctx.population, totalExpenditure: ctx.totalExpenditure, consumerUnits: ctx.consumerUnits,
  }));

  // Live + snapshot threats, priced and ranked, with gate redaction.
  app.get('/api/threats', async (c) => {
    const feeds = registry.list().filter((a) => a.producesThreats !== false);
    const [results, fred] = await Promise.all([Promise.all(feeds.map((a) => registry.get(a.id, env))), registry.get('fred', env)]);
    const stress = priceStress(fred.series, ANOMALY_SERIES);
    const joined = results.map((r) => ({ ...r, items: applyPriceStress(r.items, stress) }));
    const vetted = checkVetted(c.req.header('cookie'), c.req.header('x-surge-vetted'), env.SURGE_VETTED_KEY);
    const threats = threatsFromResults(joined, ctx).map((t) => redactThreat(t, vetted));
    const ranked = rankThreats(threats, ctx).filter((r) => r.cv > 0);
    return c.json({ threats: ranked, feeds: registry.healthRows(), vetted });
  });

  // FAO-style price stress per commodity (BLS retail prices via FRED) and the Census import declines behind it.
  app.get('/api/price-stress', async (c) => {
    const [fred, trade] = await Promise.all([registry.get('fred', env), registry.get('trade', env)]);
    const indicators = priceStress(fred.series, ANOMALY_SERIES);
    const raw = (trade.source.note ?? '').match(/latest month (\d{4}-\d{2})/);
    return c.json({
      method: 'FAO Indicator of Food Price Anomalies (compound quarterly and annual growth, standardised by calendar month, variance-weighted); ≥ 0.5 moderately high, ≥ 1 abnormally high',
      indicators,
      declines: trade.items.map((i) => ({ id: i.id, name: i.name, commodity: i.commodities?.[0]?.id, country: i.admin, iso3: i.iso3, severity: i.severity, status: i.status, summary: i.summary, raw: i.raw })),
      thresholds: TRADE_THRESHOLDS,
      latestTradeMonth: raw?.[1] ?? null,
      sources: { prices: fred.source, trade: trade.source },
    });
  });

  // Price/population series (FRED). :id is a series name (eggs, chicken, ...) or a raw FRED id.
  app.get('/api/series/:id', async (c) => {
    const id = c.req.param('id');
    const result = await registry.get('fred', env);
    const series = result.series ?? {};
    const s = series[id] ?? Object.values(series).find((_, i) => Object.keys(series)[i] === id);
    if (!s) return c.json({ error: `unknown series ${id}`, available: Object.keys(series) }, 404);
    return c.json({ id, ...s, source: result.source });
  });

  app.get('/api/cases', (c) => c.json({ cases: CASE_IDS.map((id) => loadCase(id)) }));

  // Typed scenario → threat candidates. Rule-based today; an LLM proposer can be added behind the same validator.
  app.post('/api/interpret', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: string };
    const text = (body.text ?? '').slice(0, 2000);
    const rules = interpretScenario(text, ctx).filter((k) => validateCandidate(k, ctx).length === 0);
    const llm = env.GEMINI_API_KEY ? await proposeWithGemini(text, ctx, env.GEMINI_API_KEY) : [];
    return c.json({ candidates: mergeCandidates(llm, rules), interpreter: llm.length > 0 ? 'gemini + rules (validated)' : 'rule-based' });
  });

  // Email alerts: subscribe, list pending, and (on each threats refresh) diff new threats against the store.
  app.post('/api/alerts', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { email?: string; enabled?: boolean; focus?: string; filters?: { focus?: { kind?: string; ids?: unknown }; commodities?: unknown; families?: unknown }; frequency?: string };
    if (!body.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return c.json({ error: 'valid email required' }, 400);
    const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string').slice(0, 100) : []);
    const kind = body.filters?.focus?.kind;
    const filters = body.filters ? { focus: { kind: (kind === 'state' || kind === 'district' ? kind : 'us') as 'us' | 'state' | 'district', ids: strings(body.filters.focus?.ids) }, commodities: strings(body.filters.commodities), families: strings(body.filters.families) } : undefined;
    const frequency = body.frequency === 'weekly' || body.frequency === 'monthly' ? body.frequency : 'immediate';
    const store = subscribe(body.email, body.enabled ?? true, body.focus ?? 'United States', undefined, { ...(filters ? { filters } : {}), frequency });
    return c.json({ ok: true, subscriptions: store.subscriptions.length, delivery: env.RESEND_API_KEY ? 'resend' : env.SMTP_URL ? 'smtp' : 'queued (no mail provider set)' });
  });
  app.get('/api/alerts', (c) => { const s = loadStore(); return c.json({ subscriptions: s.subscriptions.map((x) => ({ email: x.email.replace(/(.).+(@.*)/, '$1***$2'), focus: x.focus, enabled: x.enabled, frequency: x.frequency ?? 'immediate', filters: x.filters })), pending: s.pending.filter((p) => !p.sent).length, delivery: env.RESEND_API_KEY ? 'resend' : env.SMTP_URL ? 'smtp' : 'queued' }); });
  app.post('/api/alerts/run', async (c) => {
    const feeds = registry.list().filter((a) => a.producesThreats !== false);
    const results = await Promise.all(feeds.map((a) => registry.get(a.id, env)));
    const threats = threatsFromResults(results, ctx);
    const store = loadStore();
    const fresh = diffNewThreats(threats, ctx, store);
    const sent = await deliver(store, await makeMailer(env.SMTP_URL, env.RESEND_API_KEY), env.PUBLIC_URL ?? 'http://localhost:5173');
    return c.json({ newAlerts: fresh.length, sent });
  });

  app.post('/api/vetted', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { key?: string };
    const ok = !!env.SURGE_VETTED_KEY && body.key === env.SURGE_VETTED_KEY;
    if (ok) setCookie(c, 'surge_vetted', env.SURGE_VETTED_KEY!, { httpOnly: true, sameSite: 'Lax', path: '/' });
    return c.json({ vetted: ok });
  });

  return app;
}
