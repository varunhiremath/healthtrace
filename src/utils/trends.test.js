import { describe, it, expect } from 'vitest';
import {
  seriesFor, latest, previous, stats, delta, slopePerMonth, movingAverage,
  summarise, derivedSeries, rankByConcern, RANGES,
} from './trends.js';

const readings = [
  { markerKey: 'ldl', date: '2024-01-10', value: 168 },
  { markerKey: 'ldl', date: '2024-08-02', value: 152 },
  { markerKey: 'ldl', date: '2025-06-15', value: 131 },
  { markerKey: 'ldl', date: '2026-06-20', value: 118 },
  { markerKey: 'hdl', date: '2026-06-20', value: 44 },
  { markerKey: 'ldl', date: '2026-06-25', value: null },
];

describe('seriesFor', () => {
  it('selects one marker, oldest first', () => {
    const series = seriesFor(readings, 'ldl');
    expect(series.map((r) => r.value)).toEqual([168, 152, 131, 118]);
  });

  it('drops readings with no numeric value', () => {
    expect(seriesFor(readings, 'ldl').every((r) => Number.isFinite(r.value))).toBe(true);
  });

  it('windows by age in days', () => {
    const series = seriesFor(readings, 'ldl', { days: 365, from: '2026-08-31' });
    expect(series.map((r) => r.value)).toEqual([118]);
    // 2024-01-10 is 964 days before 2026-08-31, so a 3-year window keeps it.
    const wider = seriesFor(readings, 'ldl', { days: 1095, from: '2026-08-31' });
    expect(wider.map((r) => r.value)).toEqual([168, 152, 131, 118]);
    const narrower = seriesFor(readings, 'ldl', { days: 900, from: '2026-08-31' });
    expect(narrower.map((r) => r.value)).toEqual([152, 131, 118]);
  });

  it('returns an empty series for a marker with no readings', () => {
    expect(seriesFor(readings, 'tsh')).toEqual([]);
    expect(latest(readings, 'tsh')).toBeNull();
    expect(previous(readings, 'hdl')).toBeNull();
  });

  it('exposes the standard time windows', () => {
    expect(RANGES.map((r) => r.key)).toEqual(['3m', '1y', '3y', 'all']);
  });
});

describe('latest / previous', () => {
  it('returns the newest and the one before it', () => {
    expect(latest(readings, 'ldl').value).toBe(118);
    expect(previous(readings, 'ldl').value).toBe(131);
  });
});

describe('stats', () => {
  it('summarises a series', () => {
    const s = stats(seriesFor(readings, 'ldl'));
    expect(s.count).toBe(4);
    expect(s.min).toBe(118);
    expect(s.max).toBe(168);
    expect(s.average).toBeCloseTo(142.25, 2);
    expect(s.first.value).toBe(168);
    expect(s.last.value).toBe(118);
  });

  it('returns null for an empty series', () => {
    expect(stats([])).toBeNull();
  });
});

describe('delta', () => {
  it('measures the change between the two most recent readings', () => {
    const d = delta(seriesFor(readings, 'ldl'), 'ldl');
    expect(d.change).toBe(-13);
    expect(d.percent).toBeCloseTo(-9.92, 2);
    expect(d.days).toBe(370);
    expect(d.direction).toBe('better');
    expect(d.statusBefore).toBe('high');
    expect(d.statusAfter).toBe('borderline');
  });

  it('needs two readings', () => {
    expect(delta(seriesFor(readings, 'hdl'), 'hdl')).toBeNull();
  });

  it('does not divide by zero', () => {
    const zeroed = [
      { markerKey: 'esr', date: '2026-01-01', value: 0 },
      { markerKey: 'esr', date: '2026-02-01', value: 8 },
    ];
    expect(delta(zeroed, 'esr').percent).toBeNull();
  });
});

