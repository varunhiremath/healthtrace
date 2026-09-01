// Paste the text of a blood report; get back readings.
//
// This is the fastest way to load years of history, so it is built to be
// CAUTIOUS rather than clever: it only ever claims a marker it can name, it
// reports the confidence and the source line for every hit so the import screen
// can show you exactly what it read, and it refuses to convert a unit it does
// not recognise. Nothing is written to the database from here — the caller
// always confirms first.
//
// It is deliberately regex-and-alias based, with no network and no model: a
// health record should not leave the device to be understood.
//
// Two layouts are handled, because real reports use both:
//
//   Same line    "Total Cholesterol   186 mg/dL   Ref: 0 - 200"
//   Split lines  "White Blood Cells      RBC"          <- labels
//                "Normal value: 3.5 - 10.5 10E3/uL ..." <- ranges
//                "Value                  Value"
//                "9.7                    5.91"          <- values, same order
//
// The second is what an Epic/MyChart PDF becomes once its two-column table is
// flattened into text. It is only trusted when the number of values on a line
// exactly matches the number of markers named above it, which is what keeps the
// axis-tick rows ("200 200 150 150") from being read as results.

import { MARKERS, getMarker } from '../data/markers.js';
import { convertReported } from './units.js';
import { classify } from './ranges.js';

// Derived markers are computed from other readings and must never be stored, so
// the parser does not offer them even when a report prints them.
const PARSEABLE = MARKERS.filter((marker) => !marker.derived);

// Aliases longest-first, so "ldl cholesterol" wins over "cholesterol",
// "fasting blood sugar" over "blood sugar", and — the one that actually bit —
// "hemoglobin a1c" over "hemoglobin".
const ALIAS_INDEX = PARSEABLE.flatMap((marker) =>
  marker.aliases.map((alias) => ({ alias, normalised: normaliseText(alias), key: marker.key }))
).sort((a, b) => b.normalised.length - a.normalised.length);

// Aliases that name a real marker but leave something important unsaid. A bare
// "Glucose" on a metabolic panel does not say whether it was drawn fasting, so
// it is surfaced for review rather than silently filed as a fasting result.
const AMBIGUOUS = new Set(['glucose', 'blood sugar', 'sugar']);

