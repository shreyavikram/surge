import { Hono } from 'hono';

/** Build the Hono app. Routes are mounted in Task 5; for now just health. */
export function createApp(): Hono {
  const app = new Hono();
  app.get('/api/health', (c) => c.json({ ok: true }));
  return app;
}
