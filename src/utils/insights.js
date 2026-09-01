// Plain-English sentences about your own numbers.
//
// Two hard rules, because this is health data:
//   1. Nothing here diagnoses, prescribes, or predicts. Every sentence either
//      restates a number, compares it to a published reference range, or
//      describes a change over time.
//   2. Nothing is invented. If the data does not support a sentence, no
//      sentence is produced — an empty list is a valid, honest result.

import { getMarker } from '../data/markers.js';
import { classify, isOutOfRange, severity, formatValue, formatRange, optimalRange } from './ranges.js';
import { relativeDate, daysBetween, todayKey, formatDate } from './dates.js';

// How stale a full blood panel is allowed to get before we mention it.
export const CHECKUP_INTERVAL_DAYS = 365;

/**
 * @param {object} input
 *   rows           output of trends.summarise() — one row per tracked marker
 *   reports        all reports, any order
 *   sex            'male' | 'female' | undefined
 *   today          date key, injectable for tests
 * @returns {Array<{ id, tone, title, body, markerKey? }>} newest concern first
 */
export function buildInsights({ rows = [], reports = [], sex, today = todayKey() } = {}) {
  const insights = [];

  /* ---------------------------------------------------- what is out of range */
  const flagged = rows.filter((row) => isOutOfRange(row.status));
  const worst = [...flagged].sort((a, b) => severity(b.status) - severity(a.status));

  for (const row of worst.slice(0, 4)) {
    const marker = row.marker ?? getMarker(row.markerKey);
    const range = formatRange(marker, sex);
    const value = `${formatValue(row.value, marker)} ${marker.unit}`;
    const where = range ? ` The usual range is ${range}.` : '';
    insights.push({
      id: `out-of-range:${row.markerKey}`,
      tone: severity(row.status) >= 2 ? 'alert' : 'warn',
      markerKey: row.markerKey,
      title: describeMiss(marker.name, row.value, row.status, marker, sex),
      body: `Your last reading was ${value}, from ${relativeDate(row.date, today)}.${where}`,
    });
  }

  /* ------------------------------------------------------- meaningful moves */
  for (const row of rows) {
    const d = row.delta;
    if (!d || d.direction === 'unknown' || d.direction === 'flat') continue;
    const marker = getMarker(row.markerKey);
    // Only mention a move that crossed a band boundary — otherwise every
    // sample-to-sample wobble becomes a headline.
    if (d.statusBefore === d.statusAfter) continue;

    const improved = d.direction === 'better';
    const size = `${d.change > 0 ? '+' : ''}${formatValue(d.change, marker)} ${marker.unit}`;
    insights.push({
      id: `moved:${row.markerKey}`,
      tone: improved ? 'good' : 'warn',
      markerKey: row.markerKey,
      title: improved
        ? `${marker.name} moved back toward range`
        : `${marker.name} moved out of range`,
      body: `${size} since ${formatDate(d.from.date)}, from ${formatValue(d.from.value, marker)} to ${formatValue(d.to.value, marker)} ${marker.unit}.`,
    });
  }

  /* ------------------------------------------------------- steady and clear */
  const clear = rows.filter((row) => row.status === 'optimal');
  if (rows.length && flagged.length === 0) {
    insights.push({
      id: 'all-clear',
      tone: 'good',
      title: 'Everything tracked is in range',
      body: `All ${clear.length} marker${clear.length === 1 ? '' : 's'} with a reference range sit inside it.`,
    });
  }

  /* --------------------------------------------------------- checkup timing */
  const lastPanel = [...reports].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (lastPanel) {
    const age = daysBetween(lastPanel.date, today);
    if (age != null && age >= CHECKUP_INTERVAL_DAYS) {
      insights.push({
        id: 'checkup-due',
        tone: 'warn',
        title: 'Your last panel is over a year old',
        body: `The most recent report on file is from ${formatDate(lastPanel.date)} — ${relativeDate(lastPanel.date, today).toLowerCase()}.`,
      });
    }
  } else if (rows.length === 0) {
    insights.push({
      id: 'empty',
      tone: 'neutral',
      title: 'Nothing tracked yet',
      body: 'Add a report or log a vital, and your trends start building from there.',
    });
  }

  return insights;
}

// Which side of the healthy window a value fell on.
//
// This cannot be read off the status name: 'borderline' means BELOW the window
// for a marker where higher is better (an HDL below the level it should clear)
// and ABOVE it for one where lower is better. Getting this from the numbers is
// the only way the sentence stays true for both.
export function sideOfRange(value, marker, sex) {
  const range = optimalRange(marker, sex);
  if (!range || value == null || !Number.isFinite(value)) return null;
  if (range.min != null && value <= range.min) return 'below';
  if (range.max != null && value > range.max) return 'above';
  return null;
}

function describeMiss(name, value, status, marker, sex) {
  const side = sideOfRange(value, marker, sex);
  if (!side) return `${name} needs a look`;
  if (status === 'borderline') return `${name} is just ${side} its usual range`;
  if (status === 'critical') return `${name} is well ${side} range`;
  return `${name} is ${side} range`;
}

// A one-line verdict for the top of Home: how many markers need a look.
export function headline(rows = []) {
  if (!rows.length) return { tone: 'neutral', text: 'No readings yet' };
  const flagged = rows.filter((row) => isOutOfRange(row.status));
  if (!flagged.length) return { tone: 'good', text: 'All markers in range' };
  const serious = flagged.filter((row) => severity(row.status) >= 2).length;
  const count = flagged.length;
  return {
    tone: serious ? 'alert' : 'warn',
    text: `${count} marker${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} a look`,
  };
}

// The share of markers with a reference range that sit inside it — the number
// behind the ring on Home. Returns null when nothing can be scored.
export function inRangeScore(rows = []) {
  const scorable = rows.filter((row) => row.status !== 'unknown');
  if (!scorable.length) return null;
  const inRange = scorable.filter((row) => row.status === 'optimal').length;
  return { inRange, total: scorable.length, fraction: inRange / scorable.length };
}

// Everything measured on one date, grouped for the report detail screen.
export function reportSummary(readings = [], sex) {
  const counts = { optimal: 0, borderline: 0, low: 0, high: 0, critical: 0, unknown: 0 };
  for (const reading of readings) {
    const status = classify(reading.value, getMarker(reading.markerKey), sex);
    counts[status] = (counts[status] ?? 0) + 1;
  }
  const flagged = counts.borderline + counts.low + counts.high + counts.critical;
  return { counts, flagged, total: readings.length };
}
