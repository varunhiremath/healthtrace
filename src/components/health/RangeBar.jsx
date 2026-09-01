import { bandSegments, scalePosition, statusMeta } from '../../utils/ranges.js';

// Where this reading sits inside its reference range, as a band of colour with
// a marker on it. This is the fastest way to read a lab number: you see the
// healthy stretch and where you landed, without decoding the figure itself.
export default function RangeBar({ value, marker, sex, height = 8, showMarker = true, animate = true }) {
  const segments = bandSegments(marker, sex);
  if (!segments.length) return null;

  const position = scalePosition(value, marker) * 100;
  const status = statusMeta(
    segments.find((s) => value <= s.to)?.status ?? segments[segments.length - 1].status
  );

  return (
    <div className="relative w-full" style={{ paddingTop: showMarker ? 5 : 0, paddingBottom: showMarker ? 5 : 0 }}>
      <div className="flex w-full overflow-hidden rounded-full" style={{ height }}>
        {segments.map((segment) => (
          <span
            key={`${segment.status}-${segment.start}`}
            style={{
              width: `${segment.width}%`,
              background: statusMeta(segment.status).color,
              // Reference bands are context, not the reading — keep them quiet
              // so the marker on top stays the thing your eye lands on.
              opacity: 0.28,
            }}
          />
        ))}
      </div>

      {showMarker && Number.isFinite(value) && (
        <span
          className="absolute top-0 rounded-full"
          style={{
            left: `${position}%`,
            transform: 'translateX(-50%)',
            width: 4,
            height: height + 10,
            background: status.color,
            boxShadow: '0 0 0 2px var(--color-chalk)',
            transition: animate ? 'left var(--dur-enter) var(--ease-out)' : 'none',
          }}
        />
      )}
    </div>
  );
}
