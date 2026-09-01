import { useEffect, useState } from 'react';
import useSettingsStore from '../../store/settingsStore.js';

// The share of your tracked markers currently sitting inside their range,
// drawn as a ring that fills on entry. The number in the middle is the count,
// not a score out of ten — this app does not grade you.
export default function SnapshotRing({ inRange, total, size = 132, stroke = 11 }) {
  const effects = useSettingsStore((s) => s.effects);
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const fraction = total > 0 ? inRange / total : 0;
  const [drawn, setDrawn] = useState(effects && !reduced ? 0 : fraction);

  useEffect(() => {
    if (!effects || reduced) {
      setDrawn(fraction);
      return undefined;
    }
    const id = requestAnimationFrame(() => setDrawn(fraction));
    return () => cancelAnimationFrame(id);
  }, [fraction, effects, reduced]);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const allClear = total > 0 && inRange === total;
  const color = allClear
    ? 'var(--status-optimal)'
    : fraction >= 0.7
      ? 'var(--color-pulse)'
      : 'var(--status-borderline)';

  return (
    <div className="relative flex flex-shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-ivory)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - drawn)}
          style={{ transition: 'stroke-dashoffset 900ms var(--ease-out), stroke var(--dur-standard)' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="tnum font-display text-3xl font-extrabold" style={{ color: 'var(--color-text-primary)' }}>
          {inRange}
          <span className="font-sans text-lg font-medium" style={{ color: 'var(--color-ash)' }}>
            /{total}
          </span>
        </span>
        <span className="font-sans text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
          in range
        </span>
      </div>
    </div>
  );
}
