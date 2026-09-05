import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { setCookie } from 'hono/cookie';
import type { EngineContext } from '@surge/engine';
import { rankThreats } from '@surge/engine';
import { loadContext, loadCase, CASE_IDS } from '@surge/config';
import { readEnv, type Env } from './env.js';
import { FeedRegistry } from './feeds/registry.js';
import { allAdapters } from './feeds/index.js';
import { threatsFromResults } from './threats.js';
import { checkVetted, redactThreat } from './gate.js';

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

  app.get('/api/health', (c) => c.json({ ok: true, feeds: registry.healthRows() }));

  // Config bundle for the browser engine (so the web can run without bundling config).
  app.get('/api/context', (c) => c.json({
    commodities: ctx.commodities, inputs: ctx.inputs, regions: ctx.regions,
    plate: ctx.plate, levers: ctx.levers, threatTypes: ctx.threatTypes,
    population: ctx.population, totalExpenditure: ctx.totalExpenditure, consumerUnits: ctx.consumerUnits,
  }));

  // Live + snapshot threats, priced and ranked, with gate redaction.
  app.get('/api/threats', async (c) => {
    const feeds = registry.list().filter((a) => a.producesThreats !== false);
    const results = await Promise.all(feeds.map((a) => registry.get(a.id, env)));
    const vetted = checkVetted(c.req.header('cookie'), c.req.header('x-surge-vetted'), env.SURGE_VETTED_KEY);
    const threats = threatsFromResults(results, ctx).map((t) => redactThreat(t, vetted));
    const ranked = rankThreats(threats, ctx).filter((r) => r.cv > 0);
    return c.json({ threats: ranked, feeds: registry.healthRows(), vetted });
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

  app.post('/api/vetted', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { key?: string };
    const ok = !!env.SURGE_VETTED_KEY && body.key === env.SURGE_VETTED_KEY;
    if (ok) setCookie(c, 'surge_vetted', env.SURGE_VETTED_KEY!, { httpOnly: true, sameSite: 'Lax', path: '/' });
    return c.json({ vetted: ok });
  });

  return app;
}
