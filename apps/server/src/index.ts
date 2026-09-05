import { serve } from '@hono/node-server';
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
