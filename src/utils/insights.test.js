import { describe, it, expect } from 'vitest';
import { buildInsights, headline, inRangeScore, reportSummary, sideOfRange } from './insights.js';
import { getMarker } from '../data/markers.js';

const row = (markerKey, value, status, date = '2026-06-20', delta = null) => ({
  markerKey, value, status, date, delta,
});

describe('buildInsights — out of range', () => {
  it('names the marker, the value and the usual range', () => {
    const insights = buildInsights({
      rows: [row('ldl', 148, 'high')],
      reports: [{ date: '2026-06-20' }],
      today: '2026-08-31',
    });
    const out = insights.find((i) => i.id === 'out-of-range:ldl');
    expect(out.tone).toBe('alert');
    expect(out.body).toContain('148 mg/dL');
    expect(out.body).toContain('Under 100');
    expect(out.title).toContain('above range');
  });

  it('says which side of the window a higher-is-better marker missed', () => {
    // HDL 56 is BELOW its healthy window (60+), even though its status is
    // "borderline" — the same status LDL gets for being too high.
    const insights = buildInsights({
      rows: [row('hdl', 56, 'borderline')],
      reports: [{ date: '2026-06-20' }],
      sex: 'male',
      today: '2026-08-31',
    });
    expect(insights[0].title).toBe('HDL Cholesterol is just below its usual range');
    expect(insights[0].title).not.toContain('above');
  });

  it('still says above for a lower-is-better marker', () => {
    const insights = buildInsights({
      rows: [row('ldl', 120, 'borderline')],
      reports: [{ date: '2026-06-20' }],
      today: '2026-08-31',
    });
    expect(insights[0].title).toBe('LDL Cholesterol is just above its usual range');
  });

  it('says "well outside" for a critical reading', () => {
    const insights = buildInsights({
      rows: [row('hba1c', 9.2, 'critical')],
      reports: [{ date: '2026-06-20' }],
      today: '2026-08-31',
    });
    expect(insights[0].title).toBe('HbA1c is well above range');
  });

  it('says "below range" for a low reading', () => {
    const insights = buildInsights({
      rows: [row('vitaminD', 14, 'low')],
      reports: [{ date: '2026-06-20' }],
      today: '2026-08-31',
    });
    expect(insights[0].title).toContain('below range');
  });

  it('leads with the most severe marker and caps the list', () => {
    const rows = [
      row('ldl', 120, 'borderline'),
      row('hba1c', 9.2, 'critical'),
      row('tsh', 6, 'borderline'),
      row('uricAcid', 8.9, 'high'),
      row('esr', 30, 'borderline'),
      row('ggt', 70, 'borderline'),
    ];
    const insights = buildInsights({ rows, reports: [{ date: '2026-06-20' }], today: '2026-08-31' });
    const flags = insights.filter((i) => i.id.startsWith('out-of-range:'));
    expect(flags).toHaveLength(4);
    expect(flags[0].markerKey).toBe('hba1c');
  });

  it('uses sex-specific ranges in its wording', () => {
    const insights = buildInsights({
      rows: [row('hdl', 45, 'low')],
      reports: [{ date: '2026-06-20' }],
      sex: 'female',
      today: '2026-08-31',
    });
    expect(insights[0].body).toContain('60 and above');
  });
});

describe('buildInsights — movement', () => {
  const moved = (statusBefore, statusAfter, change) => ({
    change,
    direction: change < 0 ? 'better' : 'worse',
    statusBefore,
    statusAfter,
    from: { date: '2025-06-15', value: 148 },
    to: { date: '2026-06-20', value: 148 + change },
  });

  it('celebrates a move back into range', () => {
    const insights = buildInsights({
      rows: [row('ldl', 96, 'optimal', '2026-06-20', moved('high', 'optimal', -52))],
      reports: [{ date: '2026-06-20' }],
      today: '2026-08-31',
    });
    const move = insights.find((i) => i.id === 'moved:ldl');
    expect(move.tone).toBe('good');
    expect(move.body).toContain('-52 mg/dL');
  });

  it('stays quiet about a wobble that did not cross a band', () => {
    const insights = buildInsights({
      rows: [row('ldl', 144, 'high', '2026-06-20', moved('high', 'high', -4))],
      reports: [{ date: '2026-06-20' }],
      today: '2026-08-31',
    });
    expect(insights.find((i) => i.id === 'moved:ldl')).toBeUndefined();
  });

  it('says nothing at all when there is no previous reading', () => {
    const insights = buildInsights({
      rows: [row('ldl', 96, 'optimal')],
      reports: [{ date: '2026-06-20' }],
      today: '2026-08-31',
    });
    expect(insights.find((i) => i.id?.startsWith('moved:'))).toBeUndefined();
  });
});

