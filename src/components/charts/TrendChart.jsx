import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, ReferenceLine, CartesianGrid, Dot,
} from 'recharts';
import { optimalRange, statusMeta, classify, formatValue } from '../../utils/ranges.js';
import { formatDate } from '../../utils/dates.js';

// The history of one marker, with its healthy window drawn behind the line.
// The band is the point: a number means nothing without the range around it.
export default function TrendChart({ series, marker, sex, height = 220, unitLabel }) {
  if (!series?.length) return null;

  const data = series.map((point) => ({
    date: point.date,
    value: point.value,
    status: classify(point.value, marker, sex),
  }));

  const range = optimalRange(marker, sex);
  const values = data.map((d) => d.value);
  const bounds = [...values];
  if (range?.min != null) bounds.push(range.min);
  if (range?.max != null) bounds.push(range.max);
  const min = Math.min(...bounds);
  const max = Math.max(...bounds);
  // Breathing room so the line and the band edges never touch the frame, then
  // rounded outward to a readable step — raw padded bounds give tick labels like
  // "178.35", which are both ugly and wide enough to get clipped.
  const pad = (max - min || Math.abs(max) || 1) * 0.15;
  // Never pad below zero for a quantity that cannot be negative — an axis
  // running to -3.8 ng/mL is nonsense, and it wastes a third of the plot.
  const floor = min >= 0 ? Math.max(0, min - pad) : min - pad;
  const domain = [roundTo(floor, 'down', marker), roundTo(max + pad, 'up', marker)];
  // Widen the axis for long labels (four digits, or decimals) so a leading digit
  // can never be cut off.
  const axisWidth = Math.max(
    34,
    Math.min(64, String(Math.round(domain[1])).length * 9 + (marker.decimals ? marker.decimals * 7 : 0) + 12)
  );

  const bandLow = range?.min ?? domain[0];
  const bandHigh = range?.max ?? domain[1];

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--color-ivory)" vertical={false} />

          {range && (
            <ReferenceArea
              y1={bandLow}
              y2={bandHigh}
              fill="var(--status-optimal)"
              fillOpacity={0.12}
              stroke="none"
              ifOverflow="extendDomain"
            />
          )}
          {range?.max != null && (
            <ReferenceLine y={range.max} stroke="var(--status-optimal)" strokeDasharray="4 4" strokeOpacity={0.6} />
          )}
          {range?.min != null && (
            <ReferenceLine y={range.min} stroke="var(--status-optimal)" strokeDasharray="4 4" strokeOpacity={0.6} />
          )}

          <XAxis
            dataKey="date"
            tickFormatter={(date) => formatDate(date, { withYear: false })}
            tick={{ fontSize: 10, fill: 'var(--color-ash)' }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={domain}
            allowDecimals={marker.decimals > 0}
            tick={{ fontSize: 10, fill: 'var(--color-ash)' }}
            axisLine={false}
            tickLine={false}
            width={axisWidth}
          />
          <Tooltip content={<TrendTooltip marker={marker} unitLabel={unitLabel} />} />

          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-pulse)"
            strokeWidth={2.5}
            isAnimationActive
            animationDuration={600}
            dot={<StatusDot />}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Round a bound outward to a step that reads cleanly on an axis.
function roundTo(value, direction, marker) {
  const magnitude = Math.max(Math.abs(value), 1);
  // One "nice" step: 1, 5, 10, 50... sized to the numbers this marker deals in.
  const raw = 10 ** Math.floor(Math.log10(magnitude) - 1);
  const step = marker.decimals > 0 ? Math.max(raw, 10 ** -marker.decimals) : Math.max(raw, 1);
  const rounded = direction === 'down' ? Math.floor(value / step) * step : Math.ceil(value / step) * step;
  return Number(rounded.toFixed(Math.max(marker.decimals ?? 0, 2)));
}

// Each point carries its own verdict, so a single out-of-range reading in an
// otherwise healthy history is visible at a glance.
function StatusDot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  return <Dot cx={cx} cy={cy} r={3.5} fill={statusMeta(payload.status).color} stroke="var(--color-chalk)" strokeWidth={1.5} />;
}

function TrendTooltip({ active, payload, marker, unitLabel }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const meta = statusMeta(point.status);
  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{ background: 'var(--color-ink)', boxShadow: '0 8px 24px rgba(15,23,42,0.3)' }}
    >
      <p className="font-sans text-[11px]" style={{ color: '#94a3b8' }}>
        {formatDate(point.date)}
      </p>
      <p className="tnum font-display text-base font-bold" style={{ color: '#ffffff' }}>
        {formatValue(point.value, marker)}
        <span className="ml-1 font-sans text-[11px] font-normal" style={{ color: '#94a3b8' }}>
          {unitLabel ?? marker.unit}
        </span>
      </p>
      <p className="font-sans text-[11px] font-semibold" style={{ color: meta.color }}>
        {meta.label}
      </p>
    </div>
  );
}
