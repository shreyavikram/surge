import { Fragment, useState } from 'react';
import type { EngineContext } from '@surge/engine';
import { type RankedEntry, commodityName, focusView } from '../engine.js';
import type { Focus } from '../state.js';
import { compactUsd, signedPct, peak } from '../format.js';
import { Chip } from './Chip.js';
import { Info } from './Info.js';
import { LineChart } from './LineChart.js';

export function Impact({ entry, ctx, focus }: { entry: RankedEntry; ctx: EngineContext; focus: Focus }) {
  const impact = entry.impact;
  const w = impact.welfare;
  const v = focusView(entry, focus, ctx);
  const observed = impact.price.path === 'observed';
  const scale = w.cv > 0 ? v.cv / w.cv : 0;
  const [open, setOpen] = useState<string | null>(null);

  const rows = impact.commodities
    .map((id) => ({ id, name: commodityName(ctx, id), price: peak(impact.price.retailPct[id] ?? []), qty: peak(impact.quantity.pct[id] ?? []), cv: v.byCommodity[id] ?? 0 }))
    .sort((a, b) => Math.abs(b.price) - Math.abs(a.price));

  const subs = w.substitution.filter((s) => Math.abs(s.quantityPct) > 0.0005).sort((a, b) => Math.abs(b.quantityPct) - Math.abs(a.quantityPct)).slice(0, 8);

  return (
    <>
      <div className="section">
        <h4>Consumer welfare loss<Info term="cv" /> <span className="faint">· {v.label}</span></h4>
        <div className="stat-pair">
          <div className="stat">
            <div className="lbl">Annual<Info term="cvAnnual" /></div>
            <div className="val big bad">{compactUsd(v.cvAnnual)}</div>
          </div>
          <div className="stat">
            <div className="lbl">Total · {impact.durationMonths} mo</div>
            <div className="val big bad">{compactUsd(v.cv)}</div>
          </div>
        </div>
        <div className="subfig">
          {observed ? <Chip kind="observed" title="Uses the actual store-price history for this event (FRED), with the share attributed to this cause">observed</Chip> : <Chip kind="modeled" title="Calculated by the model from its stated assumptions; open the assumptions list below to see them">modeled</Chip>}
          <span> range {compactUsd(w.band.low * scale)} – {compactUsd(w.band.high * scale)}<Info term="band" /></span>
        </div>
        <div className="stat-pair" style={{ marginTop: 10 }}>
          <div className="stat">
            <div className="lbl">Producer revenue Δ<Info term="producer" /></div>
            <div className="val" style={{ color: v.producer >= 0 ? 'var(--good)' : 'var(--bad)' }}>{compactUsd(v.producer)}</div>
          </div>
          <div className="stat">
            <div className="lbl">Per capita<Info term="perCapita" /></div>
            <div className="val">{v.population > 0 ? `$${(v.cv / v.population).toFixed(2)}` : '—'}</div>
          </div>
        </div>
      </div>

      <div className="section">
        <h4>Commodities <span className="faint">· click a row for its price path</span></h4>
        <table className="tbl clickable">
          <thead>
            <tr><th>Commodity</th><th className="r">Peak price</th><th className="r">Peak qty</th><th className="r">Loss</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r) => {
              const c = ctx.commodities[r.id];
              const pi = impact.price.retailPct[r.id] ?? [];
              const obs = entry.observed && entry.observed.commodity === r.id ? entry.observed : undefined;
              const base = obs && obs.counterfactualPrice.length > 0 ? obs.counterfactualPrice.reduce((a, b) => a + b, 0) / obs.counterfactualPrice.length : c?.baseline.retailPrice ?? 1;
              // percent change from normal, with two months after the shock ends so the return to normal is visible
              const tail = pi.length > 0 && (pi[pi.length - 1] ?? 0) > 1e-6 ? 2 : 0;
              const nextMonth = (ym: string, k: number) => { const [y, m] = ym.split('-').map(Number); const t = (y! * 12 + (m! - 1)) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
              const lastMonth = impact.months[impact.months.length - 1] ?? '2026-01';
              const chartMonths = [...impact.months, ...Array.from({ length: tail }, (_, k) => nextMonth(lastMonth, k + 1))];
              const pctSeries = [...pi, ...new Array<number>(tail).fill(0)];
              const isOpen = open === r.id;
              return (
                <Fragment key={r.id}>
                  <tr className={isOpen ? 'open' : ''} onClick={() => setOpen(isOpen ? null : r.id)}>
                    <td><span className="caret">{isOpen ? '▾' : '▸'}</span>{r.name}</td>
                    <td className="r" style={{ color: 'var(--bad)' }}>{signedPct(r.price)}</td>
                    <td className="r muted">{signedPct(r.qty)}</td>
                    <td className="r">{r.cv > 0 ? compactUsd(r.cv) : '—'}</td>
                  </tr>
                  {isOpen && (
                    <tr className="chart-row">
                      <td colSpan={4}>
                        <div className="chart-title">{observed && obs ? `Store price, ${r.name}` : `Store price change from normal, ${r.name}`} <span className="faint">{observed && obs ? `USD per ${c?.unit ?? 'unit'} · actual (FRED) vs. what it would have been` : `normal price $${base.toFixed(2)} per ${c?.unit ?? 'unit'} · modeled`}</span></div>
                        {observed && obs ? (
                          <LineChart months={obs.months} series={[{ label: 'observed', values: obs.retailPrice, color: 'var(--bad)' }, { label: 'counterfactual', values: obs.counterfactualPrice, color: 'var(--text-faint)', dashed: true }]} yFormat={(y) => `$${y.toFixed(2)}`} />
                        ) : (
                          <LineChart months={chartMonths} series={[{ label: 'modeled', values: pctSeries, color: 'var(--bad)' }]} baseline={{ value: 0, label: 'normal price' }} yFormat={(y) => `${y > 0 ? '+' : ''}${(y * 100).toFixed(Math.abs(y) < 0.02 ? 1 : 0)}%`} yMin={0} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {subs.length > 0 && (
        <div className="section">
          <h4>Substitution<Info term="substitution" /></h4>
          <table className="tbl">
            <thead><tr><th>Other food</th><th className="r">Δ purchases</th><th className="r">Estimate</th></tr></thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.commodity}>
                  <td>{commodityName(ctx, s.commodity) === s.commodity ? ctx.demand.items.find((i) => i.id === s.commodity)?.label ?? s.commodity : commodityName(ctx, s.commodity)}</td>
                  <td className="r" style={{ color: s.quantityPct >= 0 ? 'var(--good)' : 'var(--bad)' }}>{signedPct(s.quantityPct)}</td>
                  <td className="r">{s.significant ? <Chip kind="measured" title="The government study behind this number was confident the effect is real">significant</Chip> : <span className="faint" title="Could just as well be zero">not significant</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="section assumptions">
        <summary>Assumptions and sources<Info term="modeled" /></summary>
        {impact.assumptions.map((a) => (
          <div className="assump" key={a.key}>
            <span className="a-l">{a.label}</span>
            <span className="a-v">
              {typeof a.value === 'number' ? a.value.toLocaleString('en-US', { maximumFractionDigits: 3 }) : a.value}{a.unit ? ` ${a.unit}` : ''}
              <Chip kind={a.kind === 'measured' ? 'measured' : 'modeled'} title={a.source}>{a.kind}</Chip>
            </span>
          </div>
        ))}
      </details>
    </>
  );
}
