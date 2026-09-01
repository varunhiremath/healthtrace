// Turning a number into a status is the single most important thing this app
// does, so it lives here, pure and tested, and nothing else is allowed to
// invent its own colour or verdict.
//
// Bands are ASCENDING and `upTo` is INCLUSIVE — it is the last value still in
// that band. The final band always has `upTo: null` (everything above).

import { getMarker } from '../data/markers.js';

export const STATUSES = ['optimal', 'borderline', 'low', 'high', 'critical', 'unknown'];

export const STATUS_META = {
  optimal: { label: 'In range', short: 'OK', color: 'var(--status-optimal)', soft: 'var(--status-optimal-soft)', severity: 0 },
  unknown: { label: 'No range', short: '—', color: 'var(--status-unknown)', soft: 'var(--status-unknown-soft)', severity: 0 },
  borderline: { label: 'Borderline', short: 'Watch', color: 'var(--status-borderline)', soft: 'var(--status-borderline-soft)', severity: 1 },
  low: { label: 'Below range', short: 'Low', color: 'var(--status-low)', soft: 'var(--status-low-soft)', severity: 2 },
  high: { label: 'Above range', short: 'High', color: 'var(--status-high)', soft: 'var(--status-high-soft)', severity: 2 },
  critical: { label: 'Well outside range', short: 'Act', color: 'var(--status-critical)', soft: 'var(--status-critical-soft)', severity: 3 },
};

export function statusMeta(status) {
  return STATUS_META[status] ?? STATUS_META.unknown;
}

export function severity(status) {
  return statusMeta(status).severity;
}

// Only these mean "look at me".
export function isOutOfRange(status) {
  return severity(status) >= 1;
}

// The bands that apply to this person. `sex` is 'male' | 'female' | undefined;
// anything without an explicit override falls back to the default bands.
export function bandsFor(marker, sex) {
  if (!marker) return [];
  const override = sex && marker.bandsBySex?.[sex];
  return override ?? marker.bands ?? [];
}

export function classify(value, marker, sex) {
  const m = typeof marker === 'string' ? getMarker(marker) : marker;
  const bands = bandsFor(m, sex);
  if (!bands.length) return 'unknown';
  if (value == null || !Number.isFinite(value)) return 'unknown';
  for (const band of bands) {
    if (band.upTo == null || value <= band.upTo) return band.status;
  }
  // Unreachable while the last band is `upTo: null`, but a hand-edited band
  // set could break that — treat "off the end" as the last band's status.
  return bands[bands.length - 1].status;
}

// The healthy window, as bounds on the raw scale. `min` is EXCLUSIVE (the last
// value below the window), `max` is INCLUSIVE. Either may be null = unbounded.
export function optimalRange(marker, sex) {
  const m = typeof marker === 'string' ? getMarker(marker) : marker;
  const bands = bandsFor(m, sex);
  const first = bands.findIndex((b) => b.status === 'optimal');
  if (first === -1) return null;
  let last = first;
  while (last + 1 < bands.length && bands[last + 1].status === 'optimal') last += 1;
  return {
    min: first === 0 ? null : bands[first - 1].upTo,
    max: bands[last].upTo,
  };
}

// One display step at this marker's precision: 1 for integers, 0.1, 0.01…
export function step(marker) {
  return Number((10 ** -(marker?.decimals ?? 0)).toFixed(marker?.decimals ?? 0));
}

export function formatValue(value, marker) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(marker?.decimals ?? 0);
}

// "70 – 99", "Under 100", "40 and above". Reads the way a lab report prints it:
// the exclusive lower bound is bumped by one display step.
export function formatRange(marker, sex) {
  const m = typeof marker === 'string' ? getMarker(marker) : marker;
  const range = optimalRange(m, sex);
  if (!range) return null;
  const s = step(m);
  const lo = range.min == null ? null : Number((range.min + s).toFixed(m.decimals ?? 0));
  const hi = range.max;
  if (lo == null && hi == null) return null;
  if (lo == null) return `Under ${formatValue(Number((hi + s).toFixed(m.decimals ?? 0)), m)}`;
  if (hi == null) return `${formatValue(lo, m)} and above`;
  return `${formatValue(lo, m)} – ${formatValue(hi, m)}`;
}

