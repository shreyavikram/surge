import { HEAT_RAMP } from '../heat-colors.js';
import { Info } from './Info.js';

export function HeatLegend({ focused }: { focused: boolean }) {
  const ramp = (k: keyof typeof HEAT_RAMP) => `linear-gradient(90deg, ${HEAT_RAMP[k][0]}, ${HEAT_RAMP[k][1]})`;
  return (
    <div className="legend heat">
      <div className="lg-row"><span className="ramp" style={{ background: ramp('stable') }} /><span>Stable · darker = larger US supplier<Info term="heatStable" /></span></div>
      <div className="lg-row"><span className="ramp" style={{ background: ramp('anticipated') }} /><span>Anticipated · darker = bigger threatened hit, more certain<Info term="heatAnticipated" /></span></div>
      <div className="lg-row"><span className="ramp" style={{ background: ramp('unstable') }} /><span>Unstable · darker = bigger disruption underway<Info term="heatUnstable" /></span></div>
      {focused && <div className="lg-row faint"><span className="ramp" style={{ background: '#8a94a6', opacity: 0.4 }} /><span>Grey · does not reach the focus area</span></div>}
    </div>
  );
}
