import { useMemo } from 'react';
import { statusMeta } from '../../utils/ranges.js';

// A tiny inline history, drawn as SVG so it stays crisp and costs nothing.
// Shown beside a value to answer "is this new, or has it been like this?".
export default function Sparkline({ series, status = 'unknown', width = 64, height = 24, strokeWidth = 2 }) {
  const points = useMemo(() => {
    if (!series || series.length < 2) return null;
    const values = series.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // A flat series has no span to scale against — draw it down the middle.
    const span = max - min || 1;
    const stepX = width / (series.length - 1);
    // Pad vertically so the stroke is never clipped at the extremes.
    const pad = strokeWidth;
    const usable = height - pad * 2;
    return values.map((value, index) => ({
      x: index * stepX,
      y: max === min ? height / 2 : pad + usable - ((value - min) / span) * usable,
    }));
  }, [series, width, height, strokeWidth]);

  if (!points) return null;

  const color = statusMeta(status).color;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="flex-shrink-0 overflow-visible"
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />
      <circle cx={last.x} cy={last.y} r={strokeWidth} fill={color} />
    </svg>
  );
}