// Fold a report line to a comparable form: lowercase, punctuation that labs use
// decoratively removed, whitespace collapsed. Digits, '.', '/' and '-' survive
// because they carry meaning (values, ratios, ranges, unit spellings).
export function normaliseText(text) {
  let out = String(text ?? '')
    .toLowerCase()
    .replace(/[–—]/g, '-');

  // Strip thousands separators BEFORE commas become spaces, or "1,024" would
  // be read as the number 1.
  let previous;
  do {
    previous = out;
    out = out.replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
  } while (out !== previous);

  return out
    .replace(/[(),:;|\[\]]/g, ' ')
    .replace(/[’']/g, '')
    // Initialisms the way Indian labs print them: "R.B.C" -> "rbc",
    // "M.C.H.C" -> "mchc", "P.C.V" -> "pcv".
    .replace(/\b(?:[a-z]\.){2,}[a-z]?/g, (match) => match.replace(/\./g, ''))
    // A single-letter specimen prefix: "S.Albumin" -> "s albumin", so the
    // marker name behind it is still found.
    .replace(/\b([a-z])\.(?=[a-z])/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A number a lab might print: 5, 5.4, 1234, .89 — but not a digit embedded in a
// word or a unit. Without the letter guards, the "5" in a method note like
// "(Enzymatic UV without P5P)" reads as an AST result of 5, and the "10" in
// "10E3/uL" reads as a value.
const NUMBER = /(?<![A-Za-z0-9.])(\d+\.\d+|\.\d+|\d+)(?![A-Za-z0-9])/g;

function parseNumber(raw) {
  const value = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

// Units as labs print them, so the value that follows a unit is not mistaken
// for the reading itself, and so a reported unit can be converted.
const UNIT_PATTERN =
  /(mg\s*\/\s*dl|g\s*\/\s*dl|gm\s*\/\s*dl|gms\s*\/\s*dl|mmol\s*\/\s*l|umol\s*\/\s*l|µmol\s*\/\s*l|μmol\s*\/\s*l|nmol\s*\/\s*l|pmol\s*\/\s*l|ng\s*\/\s*ml|pg\s*\/\s*ml|ug\s*\/\s*dl|µg\s*\/\s*dl|μg\s*\/\s*dl|miu\s*\/\s*ml|uiu\s*\/\s*ml|µiu\s*\/\s*ml|μiu\s*\/\s*ml|iu\s*\/\s*ml|iu\s*\/\s*l|mg\s*\/\s*l|u\s*\/\s*l|meq\s*\/\s*l|mm\s*\/\s*hr|mmhg|bpm|kg\s*\/\s*m2|10[e*^]3\s*\/\s*ul|10[e*^]6\s*\/\s*ul|x?\s*10³\s*cells\s*\/\s*cumm|lakhs?\s*\/\s*cumm|millions?\s*\/\s*cumm|mill\s*\/\s*cumm|thou(?:sands)?\s*\/\s*cumm|cells\s*\/\s*cumm|\/\s*cumm|fl|pg|%|k\s*\/\s*ul|m\s*\/\s*ul|kg|lb|cm|in)/i;

// Blood pressure is the one marker printed as a pair.
const BP_PATTERN = /(?:blood pressure|bp)\b[^\d]{0,12}(\d{2,3})\s*\/\s*(\d{2,3})/i;

// Text that means "this number is a reference range, not my result".
const RANGE_HINT =
  /\b(?:ref(?:erence)?|normal|biological|bio)\s*(?:range|interval|value|values|limits)?\b|\brange\b/i;

// Function words that appear in a sentence about a marker but never in a lab
// row's label. Between a marker name and a number they mean prose, not result:
// "Random glucose of 200 mg/dL or greater in patients with..." is guidance text,
// not this patient's reading.
const PROSE_WORDS =
  /\b(?:of|or|is|are|was|were|in|with|than|above|below|greater|less|and|for|the|at|when|if|per|may|can|should|considers|requires|levels|exceeding|patients|goal|therapy|criteria|diagnosis|recommend|caused|seen|increased|decreased)\b/;

// A result row is terse. A line with this many words is a sentence.
const PROSE_WORD_COUNT = 10;

function wordCount(normalisedLine) {
  return (normalisedLine.match(/[a-z]{2,}/g) ?? []).length;
}

// How far below a label line to look for the values belonging to it.
const LOOKAHEAD = 4;

/**
 * Parse pasted lab-report text into candidate readings.
 *
 * @returns {{ hits: Array, unmatchedLines: string[] }}
 *   Each hit: { markerKey, value, unit, converted, confidence, status, line, lineNumber }
 */
export function parseReport(text, { sex } = {}) {
  const lines = String(text ?? '').split(/\r?\n/);
  const normalised = lines.map(normaliseText);
  const hits = [];
  const unmatchedLines = [];
  // First mention of a marker wins — reports repeat marker names in summaries
  // and interpretation notes further down the page.
  const claimed = new Set();
  // Lines already consumed as the values of a label line above them.
  const consumed = new Set();

  lines.forEach((rawLine, index) => {
    if (consumed.has(index)) return;
    const line = rawLine.trim();
    if (!line) return;

    // Blood pressure first: "128/82" would otherwise read as one number.
    const bp = line.match(BP_PATTERN);
    if (bp) {
      const systolic = parseNumber(bp[1]);
      const diastolic = parseNumber(bp[2]);
      if (systolic && diastolic && systolic > diastolic) {
        for (const [key, value] of [['systolic', systolic], ['diastolic', diastolic]]) {
          if (!claimed.has(key)) {
            hits.push(makeHit(key, value, 'mmHg', line, index, 0.95, sex));
            claimed.add(key);
          }
        }
        return;
      }
    }

    const labels = findLabels(normalised[index]).filter((label) => !claimed.has(label.key));
    if (!labels.length) {
      if (hasNumber(line)) unmatchedLines.push(line);
      return;
    }

    // --- Same line: the value sits after the marker name ------------------
    // The FIRST marker named on the row owns the value that follows: a lab row
    // reads "LABEL (method) value unit range". Taking the last one instead made
    // "ESR ... 13 mm/hr 0 - 9" read as a heart rate of 0.
    const first = labels[0];
    const tail = normalised[index].slice(first.end);
    const found = firstValue(tail);
    if (found) {
      const marker = getMarker(first.key);
      const reported = convertReported(found.value, found.unit, marker);
      let confidence = found.unit ? 0.9 : 0.7;
      if (found.unit && !reported.recognised) confidence = 0.4;
      // A reference range printed AFTER the result — "Cholesterol 186 mg/dL
      // Ref: 0 - 200" — is the normal way labs lay a row out, and the number we
      // took is the result. Only doubt a hint that comes BEFORE the number.
      const hint = tail.match(RANGE_HINT);
      if (hint && hint.index < found.at) confidence -= 0.3;
      // Prose between the marker name and the number, or a line long enough to
      // be a sentence, means this is guidance text rather than a result.
      if (PROSE_WORDS.test(tail.slice(0, found.at))) confidence -= 0.4;
      if (wordCount(normalised[index]) >= PROSE_WORD_COUNT) confidence -= 0.4;
      const isPlausible = plausible(reported.value, marker);
      if (!isPlausible) confidence -= 0.35;
      if (AMBIGUOUS.has(first.alias)) confidence = Math.min(confidence, 0.5);

      hits.push(
        makeHit(first.key, reported.value, found.unit || marker.unit, line, index, confidence, sex, reported.converted)
      );
      // A doubtful reading must not lock the marker: a better line further down
      // the report should still get its chance.
      if (isPlausible && confidence >= 0.7) claimed.add(first.key);
      return;
    }

    // --- Split lines: the values are on a line below the labels -----------
    // Positional mapping is only safe when the label line is fully accounted
    // for. A single named marker sitting beside an unnamed one — "A/G Ratio
    // Total Bilirubin" — has two value columns but one label, so an exact count
    // match would be a coincidence, and the value taken would be the wrong
    // column's. Two or more named labels means the row is one we can read.
    if (labels.length < 2 && hasLeftoverLabel(normalised[index], labels)) {
      if (hasNumber(line)) unmatchedLines.push(line);
      return;
    }
    const below = findValueLine(lines, normalised, index, labels.length, consumed);
    if (!below) {
      unmatchedLines.push(line);
      return;
    }

    // If the skipped reference line names exactly one unit per label, they are
    // in the same column order as the labels and the values.
    const units = below.units.length === labels.length ? below.units : [];

    labels.forEach((label, column) => {
      const marker = getMarker(label.key);
      const raw = below.values[column];
      const reported = convertReported(raw, units[column] ?? '', marker);
      let confidence = units.length ? 0.85 : 0.75;
      if (units.length && !reported.recognised) confidence = 0.4;
      const isPlausible = plausible(reported.value, marker);
      if (!isPlausible) confidence -= 0.35;
      if (AMBIGUOUS.has(label.alias)) confidence = Math.min(confidence, 0.5);

      hits.push(
        makeHit(
          label.key,
          reported.value,
          units[column] || marker.unit,
          `${line}  →  ${below.line}`,
          index,
          confidence,
          sex,
          reported.converted
        )
      );
      if (isPlausible && confidence >= 0.7) claimed.add(label.key);
    });
    consumed.add(below.index);
  });

  return { hits: bestPerMarker(hits), unmatchedLines };
}

// One row per marker on the import screen. When a report mentions a marker more
// than once — a real result and a passing mention in the interpretation notes —
// keep the reading we are most confident in.
function bestPerMarker(hits) {
  const best = new Map();
  for (const hit of hits) {
    const existing = best.get(hit.markerKey);
    if (!existing || hit.confidence > existing.confidence) best.set(hit.markerKey, hit);
  }
  return [...best.values()].sort((a, b) => a.lineNumber - b.lineNumber);
}

// Is there wording on the label line that no matched alias accounts for? That
// usually means another column whose marker we could not name.
function hasLeftoverLabel(normalisedLine, labels) {
  let leftover = normalisedLine;
  // Blank out each matched alias, longest span first so offsets stay valid.
  for (const label of [...labels].sort((a, b) => b.at - a.at)) {
    leftover = leftover.slice(0, label.at) + ' '.repeat(label.end - label.at) + leftover.slice(label.end);
  }
  // "%", "(auto)" and similar decoration are not a column of their own.
  const words = leftover.replace(/\b(?:auto|calculated|derived|total|serum|value|%)\b/g, ' ').match(/[a-z]{2,}/g);
  return Boolean(words && words.join('').length >= 3);
}

// Every marker named on one line, left to right, longest alias winning and no
// two claims overlapping. "White Blood Cells RBC" yields both.
function findLabels(normalisedLine) {
  const taken = [];
  const found = [];

  for (const entry of ALIAS_INDEX) {
    let from = 0;
    for (;;) {
      const at = normalisedLine.indexOf(entry.normalised, from);
      if (at === -1) break;
      const end = at + entry.normalised.length;
      from = at + 1;
      if (!isWholeToken(normalisedLine, at, entry.normalised.length)) continue;
      if (taken.some(([s, e]) => at < e && end > s)) continue;
      if (found.some((f) => f.key === entry.key)) continue;
      taken.push([at, end]);
      found.push({ key: entry.key, alias: entry.normalised, at, end });
      break;
    }
  }

  return found.sort((a, b) => a.at - b.at);
}

// Whole-token match: "hdl" must not fire inside "hdlx", and "ast" must not fire
// inside "fast" or "plastic".
function isWholeToken(normalisedLine, at, length) {
  const before = at === 0 ? ' ' : normalisedLine[at - 1];
  const after = normalisedLine[at + length] ?? ' ';
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
}

// Look below a label line for the line holding its values. Reference-range and
// header lines are skipped; a candidate is accepted only when it carries
// EXACTLY as many numbers as there were labels, which is what stops an axis-tick
// row like "200 200 150 150" from being read as two results.
function findValueLine(lines, normalised, labelIndex, count, consumed) {
  let units = [];

  for (let offset = 1; offset <= LOOKAHEAD; offset += 1) {
    const index = labelIndex + offset;
    if (index >= lines.length || consumed.has(index)) continue;
    const text = normalised[index];
    if (!text) continue;

    if (RANGE_HINT.test(text)) {
      // Remember the units printed on the reference line — they are in the same
      // column order as the labels.
      units = [...text.matchAll(new RegExp(UNIT_PATTERN.source, 'gi'))].map((m) => m[0].replace(/\s+/g, ''));
      continue;
    }

    const numbers = [...text.matchAll(NUMBER)].map((m) => parseNumber(m[1])).filter((n) => n != null);
    if (!numbers.length) continue; // a "Value Value" header row
    if (numbers.length !== count) return null; // shape does not match: do not guess
    return { index, line: lines[index].trim(), values: numbers, units };
  }
  return null;
}

// The first number in the text after the marker name, plus the unit printed
// beside it if there is one, and where in the line it was found.
function firstValue(tail) {
  NUMBER.lastIndex = 0;
  const match = NUMBER.exec(tail);
  if (!match) return null;
  const value = parseNumber(match[1]);
  if (value == null) return null;
  const after = tail.slice(match.index + match[0].length, match.index + match[0].length + 24);
  const unitMatch = after.match(UNIT_PATTERN);
  return { value, unit: unitMatch ? unitMatch[0].replace(/\s+/g, '') : '', at: match.index };
}

function hasNumber(line) {
  NUMBER.lastIndex = 0;
  const has = NUMBER.test(line);
  NUMBER.lastIndex = 0;
  return has;
}

// Is this value even in the same universe as the marker's scale? Generous by
// design — a genuinely alarming reading must still get through.
function plausible(value, marker) {
  if (value == null || !Number.isFinite(value)) return false;
  const [min, max] = marker.scale;
  const span = max - min;
  return value >= min - span * 2 && value <= max + span * 4;
}

function makeHit(markerKey, value, unit, line, lineNumber, confidence, sex, converted = false) {
  const marker = getMarker(markerKey);
  return {
    markerKey,
    value: round2(value),
    unit,
    converted,
    confidence: Math.max(0, Math.min(1, round2(confidence))),
    status: classify(value, marker, sex),
    line: line.trim(),
    lineNumber,
  };
}

function round2(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : n;
}

// Find the date a report was taken, so the import screen can pre-fill it.
// Handles 04/03/2026, 04-03-2026, 2026-03-04 and "4 Mar 2026".
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseReportDate(text, { dayFirst = true } = {}) {
  const source = String(text ?? '');

  const iso = source.match(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/);
  if (iso) return validKey(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // "4 Mar 2026" and "11 Jul 2026 08:25"
  const dayFirstNamed = source.match(/(?<!\d)(\d{1,2})[\s-]([a-zA-Z]{3,9})[\s-](\d{4})(?!\d)/);
  if (dayFirstNamed) {
    const month = MONTH_NAMES.indexOf(dayFirstNamed[2].slice(0, 3).toLowerCase());
    if (month !== -1) return validKey(Number(dayFirstNamed[3]), month + 1, Number(dayFirstNamed[1]));
  }

  // "Nov 04, 2025" — how US reports print it.
  const monthFirstNamed = source.match(/\b([a-zA-Z]{3,9})\s+(\d{1,2}),?\s+(\d{4})(?!\d)/);
  if (monthFirstNamed) {
    const month = MONTH_NAMES.indexOf(monthFirstNamed[1].slice(0, 3).toLowerCase());
    if (month !== -1) return validKey(Number(monthFirstNamed[3]), month + 1, Number(monthFirstNamed[2]));
  }

  const slashed = source.match(/(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?!\d)/);
  if (slashed) {
    let day = Number(slashed[1]);
    let month = Number(slashed[2]);
    // A value above 12 in the first slot settles the ambiguity by itself.
    if (!dayFirst || day <= 12) {
      if (month > 12 && day <= 12) {
        [day, month] = [month, day];
      } else if (!dayFirst) {
        [day, month] = [month, day];
      }
    }
    return validKey(Number(slashed[3]), month, day);
  }

  return null;
}

function validKey(year, month, day) {
  if (!(year >= 1900 && year <= 2200)) return null;
  if (!(month >= 1 && month <= 12)) return null;
  if (!(day >= 1 && day <= 31)) return null;
  const probe = new Date(year, month - 1, day, 12);
  if (probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/* --------------------------------------------------------- whose report? */

// Titles a lab prints before a name, and the field labels that mark where the
// name stops on a crowded header line.
const TITLES = /^(?:mr|mrs|ms|miss|master|dr|shri|smt)\.?\s+/i;
const NAME_STOPS =
  /\s*(?:\||dob\b|d\.o\.b\b|age\b|sex\b|gender\b|mrn\b|reg\b|registration\b|lab\s*no\b|patient\b|uhid\b|pcp\b|legal\b|referred\b|collected\b|,).*$/i;

/**
 * Pull the patient's name out of a report header, so a pasted report can be
 * filed under the right person without the household having to remember which
 * PDF was whose.
 *
 * Returns null rather than a guess: a wrong name would put someone's blood work
 * in someone else's history, which is worse than asking.
 */
export function parseReportName(text) {
  const lines = String(text ?? '').split(/\r?\n/).slice(0, 40);

  for (const line of lines) {
    // "Name : Mr. ALEX RIVERA   Age : 40 Yr(s)"
    const labelled = line.match(/\bname\s*:?\s*(.+)$/i);
    if (labelled) {
      const name = cleanName(labelled[1]);
      if (name) return name;
    }
    // "Dear Mr Alex Rivera ,"
    const greeting = line.match(/^\s*dear\s+(.+)$/i);
    if (greeting) {
      const name = cleanName(greeting[1]);
      if (name) return name;
    }
  }
  return null;
}

function cleanName(raw) {
  let name = String(raw).replace(NAME_STOPS, '').replace(TITLES, '').trim();
  name = name.replace(/\s+/g, ' ').replace(/[.,|]+$/, '').trim();
  // Two to four words of letters. Anything else is a header we misread.
  if (!/^[a-zA-Z][a-zA-Z' -]*(?:\s+[a-zA-Z][a-zA-Z' -]*){0,3}$/.test(name)) return null;
  if (name.length < 2 || name.length > 60) return null;
  // Title case, so "ALEX RIVERA" and "alex rivera" display the same.
  return name
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Which of these people does a name from a report refer to?
 *
 * Matches on the whole name, or on every word of the shorter name appearing in
 * the longer one — so a profile called "Alex" matches a report for "Alex
 * Rivera", and vice versa. An ambiguous match (two people it fits equally)
 * returns null, because picking one would be a coin flip.
 */
export function matchProfileByName(name, profiles = []) {
  const wanted = normaliseName(name);
  if (!wanted) return null;

  const exact = profiles.filter((p) => normaliseName(p.name) === wanted);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const wantedWords = wanted.split(' ').filter(Boolean);
  const partial = profiles.filter((profile) => {
    const words = normaliseName(profile.name).split(' ').filter(Boolean);
    if (!words.length) return false;
    const [shorter, longer] = words.length <= wantedWords.length ? [words, wantedWords] : [wantedWords, words];
    return shorter.every((word) => longer.includes(word));
  });
  return partial.length === 1 ? partial[0] : null;
}

function normaliseName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(TITLES, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
