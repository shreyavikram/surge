import { Fragment, useState } from 'react';
import type { EngineContext } from '@surge/engine';
import { type RankedEntry, commodityName, focusView, chartLimit } from '../engine.js';
import type { Focus } from '../state.js';
import { compactUsd, signedPct, peak } from '../format.js';
import { Chip } from './Chip.js';
import { Info } from './Info.js';
import { LineChart } from './LineChart.js';

/** Dollars per person, honest at the small end: cents below a dollar, "under 1¢" below half a cent. */
function perPerson(x: number): string {
  if (Math.abs(x) < 0.005) return 'under 1¢';
  if (Math.abs(x) < 1) return `${Math.round(x * 100)}¢`;
  return `$${x.toFixed(2)}`;
}

export function Impact({ entry, ctx, focus }: { entry: RankedEntry; ctx: EngineContext; focus: Focus }) {
  const impact = entry.impact;
  const w = impact.welfare;
  const v = focusView(entry, focus, ctx);
  const observed = impact.price.path === 'observed';
  // does any commodity row have something to chart? (a live threat that started this month has none yet)
  const nowYm0 = new Date().toISOString().slice(0, 7);
  const anyChart = observed ? !!entry.observed : impact.commodities.some((id) => {
    const pi = impact.price.retailPct[id] ?? [];
    const cut = entry.origin === 'live' ? Math.max(1, impact.months.filter((m) => m <= nowYm0).length) : pi.length;
    return cut >= 2 && pi.slice(0, cut).some((v) => Math.abs(v) > 1e-6);
  });
  const scale = w.cv > 0 ? v.cv / w.cv : 0;
  const [open, setOpen] = useState<string | null>(null);

  const rows = impact.commodities
    .map((id) => ({ id, name: commodityName(ctx, id), price: peak(impact.price.retailPct[id] ?? []), qty: peak(impact.quantity.pct[id] ?? []), cv: v.byCommodity[id] ?? 0 }))
    .sort((a, b) => Math.abs(b.price) - Math.abs(a.price));

  // flour and soups carry positive own-price elasticities in ERR-139 (see docs/DATA-AUDIT.md B3); their cross terms are not shown
  const UNRELIABLE_ITEMS = new Set(['flour', 'soups']);
  const subs = w.substitution.filter((s) => Math.abs(s.quantityPct) > 0.0005 && !UNRELIABLE_ITEMS.has(s.commodity)).sort((a, b) => Math.abs(b.quantityPct) - Math.abs(a.quantityPct)).slice(0, 8);

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
            <div className="val">{v.population > 0 ? perPerson(v.cv / v.population) : '—'}</div>
          </div>
        </div>
      </div>

      <div className="section">
        <h4>Commodities <span className="faint">· {anyChart ? 'click a row for its price path' : 'price paths appear once the shock has been under way for a month'}</span></h4>
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
              const pctSeriesAll = [...pi, ...new Array<number>(tail).fill(0)];
              // a live threat's chart stops at the current month: what has happened, not a projection
              const nowYm = new Date().toISOString().slice(0, 7);
              const cut = chartLimit(chartMonths, entry);
              const toDate = cut < chartMonths.length;
              const shownMonths = chartMonths.slice(0, cut);
              const pctSeries = pctSeriesAll.slice(0, cut);
              // no chart when there is nothing to draw yet: a live threat that started this month has one point, and a
              // lagged commodity shows no retail movement until next month
              const hasChart = (observed && obs) ? obs.months.length >= 2 : (shownMonths.length >= 2 && pctSeries.some((v) => Math.abs(v) > 1e-6));
              const isOpen = open === r.id && hasChart;
              return (
                <Fragment key={r.id}>
                  <tr className={isOpen ? 'open' : ''} onClick={() => { if (hasChart) setOpen(isOpen ? null : r.id); }} style={{ cursor: hasChart ? 'pointer' : 'default' }} title={hasChart ? undefined : 'No price data to chart yet'}>
                    <td><span className="caret">{hasChart ? (isOpen ? '▾' : '▸') : ''}</span>{r.name}{hasChart || !anyChart ? null : <span className="faint"> · no price data yet</span>}</td>
                    <td className="r" style={{ color: 'var(--bad)' }}>{signedPct(r.price)}</td>
                    <td className="r muted">{signedPct(r.qty)}</td>
                    <td className="r">{r.cv > 0 ? compactUsd(r.cv) : '—'}</td>
                  </tr>
                  {isOpen && (
                    <tr className="chart-row">
                      <td colSpan={4}>
                        <div className="chart-title">{observed && obs ? `Store price, ${r.name}` : `Store price change from normal, ${r.name}${toDate ? ' · to date' : ''}`} <span className="faint">{observed && obs ? `USD per ${c?.unit ?? 'unit'} · actual (FRED) vs. what it would have been` : `normal price $${base.toFixed(2)} per ${c?.unit ?? 'unit'} · solid line: modeled from the shock start, returning to normal as supply recovers; dashed line: the actual store price (BLS) where a replay has it`}</span></div>
                        {observed && obs ? (
                          <LineChart months={obs.months} series={[{ label: 'observed', values: obs.retailPrice, color: 'var(--bad)' }, { label: 'counterfactual', values: obs.counterfactualPrice, color: 'var(--text-faint)', dashed: true }]} yFormat={(y) => `$${y.toFixed(2)}`} />
                        ) : (
                          <LineChart months={shownMonths} series={[{ label: 'modeled', values: pctSeries, color: 'var(--bad)' }, ...(obs ? [{ label: 'actual (BLS)', values: shownMonths.map((m) => { const k = obs.months.indexOf(m); return k >= 0 && (obs.counterfactualPrice[k] ?? 0) > 0 ? obs.retailPrice[k]! / obs.counterfactualPrice[k]! - 1 : NaN; }).filter((v) => Number.isFinite(v)), color: 'var(--text)', dashed: true }] : [])]} baseline={{ value: 0, label: 'normal price' }} yFormat={(y) => `${y > 0 ? '+' : ''}${(y * 100).toFixed(Math.abs(y) < 0.02 ? 1 : 0)}%`} yMin={0} now={nowYm} endIndex={pi.length < shownMonths.length ? pi.length : undefined} />
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
            <thead><tr><th>Other food</th><th className="r">Change in purchases</th></tr></thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.commodity}>
                  <td>{commodityName(ctx, s.commodity) === s.commodity ? ctx.demand.items.find((i) => i.id === s.commodity)?.label ?? s.commodity : commodityName(ctx, s.commodity)}</td>
                  <td className="r">{s.significant ? <span style={{ color: s.quantityPct >= 0 ? 'var(--good)' : 'var(--bad)' }}>{signedPct(s.quantityPct)}</span> : <span className="faint" title="The estimate behind this could just as well be zero">not significant</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="section assumptions">
        <summary>Assumptions and sources<Info term="modeled" /></summary>
        {entry.threat.source.links && entry.threat.source.links.length > 0 && (
          <div className="reports">
            <div className="a-l">Reports behind this possible disruption ({entry.threat.source.feed})</div>
            <ul>
              {entry.threat.source.links.map((l) => (
                <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer noopener">{l.title}</a>{l.outlet ? <span className="faint"> · {l.outlet}</span> : null}{l.date ? <span className="faint"> · {new Date(l.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> : null}</li>
              ))}
            </ul>
          </div>
        )}
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
