import { serve } from '@hono/node-server';
import { readFileSync } from 'node:fs';

// Load the repo-root .env into process.env when present (no dependency; values already set win).
try {
  const envPath = new URL('../../../.env', import.meta.url);
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^['"]|['"]$/g, '');
  }
} catch { /* no .env: keyed feeds serve snapshots */ }

import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { readEnv } from './env.js';
import { FeedRegistry } from './feeds/registry.js';
import { allAdapters } from './feeds/index.js';

import { AlertStore } from './alerts.js';

const env = readEnv();
const registry = new FeedRegistry(allAdapters);
registry.warm(env);
const alerts = await AlertStore.fromEnv(env);
console.log(`alert store: ${alerts.backend.name} (${alerts.data.subscriptions.length} subscriptions)`);
const app = createApp({ env, registry, alerts });
setInterval(() => registry.warm(env), 15 * 60 * 1000).unref();
// Alerts run every 30 minutes while the process is up; .github/workflows/alerts.yml also calls /api/alerts/run.
const runAlerts = (app as unknown as { runAlerts?: () => Promise<unknown> }).runAlerts;
if (runAlerts) setTimeout(() => { setInterval(() => { runAlerts().catch((e) => console.error(`alert run failed: ${(e as Error).message}`)); }, 30 * 60 * 1000).unref(); runAlerts().catch(() => undefined); }, 90 * 1000).unref();

// Serve the built web client when present (single-container deploy).
const distDir = fileURLToPath(new URL('../../web/dist/', import.meta.url));
if (existsSync(distDir)) {
  app.use('/*', serveStatic({ root: './apps/web/dist' }));
  app.get('/*', serveStatic({ path: './apps/web/dist/index.html' })); // SPA fallback
}

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`SURGE server on :${info.port}`);
});