describe('slopePerMonth', () => {
  it('reports the long-run drift per 30 days', () => {
    const rising = [
      { date: '2026-01-01', value: 100 },
      { date: '2026-02-01', value: 110 },
      { date: '2026-03-01', value: 120 },
    ];
    // Roughly +10 per month, allowing for 31- and 28-day gaps.
    expect(slopePerMonth(rising)).toBeGreaterThan(9);
    expect(slopePerMonth(rising)).toBeLessThan(11);
  });

  it('is negative for a falling series and near zero for a flat one', () => {
    const falling = [
      { date: '2026-01-01', value: 120 },
      { date: '2026-02-01', value: 110 },
      { date: '2026-03-01', value: 100 },
    ];
    expect(slopePerMonth(falling)).toBeLessThan(0);
    const flat = [
      { date: '2026-01-01', value: 100 },
      { date: '2026-02-01', value: 100 },
      { date: '2026-03-01', value: 100 },
    ];
    expect(slopePerMonth(flat)).toBeCloseTo(0, 6);
  });

  it('needs at least three points, and survives same-day readings', () => {
    expect(slopePerMonth([{ date: '2026-01-01', value: 1 }, { date: '2026-02-01', value: 2 }])).toBeNull();
    const sameDay = [
      { date: '2026-01-01', value: 100 },
      { date: '2026-01-01', value: 110 },
      { date: '2026-01-01', value: 120 },
    ];
    expect(slopePerMonth(sameDay)).toBeNull();
  });
});

describe('movingAverage', () => {
  it('smooths a noisy series over a trailing window', () => {
    const series = [
      { date: '2026-01-01', value: 70 },
      { date: '2026-01-02', value: 74 },
      { date: '2026-01-03', value: 72 },
    ];
    const smoothed = movingAverage(series, 3);
    expect(smoothed[0].value).toBe(70);
    expect(smoothed[1].value).toBe(72);
    expect(smoothed[2].value).toBe(72);
  });

  it('leaves the series untouched for a window of one', () => {
    const series = [{ date: '2026-01-01', value: 70 }];
    expect(movingAverage(series, 1)).toEqual(series);
  });
});

describe('derivedSeries', () => {
  it('flattens one derived marker out of a by-date map', () => {
    const byDate = {
      '2026-06-20': { bmi: 22.9, nonHdl: 142 },
      '2025-06-15': { bmi: 23.8 },
      '2024-01-10': {},
    };
    expect(derivedSeries(byDate, 'bmi')).toEqual([
      { date: '2025-06-15', markerKey: 'bmi', value: 23.8, derived: true },
      { date: '2026-06-20', markerKey: 'bmi', value: 22.9, derived: true },
    ]);
    expect(derivedSeries(byDate, 'egfr')).toEqual([]);
  });
});

describe('summarise', () => {
  it('builds one row per marker that has readings', () => {
    const rows = summarise(readings, ['ldl', 'hdl', 'tsh']);
    expect(rows.map((r) => r.markerKey)).toEqual(['ldl', 'hdl']);
    expect(rows[0].value).toBe(118);
    expect(rows[0].status).toBe('borderline');
    expect(rows[0].delta.change).toBe(-13);
  });

  it('pulls derived markers from the derived map instead of the readings', () => {
    const rows = summarise(readings, ['bmi'], {
      derivedByDate: { '2026-06-20': { bmi: 27.4 } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(27.4);
    expect(rows[0].status).toBe('borderline');
  });

  it('skips unknown marker keys rather than throwing', () => {
    expect(summarise(readings, ['notAMarker'])).toEqual([]);
  });
});

describe('rankByConcern', () => {
  it('puts the worst status first, newest first within a status', () => {
    const rows = [
      { markerKey: 'a', status: 'optimal', date: '2026-01-01' },
      { markerKey: 'b', status: 'critical', date: '2025-01-01' },
      { markerKey: 'c', status: 'borderline', date: '2026-01-01' },
      { markerKey: 'd', status: 'high', date: '2024-01-01' },
      { markerKey: 'e', status: 'high', date: '2026-01-01' },
    ];
    expect(rankByConcern(rows).map((r) => r.markerKey)).toEqual(['b', 'e', 'd', 'c', 'a']);
  });

  it('does not mutate the input', () => {
    const rows = [{ status: 'optimal', date: '2026-01-01' }, { status: 'high', date: '2026-01-01' }];
    const copy = [...rows];
    rankByConcern(rows);
    expect(rows).toEqual(copy);
  });
});
