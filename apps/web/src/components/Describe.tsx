import { useState } from 'react';
import { Spinner } from './Spinner.js';
import type { EngineContext } from '@surge/engine';
import { interpretScenario, candidateToThreat, commodityName, CATEGORY_LABEL, type ThreatCandidate, type Threat } from '../engine.js';
import { pct } from '../format.js';

/** Type a scenario; the interpreter proposes affected commodities, region, severity, and duration; add what you like. */
export function Describe({ ctx, onAdd }: { ctx: EngineContext; onAdd: (t: Threat) => void }) {
  const [text, setText] = useState('');
  const [cands, setCands] = useState<ThreatCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    let list: ThreatCandidate[] = [];
    try {
      const r = await fetch('/api/interpret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      if (r.ok) list = ((await r.json()) as { candidates: ThreatCandidate[] }).candidates;
    } catch { /* offline: fall through to the local interpreter */ }
    if (list.length === 0) list = interpretScenario(text, ctx);
    setCands(list); setBusy(false);
  };
  const edit = (i: number, patch: Partial<ThreatCandidate>) => setCands((p) => p ? p.map((c, k) => (k === i ? { ...c, ...patch } : c)) : p);
  return (
    <div className="describe">
      <div className="describe-row">
        <input type="text" placeholder="Describe a scenario: “Iran closes Hormuz for 3 months, cutting fertilizer shipments 60%”" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) void run(); }} />
        {busy && <Spinner label="Reading your scenario…" />}
        <button className="btn" disabled={!text.trim() || busy} onClick={() => void run()}>Interpret</button>
      </div>
      {cands && cands.length === 0 && <div className="faint" style={{ padding: '6px 0' }}>Nothing in that text maps to a commodity, region, or threat type.</div>}
      {cands && cands.map((c, i) => (
        <div className="cand" key={i}>
          <div className="cand-head">
            <b>{CATEGORY_LABEL[c.category]}</b> · {ctx.regions[c.regionId]?.name} · <span className="faint">{c.source} · matched: {c.matched.join(', ')}</span>
          </div>
          <div className="cand-comms">
            {c.commodities.map((x) => (
              <label key={x.id} className="pill on small" title="Untick to drop">
                <input type="checkbox" checked onChange={() => edit(i, { commodities: c.commodities.filter((y) => y.id !== x.id) })} /> {commodityName(ctx, x.id)}
              </label>
            ))}
          </div>
          <div className="cand-dials">
            <label>{c.category === 'tariff' ? 'Rate' : 'Severity'} <b>{pct(c.severity, 0)}</b><input type="range" min={0} max={1} step={0.01} value={c.severity} onChange={(e) => edit(i, { severity: Number(e.target.value) })} /></label>
            <label>Duration, months<input className="num" type="number" min={1} step={1} value={c.months} onChange={(e) => edit(i, { months: Math.max(1, Math.round(Number(e.target.value) || 1)) })} /></label>
          </div>
          <div className="cand-actions">
            <button className="btn" disabled={c.commodities.length === 0} onClick={() => { onAdd(candidateToThreat(c, ctx, `user-${Date.now()}-${i}`, new Date().toISOString().slice(0, 7))); setCands((p) => { const rest = p ? p.filter((_, k) => k !== i) : []; return rest.length > 0 ? rest : null; }); setText(''); }}>Add to scenario</button>
          </div>
        </div>
      ))}
    </div>
  );
}
