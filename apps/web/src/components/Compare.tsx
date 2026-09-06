import { useMemo } from 'react';
import type { EngineContext } from '@surge/engine';
import { runScenario, compareScenarios, areaLoss, commodityName, tabToScenario, focusAreas, type ThreatEntry } from '../engine.js';
import type { TabDef, Focus } from '../state.js';
import { LIVE_TAB } from '../state.js';
import { compactUsd } from '../format.js';
import { Info } from './Info.js';

interface Props { ctx: EngineContext; tabs: TabDef[]; base: ThreatEntry[]; entriesFor: (t: TabDef) => ThreatEntry[]; focus: Focus; onClose: () => void }

/** Welfare loss across scenarios, including Live, on the joint price vector of each scenario. */
export function Compare({ ctx, tabs, entriesFor, focus, onClose }: Props) {
  const rows = useMemo(() => {
    const all = [LIVE_TAB, ...tabs];
    // scenarios are forward-looking: historical replays stay out of the joint set, and the windows start now
    const results = all.map((t) => runScenario(tabToScenario(t, entriesFor(t).filter((e) => e.origin !== 'replay')), ctx));
    const cmp = compareScenarios(results);
    const nowYm = new Date().toISOString().slice(0, 7);
    const plus12 = (() => { const [y, m] = nowYm.split('-').map(Number) as [number, number]; const t = y * 12 + (m - 1) + 12; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; })();
    return cmp.map((r, i) => {
      const res = results[i]!;
      const areas = focusAreas(focus, ctx);
      const parts = areas.map((a) => areaLoss(res.impact, a.id, ctx));
      const nationalTotal = res.impact.welfare.cv;
      const scale = parts.length && nationalTotal > 0 ? parts.reduce((s, p) => s + p.cv, 0) / nationalTotal : 1; // the focus area's share of the national loss
      const months = res.impact.months;
      const byMonth = res.impact.welfare.cvByMonth;
      const fromNow = byMonth.reduce((s, v, k) => s + ((months[k] ?? '') >= nowYm ? v : 0), 0) * scale;
      const next12 = byMonth.reduce((s, v, k) => s + ((months[k] ?? '') >= nowYm && (months[k] ?? '') < plus12 ? v : 0), 0) * scale;
      const producer = parts.length ? parts.reduce((s, p) => s + Object.values(p.producerRevenueChange).reduce((a, b) => a + b, 0), 0) : Object.values(res.impact.welfare.producerRevenueChange).reduce((a, b) => a + b, 0);
      return { ...r, cv: fromNow, annual: next12, producer, threats: res.scenario.threats.length };
    });
  }, [ctx, tabs, entriesFor, focus]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Compare scenarios</h3><button className="iconbtn" onClick={onClose}>×</button></div>
        <table className="tbl">
          <thead>
            <tr><th>Scenario</th><th className="r">Threats</th><th className="r">Next 12 months<Info term="cvAnnual" /></th><th className="r">Total from now<Info term="cv" /></th><th>Worst-hit</th><th className="r">Producer Δ<Info term="producer" /></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.scenarioId}>
                <td>{r.name}</td>
                <td className="r">{r.threats}</td>
                <td className="r" style={{ color: 'var(--bad)' }}>{compactUsd(r.annual)}</td>
                <td className="r" style={{ color: 'var(--bad)', fontWeight: 700 }}>{compactUsd(r.cv)}</td>
                <td>{r.worstCommodity ? commodityName(ctx, r.worstCommodity) : '—'}</td>
                <td className="r" style={{ color: r.producer >= 0 ? 'var(--good)' : 'var(--bad)' }}>{compactUsd(r.producer)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="subfig">Losses are computed jointly on each scenario's full set of threats{focus.kind !== 'us' ? ' and scaled to the focus area' : ''}.</div>
      </div>
    </div>
  );
}
