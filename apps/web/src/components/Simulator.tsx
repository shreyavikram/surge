import { useMemo, useState } from 'react';
import type { EngineContext, Threat, ThreatCategory, Scenario, ScenarioResult } from '@surge/engine';
import { runThreat, runScenario, compareScenarios, CATEGORY_LABEL, categoryColor, commodityName } from '../engine.js';
import { compactUsd, pct } from '../format.js';
import { useScenarios } from '../state.js';
import { Chip } from './Chip.js';
import { Impact } from './Impact.js';
import { Relief } from './Relief.js';
import { Plate } from './Plate.js';

const CATEGORIES: ThreatCategory[] = [
  'disease', 'drought', 'heat', 'flood', 'storm', 'wildfire', 'pest',
  'tariff', 'export_ban', 'embargo', 'war', 'instability', 'chokepoint', 'input_cost', 'facility',
];

type Tab = 'impact' | 'plate' | 'relief';

export function Simulator({ ctx }: { ctx: EngineContext; theme: 'dark' | 'light' }) {
  const commodityIds = useMemo(() => [...Object.keys(ctx.commodities), ...Object.keys(ctx.inputs)], [ctx]);
  const regionIds = useMemo(() => Object.keys(ctx.regions), [ctx]);

  const [category, setCategory] = useState<ThreatCategory>('drought');
  const [regionId, setRegionId] = useState('us-california-central-valley');
  const [commodityId, setCommodityId] = useState('lettuce');
  const [severity, setSeverity] = useState(0.5);
  const [months, setMonths] = useState(12);
  const [tab, setTab] = useState<Tab>('impact');
  const [name, setName] = useState('');

  const { scenarios, save, remove } = useScenarios();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const draft = useMemo<Threat>(() => {
    const region = ctx.regions[regionId]!;
    const c = ctx.commodities[commodityId];
    const t: Threat = {
      id: 'draft',
      name: `${CATEGORY_LABEL[category]} — ${commodityName(ctx, commodityId)}`,
      category,
      kind: ctx.threatTypes[category]?.kind ?? 'natural',
      location: { lat: region.lat, lng: region.lng, admin: region.name, regionId },
      commodities: [{ id: commodityId, relevance: 1 }],
      severity,
      start: '2026-09',
      months,
      source: { feed: 'Simulator (user-defined)', kind: 'user' },
    };
    // Disease needs a physical head-count; treat severity as the share of national inventory affected.
    if (category === 'disease' && c?.supply.model === 'livestock' && c.supply.nationalInventory) {
      t.physical = { kind: 'animals_affected', value: c.supply.nationalInventory };
    }
    return t;
  }, [ctx, category, regionId, commodityId, severity, months]);

  const run = useMemo(() => runThreat(draft, ctx, severity), [draft, ctx, severity]);
  const shocked = new Set(run.impact.commodities);
  const cv = run.impact.welfare.cv;

  const doSave = () => {
    const now = new Date().toISOString();
    const s: Scenario = {
      id: `sim-${Date.now()}`,
      name: name.trim() || draft.name,
      threats: [{ ...draft, id: `sim-${Date.now()}-t` }],
      createdAt: now, updatedAt: now,
    };
    save(s);
    setName('');
  };

  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const compareRows = useMemo(() => {
    const chosen = scenarios.filter((s) => selected.has(s.id));
    if (chosen.length < 2) return null;
    const results: ScenarioResult[] = chosen.map((s) => runScenario(s, ctx));
    return compareScenarios(results);
  }, [scenarios, selected, ctx]);

  const region = ctx.regions[regionId]!;

  return (
    <div className="body">
      <div className="watchlist" style={{ width: 360 }}>
        <div className="wl-head">
          <div className="wl-title">Build a threat</div>
          <div className="wl-sub">dial severity — the engine recomputes instantly</div>
        </div>
        <div style={{ padding: 12, overflowY: 'auto' }}>
          <div className="sim-form">
            <div className="field">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as ThreatCategory)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Region</label>
              <select value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                {regionIds.map((r) => <option key={r} value={r}>{ctx.regions[r]!.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Commodity</label>
              <select value={commodityId} onChange={(e) => setCommodityId(e.target.value)}>
                {commodityIds.map((id) => <option key={id} value={id}>{commodityName(ctx, id)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Severity — {pct(severity, 0)}</label>
              <input type="range" min={0} max={1} step={0.05} value={severity} onChange={(e) => setSeverity(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Duration — {months} months</label>
              <input type="range" min={1} max={24} step={1} value={months} onChange={(e) => setMonths(Number(e.target.value))} />
            </div>
            <hr className="hr" />
            <div className="field">
              <label>Save as scenario</label>
              <input type="text" placeholder={draft.name} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <button className="btn" onClick={doSave}>Save scenario</button>
          </div>

          <div style={{ marginTop: 18 }}>
            <div className="wl-title" style={{ marginBottom: 6 }}>Saved scenarios</div>
            {scenarios.length === 0 && <div className="faint">None yet. Build one and save it, then tick two to compare.</div>}
            {scenarios.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{s.name}</div>
                  <div className="faint" style={{ fontSize: 11 }}>{compactUsd(runScenario(s, ctx).impact.welfare.cv)}</div>
                </div>
                <button className="iconbtn" title="Delete" onClick={() => { remove(s.id); setSelected((p) => { const n = new Set(p); n.delete(s.id); return n; }); }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="drawer" style={{ flex: 1, width: 'auto', borderLeft: 0 }}>
        <div className="dr-head">
          <div className="dr-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="dot" style={{ background: categoryColor(category) }} />
            {draft.name}
            <Chip kind="seed" title="User-defined draft threat">draft</Chip>
          </div>
          <div className="dr-sub">
            {region.name} · severity {pct(severity, 0)} · {months} mo · headline loss <strong style={{ color: 'var(--bad)' }}>{compactUsd(cv)}</strong>
          </div>
        </div>

        {compareRows ? (
          <div className="dr-body">
            <div className="section">
              <h4>Compare scenarios</h4>
              <table className="tbl">
                <thead>
                  <tr><th>Scenario</th><th className="r">Consumer loss</th><th>Worst-hit</th><th className="r">Relief cost</th><th className="r">Recover</th></tr>
                </thead>
                <tbody>
                  {compareRows.map((r) => (
                    <tr key={r.scenarioId}>
                      <td>{r.name}</td>
                      <td className="r" style={{ color: 'var(--bad)', fontWeight: 700 }}>{compactUsd(r.totalCV)}</td>
                      <td>{r.worstCommodity ? commodityName(ctx, r.worstCommodity) : '—'}</td>
                      <td className="r">{compactUsd(r.mitigationCost)}</td>
                      <td className="r">{r.timeToRecoverMonths === null ? '—' : `${r.timeToRecoverMonths} mo`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="subfig" style={{ marginTop: 8 }}>Untick scenarios on the left to return to the live draft.</div>
            </div>
          </div>
        ) : (
          <>
            <div className="tabs">
              <button className={tab === 'impact' ? 'on' : ''} onClick={() => setTab('impact')}>Impact</button>
              <button className={tab === 'plate' ? 'on' : ''} onClick={() => setTab('plate')}>Plate</button>
              <button className={tab === 'relief' ? 'on' : ''} onClick={() => setTab('relief')}>Relief</button>
            </div>
            <div className="dr-body">
              {cv <= 0 && (
                <div className="section">
                  <p className="muted">
                    This combination produces no shock: {CATEGORY_LABEL[category]} in {region.name} has no modeled path to {commodityName(ctx, commodityId)}.
                    Weather hits US production regions; trade and chokepoint threats hit importing/exporting regions. Try eggs + disease, lettuce + drought in California, or rice + export ban in India.
                  </p>
                </div>
              )}
              {tab === 'impact' && <Impact impact={run.impact} ctx={ctx} />}
              {tab === 'plate' && <Plate ctx={ctx} shocked={shocked} />}
              {tab === 'relief' && <Relief mitigation={run.mitigation} impact={run.impact} ctx={ctx} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
