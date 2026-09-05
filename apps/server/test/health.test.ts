import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app.js';

describe('server', () => {
  it('responds ok on /api/health with a feeds array', async () => {
    const app = createApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.feeds)).toBe(true);
  });
});
