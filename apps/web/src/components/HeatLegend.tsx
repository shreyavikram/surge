import { HEAT_RAMP } from '../heat-colors.js';
import { Info } from './Info.js';

export function HeatLegend({ focused, lens = [] }: { focused: boolean; lens?: string[] }) {
  const what = lens.length === 0 ? 'US food' : lens.length <= 2 ? lens.join(' and ') : `${lens.length} selected foods`;
  const ramp = (k: keyof typeof HEAT_RAMP) => `linear-gradient(90deg, ${HEAT_RAMP[k][0]}, ${HEAT_RAMP[k][1]})`;
  return (
    <div className="legend heat">
      <div className="lg-row"><span className="ramp" style={{ background: ramp('stable') }} /><span>Stable · darker = supplies more of {what}<Info term="heatStable" /></span></div>
      <div className="lg-row"><span className="ramp" style={{ background: ramp('anticipated') }} /><span>Possible disruption · darker = supplies more of {what}<Info term="heatAnticipated" /></span></div>
      <div className="lg-row"><span className="ramp" style={{ background: ramp('unstable') }} /><span>Disruption underway · darker = supplies more of {what}<Info term="heatUnstable" /></span></div>
      <div className="lg-row faint"><span className="ramp" style={{ background: '#8a94a6', opacity: 0.45 }} /><span>Grey · supplies none of {what} to the US<Info term="heatNone" /></span></div>
    </div>
  );
}
