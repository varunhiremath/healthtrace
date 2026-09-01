import { describe, it, expect } from 'vitest';
import { toCsv, fromCsv, parseCsv, escapeCsv, CSV_HEADERS } from './csv.js';

const readings = [
  { markerKey: 'ldl', date: '2026-06-20', value: 118, note: '' },
  { markerKey: 'hdl', date: '2025-06-15', value: 44, note: 'fasted 12h' },
];

describe('toCsv', () => {
  it('writes a header and one row per reading, newest first', () => {
    const lines = toCsv(readings).split('\n');
    expect(lines[0]).toBe(CSV_HEADERS.join(','));
    expect(lines[1]).toContain('2026-06-20');
    expect(lines[1]).toContain('ldl');
    expect(lines[1]).toContain('118');
    expect(lines[2]).toContain('2025-06-15');
  });

  it('includes the status it computed', () => {
    expect(toCsv([{ markerKey: 'ldl', date: '2026-06-20', value: 148 }])).toContain('high');
  });

  it('skips readings for markers that no longer exist', () => {
    const csv = toCsv([{ markerKey: 'gone', date: '2026-06-20', value: 1 }]);
    expect(csv.split('\n')).toHaveLength(1);
  });
});

describe('escapeCsv', () => {
  it('quotes fields containing commas, quotes or newlines', () => {
    expect(escapeCsv('plain')).toBe('plain');
    expect(escapeCsv('a,b')).toBe('"a,b"');
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsv('two\nlines')).toBe('"two\nlines"');
  });

  it('defuses values a spreadsheet would run as a formula', () => {
    expect(escapeCsv('=1+1')).toBe("'=1+1");
    expect(escapeCsv('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCsv('-2')).toBe("'-2");
    // A formula that also needs quoting gets both treatments.
    expect(escapeCsv('=A1,B1')).toBe('"\'=A1,B1"');
  });

  it('renders empty and null as an empty field', () => {
    expect(escapeCsv(null)).toBe('');
    expect(escapeCsv(undefined)).toBe('');
  });
});

describe('parseCsv', () => {
  it('handles quoted fields, embedded commas and doubled quotes', () => {
    const rows = parseCsv('a,b\n"one, two","he said ""hi"""');
    expect(rows).toEqual([
      ['a', 'b'],
      ['one, two', 'he said "hi"'],
    ]);
  });

  it('handles CRLF line endings and drops blank lines', () => {
    expect(parseCsv('a,b\r\n1,2\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('fromCsv', () => {
  it('round-trips what toCsv produced', () => {
    const { readings: back, skipped } = fromCsv(toCsv(readings));
    expect(skipped).toEqual([]);
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ markerKey: 'ldl', date: '2026-06-20', value: 118 });
    expect(back[1].note).toBe('fasted 12h');
  });

  it('accepts columns in any order and ignores extras', () => {
    const { readings: back, skipped } = fromCsv('value,extra,marker,date\n118,junk,ldl,2026-06-20');
    expect(skipped).toEqual([]);
    expect(back[0]).toMatchObject({ markerKey: 'ldl', value: 118 });
  });

  it('refuses a file missing the required columns', () => {
    const { readings: back, skipped } = fromCsv('foo,bar\n1,2');
    expect(back).toEqual([]);
    expect(skipped[0]).toContain('date, marker and value');
  });

  it('reports bad rows by line number instead of guessing', () => {
    const csv = 'date,marker,value\n2026-13-01,ldl,118\n2026-06-20,nope,118\n2026-06-20,ldl,abc\n2026-06-20,ldl,118';
    const { readings: back, skipped } = fromCsv(csv);
    expect(back).toHaveLength(1);
    expect(skipped).toHaveLength(3);
    expect(skipped[0]).toContain('Line 2');
    expect(skipped[1]).toContain('Line 3');
    expect(skipped[2]).toContain('Line 4');
  });

  it('handles an empty file', () => {
    expect(fromCsv('').readings).toEqual([]);
    expect(fromCsv('').skipped[0]).toContain('no rows');
  });
});
