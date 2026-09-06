import type { EngineContext } from '@surge/engine';
import { type RankedEntry, commodityName } from '../engine.js';
import type { Focus } from '../state.js';
import { compactUsd, compactNum, pct } from '../format.js';
import { Chip } from './Chip.js';
import { Info } from './Info.js';
import { LineChart } from './LineChart.js';

const CLASS_STYLE: Record<string, string> = { 'does the work': 'does', contributes: 'contributes', marginal: 'marginal', unused: 'marginal' };

export function Relief({ entry, ctx }: { entry: RankedEntry; ctx: EngineContext; focus: Focus }) {
  const plans = Object.values(entry.mitigation).filter((p) => p.cumulativeGap > 0).sort((a, b) => b.cumulativeGap - a.cumulativeGap);
  const plan = plans[0];
  if (!plan) {
    return <div className="section"><h4>Relief</h4><div className="faint">No gap to close for this threat.</div></div>;
  }
  const active = plan.levers.filter((l) => l.classification !== 'unused');
  const months = entry.impact.months.slice(0, plan.gap.length);
  const unit = plan.unit;
  const fmtUnits = (v: number) => compactNum(v);
  return (
    <>
      <div className="section">
        <h4>Relief — {commodityName(ctx, plan.commodity)} {plan.offset && <Chip kind="modeled" title="No physical shortfall: this is the supply needed to return price to baseline">offset target<Info term="offset" /></Chip>}</h4>
        <div className="stat-grid">
          <div className="stat"><div className="lbl">{plan.offset ? 'Offset needed' : 'Cumulative gap'}<Info term={plan.offset ? 'offset' : 'shortfall'} /></div><div className="val">{fmtUnits(plan.cumulativeGap)}<span className="faint" style={{ fontSize: 11 }}> {unit}</span></div></div>
          <div className="stat"><div className="lbl">Relief cost</div><div className="val">{compactUsd(plan.totalCost)}</div></div>
          <div className="stat"><div className="lbl">Time to close</div><div className="val">{plan.timeToCloseMonths === null ? 'not closed' : `${plan.timeToCloseMonths} mo`}</div></div>
          <div className="stat"><div className="lbl">Left uncovered<Info term="coverage" /></div><div className="val">{pct(plan.uncoveredShare)}</div></div>
        </div>
      </div>

      <div className="section">
        <h4>Monthly gap and relief delivered <span className="faint">· {unit} per month</span></h4>
        <LineChart months={months} series={[{ label: 'gap', values: plan.gap, color: 'var(--bad)' }, { label: 'relief', values: plan.covered, color: 'var(--good)' }]} baseline={{ value: 0, label: 'no gap' }} yFormat={fmtUnits} yMin={0} />
        <div className="legend-inline"><span><i style={{ background: 'var(--bad)' }} /> gap</span><span><i style={{ background: 'var(--good)' }} /> relief delivered</span></div>
      </div>

      <div className="section">
        <h4>Coverage<Info term="coverage" /> <span className="faint">· share of each month's gap closed</span></h4>
        <LineChart months={months} series={[{ label: 'coverage', values: plan.coverage, color: 'var(--good)' }]} baseline={{ value: 1, label: 'fully closed' }} yFormat={(y) => `${Math.round(y * 100)}%`} yMin={0} />
      </div>

      <div className="section">
        <h4>Levers<Info term="lever" /></h4>
        {active.length === 0 ? (
          <div className="faint">No modeled levers for {commodityName(ctx, plan.commodity)} yet.</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Lever</th><th className="r">Lead</th><th className="r">Cost</th><th className="r">Share</th></tr></thead>
            <tbody>
              {active.map((l) => (
                <tr key={l.id}>
                  <td>
                    <a href={l.precedent.url} target="_blank" rel="noreferrer" title={l.precedent.note}>{l.name}</a>
                    <div><span className={`classif ${CLASS_STYLE[l.classification]}`}>{l.classification}</span></div>
                  </td>
                  <td className="r">{l.leadMonths} mo</td>
                  <td className="r">{l.cost > 0 ? compactUsd(l.cost) : '—'}</td>
                  <td className="r">{pct(l.reliefShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
