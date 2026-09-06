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
  const monthlyBaseline = Math.max(1e-9, (ctx.commodities[plan.commodity]?.baseline.annualQuantity ?? 0) / 12);
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
        <h4>Supply compared with normal<Info term="shortfall" /> <span className="faint">· {plan.offset ? 'price-equivalent for a tariff' : unit + ' per month'}</span></h4>
        <LineChart
          months={months}
          series={[
            { label: 'without relief', values: plan.gap.map((g) => 1 - g / monthlyBaseline), color: 'var(--text-faint)', dashed: true },
            { label: 'supply', values: plan.gap.map((g, t) => 1 - Math.max(0, g - (plan.covered[t] ?? 0)) / monthlyBaseline), color: 'var(--bad)' },
          ]}
          baseline={{ value: 1, label: 'normal supply' }}
          yFormat={(y) => `${Math.round(y * 100)}%`}
          height={170}
        />
        <div className="legend-inline"><span><i style={{ background: 'var(--bad)' }} /> supply with relief</span><span><i style={{ background: 'var(--text-faint)' }} /> without relief</span></div>
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
