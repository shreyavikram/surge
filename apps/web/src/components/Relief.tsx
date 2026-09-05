import type { EngineContext, ImpactResult, MitigationPlan } from '@surge/engine';
import { commodityName } from '../engine.js';
import { compactUsd, compactNum, pct } from '../format.js';
import { Sparkline } from './Sparkline.js';

const CLASS_STYLE: Record<string, string> = {
  'does the work': 'does',
  contributes: 'contributes',
  marginal: 'marginal',
  unused: 'marginal',
};

export function Relief({ mitigation, ctx }: { mitigation: Record<string, MitigationPlan>; impact: ImpactResult; ctx: EngineContext }) {
  const plans = Object.values(mitigation).filter((p) => p.cumulativeGap > 0);
  const plan = plans.sort((a, b) => b.cumulativeGap - a.cumulativeGap)[0];

  if (!plan) {
    return (
      <div className="section">
        <h4>Relief</h4>
        <p className="muted">
          This threat raises prices without a physical shortfall to backfill (it is a cost or trade shock, not lost
          domestic production), so supply-side relief levers do not apply. The lever set targets physical shortfalls.
        </p>
      </div>
    );
  }

  const active = plan.levers.filter((l) => l.classification !== 'unused');

  return (
    <>
      <div className="section">
        <h4>Relief — {commodityName(ctx, plan.commodity)}</h4>
        <div className="stat-grid">
          <div className="stat">
            <div className="lbl">Cumulative gap</div>
            <div className="val">{compactNum(plan.cumulativeGap)}<span className="faint" style={{ fontSize: 11 }}> {plan.unit}</span></div>
          </div>
          <div className="stat">
            <div className="lbl">Total cost</div>
            <div className="val">{compactUsd(plan.totalCost)}</div>
          </div>
          <div className="stat">
            <div className="lbl">Time to close</div>
            <div className="val">{plan.timeToCloseMonths === null ? 'not closed' : `${plan.timeToCloseMonths} mo`}</div>
          </div>
          <div className="stat">
            <div className="lbl">Left uncovered</div>
            <div className="val">{pct(plan.uncoveredShare)}</div>
          </div>
        </div>
      </div>

      <div className="section">
        <h4>Coverage of monthly gap</h4>
        <Sparkline series={plan.coverage} color="var(--good)" />
        <div className="subfig">fraction of each month's shortfall closed by all levers</div>
      </div>

      <div className="section">
        <h4>Levers</h4>
        {active.length === 0 ? (
          <p className="muted">No pre-modeled relief levers for {commodityName(ctx, plan.commodity)} yet — the calibrated lever sets cover eggs and infant formula.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Lever</th><th className="r">Lead</th><th className="r">Cost</th><th className="r">Share</th></tr>
            </thead>
            <tbody>
              {active.map((l) => (
                <tr key={l.id}>
                  <td>
                    <a href={l.precedent.url} target="_blank" rel="noreferrer" title={l.precedent.note}>{l.name}</a>
                    <div>
                      <span className={`classif ${CLASS_STYLE[l.classification]}`}>{l.classification}</span>
                    </div>
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
