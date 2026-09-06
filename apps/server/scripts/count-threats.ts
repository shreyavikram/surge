import { createApp } from '../src/app.js';
const app = createApp();
const r = await app.request('/api/threats');
const d = (await r.json()) as { threats: { threat: { id: string; name: string; category: string; severity: number; status?: string }; cv: number }[]; feeds: { id: string; status: string; itemCount?: number }[] };
console.log('feeds:', d.feeds.map((f) => `${f.id}:${f.status}:${f.itemCount ?? 0}`).join('  '));
console.log('threats:', d.threats.length);
for (const t of d.threats.slice(0, 20)) console.log(`- ${t.threat.id} | ${t.threat.category} | sev ${t.threat.severity.toFixed(3)} | ${t.threat.status ?? 'active'} | $${(t.cv / 1e6).toFixed(0)}M | ${t.threat.name.slice(0, 60)}`);
