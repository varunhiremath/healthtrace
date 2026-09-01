import { ChevronRight, Target } from 'lucide-react';
import { formatValue, statusMeta } from '../../utils/ranges.js';
import { displayUnit, toDisplay } from '../../utils/units.js';
import { relativeDate } from '../../utils/dates.js';
import StatusPill from './StatusPill.jsx';
import Sparkline from './Sparkline.jsx';
import RangeBar from './RangeBar.jsx';

// One marker, one line: name, value, verdict, and where it sits in range.
// Used on Home, in a report, and in the Trends browser so a marker always
// reads the same way wherever you meet it.
export default function MarkerRow({
  row, sex, units = {}, onClick, showRange = true, showSparkline = true, showDate = true, dense = false,
}) {
  const { marker, value, status, date, series, hasTarget } = row;
  const meta = statusMeta(status);
  const unit = displayUnit(marker, units);
  const shown = toDisplay(value, marker, units);

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl text-left ${dense ? 'px-3.5 py-2.5' : 'px-4 py-3.5'}`}
      style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {marker.name}
          </p>
          {hasTarget && <Target size={11} style={{ color: 'var(--color-pulse)' }} aria-label="Your target" />}
        </div>

        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="tnum font-display text-xl font-bold" style={{ color: meta.color }}>
            {formatValue(shown, marker)}
          </span>
          <span className="font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            {unit}
          </span>
          {showDate && date && (
            <span className="ml-auto truncate font-sans text-[11px]" style={{ color: 'var(--color-ash)' }}>
              {relativeDate(date)}
            </span>
          )}
        </div>

        {showRange && <div className="mt-2"><RangeBar value={value} marker={marker} sex={sex} height={6} /></div>}
      </div>

      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
        <StatusPill status={status} size="sm" />
        {showSparkline && series?.length > 1 && <Sparkline series={series} status={status} width={52} height={20} />}
      </div>

      {onClick && <ChevronRight size={16} className="flex-shrink-0" style={{ color: 'var(--color-ash)' }} />}
    </Wrapper>
  );
}
