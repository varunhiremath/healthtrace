import { describe, it, expect } from 'vitest';
import {
  toDateKey, fromDateKey, isDateKey, daysBetween, monthsBetween, addDays, ageAt,
  formatDate, formatMonth, relativeDate,
  yearBands,
} from './dates.js';

describe('date keys', () => {
  it('formats a Date as a local YYYY-MM-DD key', () => {
    expect(toDateKey(new Date(2026, 2, 4))).toBe('2026-03-04');
    expect(toDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('round-trips a key through a Date without drifting a day', () => {
    for (const key of ['2026-01-01', '2026-03-29', '2026-10-25', '2024-02-29']) {
      expect(toDateKey(fromDateKey(key))).toBe(key);
    }
  });

  it('validates keys, rejecting impossible dates', () => {
    expect(isDateKey('2026-03-04')).toBe(true);
    expect(isDateKey('2024-02-29')).toBe(true);
    expect(isDateKey('2025-02-29')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('2026-3-4')).toBe(false);
    expect(isDateKey('')).toBe(false);
    expect(isDateKey(null)).toBe(false);
  });

  it('returns an empty key for an unparseable date', () => {
    expect(toDateKey('not a date')).toBe('');
    expect(fromDateKey('nope')).toBeNull();
  });
});

describe('date arithmetic', () => {
  it('counts days between keys, including across a DST boundary', () => {
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30);
    expect(daysBetween('2026-03-29', '2026-03-30')).toBe(1);
    expect(daysBetween('2026-10-25', '2026-10-26')).toBe(1);
    expect(daysBetween('2026-03-31', '2026-03-01')).toBe(-30);
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('computes age only after the birthday has passed', () => {
    expect(ageAt('1990-06-15', '2026-06-14')).toBe(35);
    expect(ageAt('1990-06-15', '2026-06-15')).toBe(36);
    expect(ageAt('1990-06-15', '2026-08-31')).toBe(36);
    expect(ageAt('2030-01-01', '2026-01-01')).toBeNull();
    expect(ageAt('', '2026-01-01')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats dates and months for display', () => {
    expect(formatDate('2026-03-04')).toBe('4 Mar 2026');
    expect(formatDate('2026-03-04', { withYear: false })).toBe('4 Mar');
    expect(formatMonth('2026-03-04')).toBe('Mar 2026');
  });

  it('describes how long ago a reading was', () => {
    expect(relativeDate('2026-08-31', '2026-08-31')).toBe('Today');
    expect(relativeDate('2026-08-30', '2026-08-31')).toBe('Yesterday');
    expect(relativeDate('2026-08-26', '2026-08-31')).toBe('5 days ago');
    expect(relativeDate('2026-05-31', '2026-08-31')).toBe('3 months ago');
    expect(relativeDate('2024-08-31', '2026-08-31')).toBe('2 years ago');
  });

  it('shows a future date plainly rather than as negative time', () => {
    expect(relativeDate('2026-09-30', '2026-08-31')).toBe('30 Sep 2026');
  });

  it('counts whole calendar months, not average-length ones', () => {
    expect(monthsBetween('2026-05-31', '2026-08-31')).toBe(3);
    expect(monthsBetween('2026-05-31', '2026-08-30')).toBe(2);
    expect(monthsBetween('2024-08-31', '2026-08-31')).toBe(24);
    // Exactly two years must not round down to one.
    expect(relativeDate('2024-08-31', '2026-08-31')).toBe('2 years ago');
    expect(relativeDate('2024-09-01', '2026-08-31')).toBe('23 months ago');
  });
});

describe('yearBands', () => {
  const at = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
  const jan1 = (y) => new Date(y, 0, 1).getTime();

  it('returns one band for a span inside a single year', () => {
    const bands = yearBands(at(2025, 3, 4), at(2025, 11, 20));
    expect(bands).toHaveLength(1);
    expect(bands[0].year).toBe(2025);
    // A partial year is clamped to the span, not opened out to the whole year.
    expect(bands[0].start).toBe(at(2025, 3, 4));
    expect(bands[0].end).toBe(at(2025, 11, 20));
  });

  it('splits a multi-year span at each new year', () => {
    const bands = yearBands(at(2024, 10, 1), at(2026, 3, 15));
    expect(bands.map((b) => b.year)).toEqual([2024, 2025, 2026]);
    // The stubs at each end keep the span's own bounds...
    expect(bands[0].start).toBe(at(2024, 10, 1));
    expect(bands[2].end).toBe(at(2026, 3, 15));
    // ...while the whole year in the middle runs from January to January.
    expect(bands[1].start).toBe(jan1(2025));
    expect(bands[1].end).toBe(jan1(2026) - 1);
  });

  it('leaves no gap and no overlap between adjacent bands', () => {
    const bands = yearBands(at(2022, 5, 27), at(2026, 7, 11));
    expect(bands.map((b) => b.year)).toEqual([2022, 2023, 2024, 2025, 2026]);
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i].start).toBe(bands[i - 1].end + 1);
    }
  });

  it('covers a leap year end to end', () => {
    const bands = yearBands(jan1(2024), jan1(2025) - 1);
    expect(bands).toHaveLength(1);
    expect(bands[0].end - bands[0].start + 1).toBe(366 * 86400000);
  });

  it('collapses an absurd span rather than emitting thousands of bands', () => {
    const bands = yearBands(at(1900, 1, 1), at(2026, 1, 1));
    expect(bands).toHaveLength(1);
    expect(bands[0].year).toBe(1900);
  });

  it('returns nothing for a backwards or unusable span', () => {
    expect(yearBands(at(2026, 1, 2), at(2026, 1, 1))).toEqual([]);
    expect(yearBands(NaN, at(2026, 1, 1))).toEqual([]);
    expect(yearBands(undefined, null)).toEqual([]);
  });
});
