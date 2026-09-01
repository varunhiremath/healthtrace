// Dates are stored as 'YYYY-MM-DD' strings, never as Date objects or epoch
// numbers. A local calendar day is what a health reading actually belongs to,
// and a string sorts, compares and survives JSON export without a timezone ever
// shifting a reading into the wrong day.

export function toDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey() {
  return toDateKey(new Date());
}

// Parse 'YYYY-MM-DD' at local noon, so daylight-saving shifts can never move it
// to the previous or next day.
export function fromDateKey(key) {
  if (!isDateKey(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function isDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(y, m - 1, d, 12);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

export function daysBetween(fromKey, toKey) {
  const a = fromDateKey(fromKey);
  const b = fromDateKey(toKey);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

export function daysAgo(key, from = todayKey()) {
  return daysBetween(key, from);
}

export function addDays(key, days) {
  const d = fromDateKey(key);
  if (!d) return '';
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

// Whole years between two date keys — the birthday must have passed.
export function ageAt(dobKey, onKey = todayKey()) {
  const dob = fromDateKey(dobKey);
  const on = fromDateKey(onKey);
  if (!dob || !on || on < dob) return null;
  let age = on.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    on.getMonth() < dob.getMonth() ||
    (on.getMonth() === dob.getMonth() && on.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2026-03-04' -> '4 Mar 2026'
export function formatDate(key, { withYear = true } = {}) {
  const d = fromDateKey(key);
  if (!d) return '';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withYear ? `${base} ${d.getFullYear()}` : base;
}

// '2026-03-04' -> 'Mar 2026' (chart axes, report groupings)
export function formatMonth(key) {
  const d = fromDateKey(key);
  if (!d) return '';
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Whole calendar months between two keys — the day-of-month must have passed,
// the same rule `ageAt` uses for birthdays. Dividing days by an average month
// length instead would report exactly two years as "1 year ago".
export function monthsBetween(fromKey, toKey) {
  const a = fromDateKey(fromKey);
  const b = fromDateKey(toKey);
  if (!a || !b) return null;
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return months;
}

// "Today", "Yesterday", "5 days ago", "3 months ago", "2 years ago".
export function relativeDate(key, from = todayKey()) {
  const days = daysBetween(key, from);
  if (days == null) return '';
  if (days < 0) return formatDate(key);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = monthsBetween(key, from);
  if (months < 24) return months <= 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

// The calendar years a time span touches, each clamped to the span itself.
//
// A chart striping its x-axis by year needs the bounds of every year it shows,
// including the partial ones at each end — a run from Oct 2024 to Mar 2026 has
// a stub of 2024, all of 2025, and a stub of 2026. Bounds are epoch
// milliseconds because that is what a time axis is scaled in; the span is not
// date keys, since a chart pads its domain past the first and last reading.
export function yearBands(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];

  const first = new Date(startMs).getFullYear();
  const last = new Date(endMs).getFullYear();
  // Nothing is legible striped a hundred ways, and a corrupt date should not
  // spin out thousands of bands. Past that, the span is one undivided block.
  if (last - first > MAX_YEAR_BANDS) return [{ year: first, start: startMs, end: endMs }];

  const bands = [];
  for (let year = first; year <= last; year += 1) {
    const opens = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
    // The last instant before the next year opens, so two bands never overlap.
    const closes = new Date(year + 1, 0, 1, 0, 0, 0, 0).getTime() - 1;
    bands.push({ year, start: Math.max(opens, startMs), end: Math.min(closes, endMs) });
  }
  return bands;
}

const MAX_YEAR_BANDS = 40;
