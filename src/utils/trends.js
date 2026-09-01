// Turning a pile of readings into something you can read at a glance.
// All pure: given readings in, the same series comes out every time.

import { getMarker } from '../data/markers.js';
import { classify, trendDirection } from './ranges.js';
import { daysBetween, todayKey } from './dates.js';

export const RANGES = [
  { key: '3m', label: '3M', days: 90 },
  { key: '1y', label: '1Y', days: 365 },
  { key: '3y', label: '3Y', days: 1095 },
  { key: 'all', label: 'All', days: null },
];

// Oldest first — every chart, delta and slope below assumes that order.
export function seriesFor(readings, markerKey, { days = null, from = todayKey() } = {}) {
  return readings
    .filter((r) => r.markerKey === markerKey && Number.isFinite(r.value))
    .filter((r) => {
      if (days == null) return true;
      const age = daysBetween(r.date, from);
      return age != null && age <= days && age >= 0;
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function latest(readings, markerKey) {
  const series = seriesFor(readings, markerKey);
  return series.length ? series[series.length - 1] : null;
}

// The reading before the latest one — what a delta is measured against.
export function previous(readings, markerKey) {
  const series = seriesFor(readings, markerKey);
  return series.length > 1 ? series[series.length - 2] : null;
}

export function stats(series) {
  if (!series.length) return null;
  const values = series.map((r) => r.value);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: series.length,
    first: series[0],
    last: series[series.length - 1],
    min: Math.min(...values),
    max: Math.max(...values),
    average: sum / values.length,
  };
}

// Change between the two most recent readings in a series.
export function delta(series, markerKey, sex) {
  if (series.length < 2) return null;
  const marker = getMarker(markerKey);
  const current = series[series.length - 1];
  const prior = series[series.length - 2];
  const change = current.value - prior.value;
  const percent = prior.value === 0 ? null : (change / Math.abs(prior.value)) * 100;
  return {
    change,
    percent,
    from: prior,
    to: current,
    days: daysBetween(prior.date, current.date),
    direction: trendDirection(prior.value, current.value, marker, sex),
    statusBefore: classify(prior.value, marker, sex),
    statusAfter: classify(current.value, marker, sex),
  };
}

// Least-squares slope in units per 30 days — the long-run drift, which a single
// delta between two readings can badly misrepresent.
export function slopePerMonth(series) {
  if (series.length < 3) return null;
  const base = series[0].date;
  const points = series
    .map((r) => ({ x: daysBetween(base, r.date), y: r.value }))
    .filter((p) => p.x != null);
  if (points.length < 3) return null;

  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (const p of points) {
    numerator += (p.x - meanX) * (p.y - meanY);
    denominator += (p.x - meanX) ** 2;
  }
  if (denominator === 0) return null;
  return (numerator / denominator) * 30;
}

// A smoothed line for noisy home measurements (weight, blood pressure).
export function movingAverage(series, window = 3) {
  if (window < 2) return series.map((r) => ({ ...r }));
  return series.map((reading, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = series.slice(start, index + 1);
    const mean = slice.reduce((sum, r) => sum + r.value, 0) / slice.length;
    return { ...reading, value: mean };
  });
}

// One row per marker for the Home snapshot and the Trends browser.
export function summarise(readings, markerKeys, { sex, derivedByDate = {} } = {}) {
  return markerKeys
    .map((markerKey) => {
      const marker = getMarker(markerKey);
      if (!marker) return null;
      const series = marker.derived
        ? derivedSeries(derivedByDate, markerKey)
        : seriesFor(readings, markerKey);
      if (!series.length) return null;
      const last = series[series.length - 1];
      return {
        markerKey,
        marker,
        value: last.value,
        date: last.date,
        status: classify(last.value, marker, sex),
        series,
        delta: delta(series, markerKey, sex),
      };
    })
    .filter(Boolean);
}

// Derived values arrive as { '2026-03-04': { bmi: 22.9, ... } } — flatten one
// marker out of that into the same shape as a stored reading series.
export function derivedSeries(derivedByDate, markerKey) {
  return Object.entries(derivedByDate)
    .filter(([, values]) => Number.isFinite(values?.[markerKey]))
    .map(([date, values]) => ({ date, markerKey, value: values[markerKey], derived: true }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Worst first, so the Home screen leads with what needs attention. Ties break
// on how recently the reading was taken.
export function rankByConcern(rows) {
  const weight = { critical: 4, high: 3, low: 3, borderline: 2, optimal: 1, unknown: 0 };
  return [...rows].sort((a, b) => {
    const byStatus = (weight[b.status] ?? 0) - (weight[a.status] ?? 0);
    if (byStatus !== 0) return byStatus;
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });
}
