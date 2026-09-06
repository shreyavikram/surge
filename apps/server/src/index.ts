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

const env = readEnv();
const app = createApp();

// Serve the built web client when present (single-container deploy).
const distDir = fileURLToPath(new URL('../../web/dist/', import.meta.url));
if (existsSync(distDir)) {
  app.use('/*', serveStatic({ root: './apps/web/dist' }));
  app.get('/*', serveStatic({ path: './apps/web/dist/index.html' })); // SPA fallback
}

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`SURGE server on :${info.port}`);
});