describe('buildInsights — housekeeping', () => {
  it('reports an all-clear when nothing is flagged', () => {
    const insights = buildInsights({
      rows: [row('ldl', 90, 'optimal'), row('hdl', 62, 'optimal')],
      reports: [{ date: '2026-06-20' }],
      today: '2026-08-31',
    });
    const clear = insights.find((i) => i.id === 'all-clear');
    expect(clear.tone).toBe('good');
    expect(clear.body).toContain('2 markers');
  });

  it('mentions a panel older than a year', () => {
    const insights = buildInsights({
      rows: [row('ldl', 90, 'optimal')],
      reports: [{ date: '2025-01-05' }],
      today: '2026-08-31',
    });
    expect(insights.find((i) => i.id === 'checkup-due')).toBeDefined();
  });

  it('does not nag about a recent panel', () => {
    const insights = buildInsights({
      rows: [row('ldl', 90, 'optimal')],
      reports: [{ date: '2026-06-20' }],
      today: '2026-08-31',
    });
    expect(insights.find((i) => i.id === 'checkup-due')).toBeUndefined();
  });

  it('invites a first entry when there is nothing at all', () => {
    const insights = buildInsights({ today: '2026-08-31' });
    expect(insights).toHaveLength(1);
    expect(insights[0].id).toBe('empty');
  });

  it('never invents a sentence from no data', () => {
    for (const insight of buildInsights({ today: '2026-08-31' })) {
      expect(insight.body.length).toBeGreaterThan(0);
      expect(insight.title.length).toBeGreaterThan(0);
    }
  });
});

describe('headline', () => {
  it('summarises the state of the panel in one line', () => {
    expect(headline([])).toEqual({ tone: 'neutral', text: 'No readings yet' });
    expect(headline([row('ldl', 90, 'optimal')])).toEqual({ tone: 'good', text: 'All markers in range' });
    expect(headline([row('ldl', 120, 'borderline')])).toEqual({ tone: 'warn', text: '1 marker needs a look' });
    expect(headline([row('ldl', 190, 'high'), row('tsh', 6, 'borderline')])).toEqual({
      tone: 'alert',
      text: '2 markers need a look',
    });
  });

  it('does not count a marker with no reference range as a problem', () => {
    expect(headline([row('weight', 74, 'unknown')]).tone).toBe('good');
  });
});

describe('inRangeScore', () => {
  it('scores only markers that have a reference range', () => {
    const score = inRangeScore([
      row('ldl', 90, 'optimal'),
      row('hdl', 40, 'borderline'),
      row('weight', 74, 'unknown'),
    ]);
    expect(score).toEqual({ inRange: 1, total: 2, fraction: 0.5 });
  });

  it('returns null when nothing can be scored', () => {
    expect(inRangeScore([])).toBeNull();
    expect(inRangeScore([row('weight', 74, 'unknown')])).toBeNull();
  });
});

describe('reportSummary', () => {
  it('counts statuses across one report', () => {
    const summary = reportSummary([
      { markerKey: 'ldl', value: 148 },
      { markerKey: 'hdl', value: 62 },
      { markerKey: 'totalCholesterol', value: 186 },
      { markerKey: 'weight', value: 74 },
    ]);
    expect(summary.total).toBe(4);
    expect(summary.counts.optimal).toBe(2);
    expect(summary.counts.high).toBe(1);
    expect(summary.counts.unknown).toBe(1);
    expect(summary.flagged).toBe(1);
  });

  it('handles an empty report', () => {
    expect(reportSummary([]).total).toBe(0);
  });
});

describe('sideOfRange', () => {
  it('reads the side from the numbers, not the status name', () => {
    expect(sideOfRange(56, getMarker('hdl'), 'male')).toBe('below');
    expect(sideOfRange(72, getMarker('hdl'), 'male')).toBeNull();
    expect(sideOfRange(141, getMarker('ldl'))).toBe('above');
    expect(sideOfRange(90, getMarker('ldl'))).toBeNull();
    expect(sideOfRange(35, getMarker('alp'))).toBe('below');
    expect(sideOfRange(4.31, getMarker('tsh'))).toBe('above');
  });

  it('returns null for a marker with no healthy window', () => {
    expect(sideOfRange(74, getMarker('weight'))).toBeNull();
    expect(sideOfRange(null, getMarker('ldl'))).toBeNull();
  });
});