// Where a value sits on the marker's visual scale, clamped to 0..1.
export function scalePosition(value, marker) {
  const m = typeof marker === 'string' ? getMarker(marker) : marker;
  const [min, max] = m?.scale ?? [0, 1];
  if (value == null || !Number.isFinite(value) || max === min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

// The coloured segments of a RangeBar: each band clipped to the visual scale
// and expressed as start/width percentages. Bands entirely off-scale drop out.
export function bandSegments(marker, sex) {
  const m = typeof marker === 'string' ? getMarker(marker) : marker;
  const bands = bandsFor(m, sex);
  if (!bands.length) return [];
  const [min, max] = m.scale ?? [0, 1];
  const span = max - min;
  if (!(span > 0)) return [];

  const segments = [];
  let from = min;
  for (const band of bands) {
    const to = band.upTo == null ? max : band.upTo;
    const clampedFrom = Math.max(min, Math.min(max, from));
    const clampedTo = Math.max(min, Math.min(max, to));
    if (clampedTo > clampedFrom) {
      segments.push({
        status: band.status,
        from: clampedFrom,
        to: clampedTo,
        start: ((clampedFrom - min) / span) * 100,
        width: ((clampedTo - clampedFrom) / span) * 100,
      });
    }
    from = to;
  }
  return segments;
}

// Does moving from `previous` to `current` head toward the healthy window?
// Returns 'better' | 'worse' | 'flat' | 'unknown'.
export function trendDirection(previous, current, marker, sex) {
  const m = typeof marker === 'string' ? getMarker(marker) : marker;
  if (previous == null || current == null || !Number.isFinite(previous) || !Number.isFinite(current)) {
    return 'unknown';
  }
  if (previous === current) return 'flat';
  const rising = current > previous;

  // Inside the healthy window and staying there is never "worse".
  const wasOk = classify(previous, m, sex) === 'optimal';
  const isOk = classify(current, m, sex) === 'optimal';
  if (wasOk && isOk) return 'flat';
  if (!wasOk && isOk) return 'better';
  if (wasOk && !isOk) return 'worse';

  const range = optimalRange(m, sex);
  if (range) {
    // Out of range on both readings: better means closer to the window.
    const distance = (v) => {
      if (range.min != null && v <= range.min) return range.min - v;
      if (range.max != null && v > range.max) return v - range.max;
      return 0;
    };
    const before = distance(previous);
    const after = distance(current);
    if (after < before) return 'better';
    if (after > before) return 'worse';
    return 'flat';
  }

  if (m?.direction === 'lower') return rising ? 'worse' : 'better';
  if (m?.direction === 'higher') return rising ? 'better' : 'worse';
  return 'unknown';
}

/* --------------------------------------------------------------- targets */
// A doctor may set you a target that differs from the general population
// range ("get your LDL under 70"). Rather than threading a special case
// through classify/formatRange/bandSegments, a target REBUILDS the marker's
// bands, so every function above keeps working unchanged.
//
// `target` is { min, max } on the marker's canonical scale; either may be null
// for an open-ended target. An empty or invalid target is ignored.

export function isValidTarget(target) {
  if (!target) return false;
  const { min, max } = target;
  const hasMin = min != null && Number.isFinite(min);
  const hasMax = max != null && Number.isFinite(max);
  if (!hasMin && !hasMax) return false;
  if (hasMin && hasMax && min >= max) return false;
  return true;
}

// The marker to actually use for a value: the catalogue entry, or a copy of it
// with the user's target substituted for its reference bands.
export function effectiveMarker(marker, targets = {}) {
  const m = typeof marker === 'string' ? getMarker(marker) : marker;
  if (!m) return null;
  const target = targets[m.key];
  if (!isValidTarget(target)) return m;

  const bands = [];
  if (target.min != null && Number.isFinite(target.min)) {
    bands.push({ upTo: target.min, status: 'low' });
  }
  bands.push({ upTo: target.max != null && Number.isFinite(target.max) ? target.max : null, status: 'optimal' });
  if (bands[bands.length - 1].upTo != null) bands.push({ upTo: null, status: 'high' });

  // Keep the visual scale wide enough to show the target itself.
  const [scaleMin, scaleMax] = m.scale;
  const bounds = [scaleMin, scaleMax, target.min, target.max].filter((n) => n != null && Number.isFinite(n));

  return {
    ...m,
    bands,
    bandsBySex: undefined,
    scale: [Math.min(...bounds), Math.max(...bounds)],
    isTarget: true,
  };
}
