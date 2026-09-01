import { describe, it, expect } from 'vitest';
import { buildMarkerShare, buildSnapshotShare, pickShareStrategy } from './shareText.js';
import { getMarker } from '../data/markers.js';

const row = (markerKey, value, status, date = '2026-06-20', delta = null) => ({
  markerKey, marker: getMarker(markerKey), value, status, date, delta,
});

describe('buildMarkerShare', () => {
  it('sends the number together with the context that makes it readable', () => {
    const share = buildMarkerShare({ row: row('ldl', 141, 'high') });
    expect(share.text).toContain('LDL Cholesterol: 141 mg/dL');
    expect(share.text).toContain('Above range');
    expect(share.text).toContain('usual range Under 100 mg/dL');
    expect(share.text).toContain('Measured 20 Jun 2026');
  });

  it('leaves the person out unless asked', () => {
    const anonymous = buildMarkerShare({ row: row('ldl', 141, 'high'), profileName: 'Alex' });
    expect(anonymous.who).toBe('');
    expect(anonymous.text).not.toContain('Alex');

    const named = buildMarkerShare({ row: row('ldl', 141, 'high'), profileName: 'Alex', includeName: true });
    expect(named.who).toBe('Alex');
    expect(named.text).toContain('Alex — LDL Cholesterol: 141 mg/dL');
  });

  it('says which way a change was going', () => {
    const better = buildMarkerShare({
      row: row('ldl', 96, 'optimal', '2026-06-20', { change: -45, direction: 'better' }),
    });
    expect(better.deltaLabel).toContain('-45 mg/dL');
    expect(better.deltaLabel).toContain('moving the right way');

    const worse = buildMarkerShare({
      row: row('ldl', 141, 'high', '2026-06-20', { change: 22, direction: 'worse' }),
    });
    expect(worse.deltaLabel).toContain('+22 mg/dL');
    expect(worse.deltaLabel).toContain('moving the wrong way');
  });

  it('uses the reader-facing unit when one is chosen', () => {
    const share = buildMarkerShare({ row: row('ldl', 100, 'optimal'), units: { ldl: 'alt' } });
    expect(share.unit).toBe('mmol/L');
    expect(share.value).toBe('3');
  });

  it('follows sex-specific ranges', () => {
    const female = buildMarkerShare({ row: row('hdl', 45, 'low'), sex: 'female' });
    expect(female.rangeLabel).toContain('60 and above');
  });

  it('is honest about a marker with no reference range', () => {
    const share = buildMarkerShare({ row: row('weight', 74, 'unknown') });
    expect(share.rangeLabel).toBe('No general reference range');
    expect(share.text).not.toContain('usual range');
  });

  it('returns null rather than an empty card', () => {
    expect(buildMarkerShare({ row: null })).toBeNull();
    expect(buildMarkerShare({})).toBeNull();
    expect(buildMarkerShare({ row: { markerKey: 'nope', value: 1 } })).toBeNull();
  });
});

describe('buildSnapshotShare', () => {
  const rows = [
    row('ldl', 141, 'high'),
    row('hdl', 44, 'borderline'),
    row('hba1c', 5.4, 'optimal'),
    row('tsh', 2.1, 'optimal'),
    row('weight', 74, 'unknown'),
  ];

  it('leads with the count and lists what is outside range', () => {
    const share = buildSnapshotShare({ rows });
    expect(share.text).toContain('2 of 4 markers in range');
    expect(share.text).toContain('Outside range:');
    expect(share.text).toContain('LDL Cholesterol: 141 mg/dL');
    expect(share.flagged).toBe(2);
  });

  it('does not count markers that have no range', () => {
    expect(buildSnapshotShare({ rows }).total).toBe(4);
  });

  it('caps a long list so the message stays readable', () => {
    const many = Array.from({ length: 12 }, () => row('ldl', 141, 'high'));
    const share = buildSnapshotShare({ rows: many, limit: 3 });
    expect(share.text).toContain('…and 9 more');
    expect(share.text.split('•')).toHaveLength(4);
  });

  it('says nothing when there is nothing to say', () => {
    expect(buildSnapshotShare({ rows: [] })).toBeNull();
    expect(buildSnapshotShare({ rows: [row('weight', 74, 'unknown')] })).toBeNull();
  });

  it('leaves the person out unless asked', () => {
    expect(buildSnapshotShare({ rows, profileName: 'Alex' }).text).not.toContain('Alex');
    expect(buildSnapshotShare({ rows, profileName: 'Alex', includeName: true }).text).toContain('Alex:');
  });
});

describe('pickShareStrategy', () => {
  const file = new Blob(['x']);

  it('prefers sharing the image when the browser can', () => {
    const nav = { share: () => {}, canShare: () => true };
    expect(pickShareStrategy(nav, file)).toBe('file');
  });

  it('falls back to text when files are not shareable', () => {
    const nav = { share: () => {}, canShare: () => false };
    expect(pickShareStrategy(nav, file)).toBe('text');
  });

  it('falls back to text when there is no canShare at all', () => {
    expect(pickShareStrategy({ share: () => {} }, file)).toBe('text');
  });

  it('falls back to the clipboard, then to a download', () => {
    expect(pickShareStrategy({ clipboard: { writeText: () => {} } }, file)).toBe('clipboard');
    expect(pickShareStrategy({}, file)).toBe('download');
    expect(pickShareStrategy(null, file)).toBe('download');
  });
});
