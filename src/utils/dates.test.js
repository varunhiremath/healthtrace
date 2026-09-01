import { describe, it, expect } from 'vitest';
import {
  toDateKey, fromDateKey, isDateKey, daysBetween, monthsBetween, addDays, ageAt,
  formatDate, formatMonth, relativeDate,
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
