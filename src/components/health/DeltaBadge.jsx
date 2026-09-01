import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatValue } from '../../utils/ranges.js';

// How a marker moved since the previous reading, and — the part that matters —
// whether that movement was toward the healthy range or away from it. Colour
// follows the DIRECTION OF HEALTH, never the direction of the arrow: LDL
// falling is green even though the arrow points down.
export default function DeltaBadge({ delta, marker, showSince = true }) {
  if (!delta) return null;
  const { change, direction, from } = delta;

  const color =
    direction === 'better'
      ? 'var(--status-optimal)'
      : direction === 'worse'
        ? 'var(--status-high)'
        : 'var(--color-text-secondary)';

  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  const sign = change > 0 ? '+' : '';

  return (
    <span className="inline-flex items-center gap-1 font-sans text-[11px] font-semibold" style={{ color }}>
      <Icon size={12} strokeWidth={2.5} />
      <span className="tnum">
        {sign}
        {formatValue(change, marker)} {marker.unit}
      </span>
      {showSince && from?.date && (
        <span className="font-normal" style={{ color: 'var(--color-ash)' }}>
          since last
        </span>
      )}
    </span>
  );
}
