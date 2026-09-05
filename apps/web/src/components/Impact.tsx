import type { EngineContext, ImpactResult } from '@surge/engine';
import { commodityName } from '../engine.js';
import { compactUsd, signedPct, usd2, peak } from '../format.js';
import { Chip } from './Chip.js';
import { Sparkline } from './Sparkline.js';

export function Impact({ impact, ctx }: { impact: ImpactResult; ctx: EngineContext }) {
  const w = impact.welfare;
  const observed = impact.price.path === 'observed';

  const rows = impact.commodities
    .map((id) => ({
      id,
      name: commodityName(ctx, id),
      price: peak(impact.price.retailPct[id] ?? []),
      qty: peak(impact.quantity.pct[id] ?? []),
      cv: w.byCommodity[id] ?? 0,
    }))
    .sort((a, b) => Math.abs(b.price) - Math.abs(a.price));

  const lead = rows[0];
  const leadSeries = lead ? impact.price.retailPct[lead.id] ?? [] : [];
  const producer = Object.values(w.producerRevenueChange).reduce((a, b) => a + b, 0);
  const sig = w.substitution.filter((s) => Math.abs(s.quantityPct) > 0.0005).sort((a, b) => Math.abs(b.quantityPct) - Math.abs(a.quantityPct)).slice(0, 6);

  return (
    <>
      <div className="section">
        <h4>Consumer welfare loss</h4>
        <div className="headline">
          <span className="big bad">{compactUsd(w.cv)}</span>
          {observed
            ? <Chip kind="observed" title="Computed from the observed FRED retail price path × attribution share (replay)">observed</Chip>
            : <Chip kind="modeled" title="Second-order Hicksian compensating variation over the ERR-139 demand system">modeled</Chip>}
        </div>
        <div className="subfig">
          Range {compactUsd(w.band.low)} – {compactUsd(w.band.high)} over the elasticity band · single-good check {compactUsd(w.csReplica)}
        </div>
        <div className="stat-grid" style={{ marginTop: 10 }}>
          <div className="stat">
            <div className="lbl">Duration</div>
            <div className="val">{impact.durationMonths} mo</div>
          </div>
          <div className="stat">
            <div className="lbl">Producer revenue Δ</div>
            <div className="val" style={{ color: producer >= 0 ? 'var(--good)' : 'var(--bad)' }}>{compactUsd(producer)}</div>
          </div>
        </div>
      </div>

      {lead && (
        <div className="section">
          <h4>Retail price — {lead.name}</h4>
          <Sparkline series={leadSeries} color="var(--bad)" />
          <div className="subfig">peak {signedPct(peak(leadSeries))} vs pre-shock baseline (dashed = counterfactual at 0)</div>
        </div>
      )}

      <div className="section">
        <h4>Price & quantity by commodity</h4>
        <table className="tbl">
          <thead>
            <tr><th>Commodity</th><th className="r">Peak price</th><th className="r">Peak qty</th><th className="r">CV</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="r" style={{ color: 'var(--bad)' }}>{signedPct(r.price)}</td>
                <td className="r muted">{signedPct(r.qty)}</td>
                <td className="r">{r.cv > 0 ? compactUsd(r.cv) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sig.length > 0 && (
        <div className="section">
          <h4>Substitution</h4>
          <table className="tbl">
            <tbody>
              {sig.map((s) => (
                <tr key={s.commodity}>
                  <td>{commodityName(ctx, s.commodity)}</td>
                  <td className="r" style={{ color: s.quantityPct >= 0 ? 'var(--good)' : 'var(--bad)' }}>{signedPct(s.quantityPct)}</td>
                  <td className="r">{s.significant ? <Chip kind="measured" title="Statistically significant in ERR-139 (SE)">sig</Chip> : <span className="faint">ns</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section">
        <h4>Loss per household by income quintile</h4>
        <div className="bars">
          {w.incidence.map((q) => {
            const max = Math.max(...w.incidence.map((x) => x.lossPerHousehold), 1);
            return (
              <div className="bar-row" key={q.quintile}>
                <span className="faint">Q{q.quintile}</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${(q.lossPerHousehold / max) * 100}%` }} /></span>
                <span>{usd2(q.lossPerHousehold)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <h4>Assumptions</h4>
        {impact.assumptions.map((a) => (
          <div className="assump" key={a.key}>
            <span className="a-l">{a.label}</span>
            <span className="a-v">
              {typeof a.value === 'number' ? a.value.toLocaleString('en-US', { maximumFractionDigits: 3 }) : a.value}
              {a.unit ? ` ${a.unit}` : ''}
              <Chip kind={a.kind === 'measured' ? 'measured' : 'modeled'} title={a.source}>{a.kind}</Chip>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
