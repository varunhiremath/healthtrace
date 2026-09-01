// Every reading is STORED in its marker's canonical unit (see data/markers.js)
// and converted only at the edges — display, entry, and lab-report import.
// Keeping storage single-unit means a user who switches to mmol/L never has to
// rewrite their history, and a chart never mixes two scales.

import { getMarker } from '../data/markers.js';

// Temperature is the one conversion that is not a plain ratio, so it gets a
// pair of functions instead of a factor.
const SPECIAL = {
  temperature: {
    toAlt: (c) => c * (9 / 5) + 32,
    fromAlt: (f) => (f - 32) * (5 / 9),
  },
};

export function hasAltUnit(marker) {
  const m = typeof marker === 'string' ? getMarker(marker) : marker;
  return Boolean(m?.altUnit);
}

// Canonical -> alternate unit.
export function toAlt(value, marker) {
  const m = typeof marker === 'string' ? getMarker(marker) : marker;
  if (value == null || !Number.isFinite(value) || !m?.altUnit) return value;
  const special = SPECIAL[m.key];
  if (special) return special.toAlt(value);
  return value * m.toAlt;
}

// Alternate -> canonical unit.
export function fromAlt(value, marker) {
  const m = typeof marker === 'string' ? getMarker(marker) : marker;
  if (value == null || !Number.isFinite(value) || !m?.altUnit) return value;
  const special = SPECIAL[m.key];
  if (special) return special.fromAlt(value);
  return value / m.toAlt;
}

// The unit a value should be shown in, given the user's preference.
// `prefs` is settingsStore's `units` map: { [markerKey|'default']: 'canonical' | 'alt' }.
export function displayUnit(marker, prefs = {}) {
  const m = typeof marker === 'string' ? getMarker(marker) : marker;
  if (!m) return '';
  return prefs[m.key] === 'alt' && m.altUnit ? m.altUnit : m.unit;
}

// Convert a stored value into the unit the user reads it in.
export function toDisplay(value, marker, prefs = {}) {
  const m = typeof marker === 'string' ? getMarker(marker) : marker;
  if (!m) return value;
  return prefs[m.key] === 'alt' && m.altUnit ? toAlt(value, m) : value;
}

// Convert a value the user typed (in their display unit) back to storage.
export function fromDisplay(value, marker, prefs = {}) {
  const m = typeof marker === 'string' ? getMarker(marker) : marker;
  if (!m) return value;
  return prefs[m.key] === 'alt' && m.altUnit ? fromAlt(value, m) : value;
}

// The same quantity, spelled the way different labs spell it. Each entry maps a
// normalised reported unit onto a canonical-equivalent unit plus the factor that
// converts the VALUE — "6200 cells/cumm" and "6.2 10E3/uL" are the same white
// cell count, and "3.05 Lakhs/cumm" is 305 K/µL.
//
// Only unambiguous equivalences belong here. mmol/L is deliberately absent: it
// equals mEq/L for sodium, but it is a genuinely different scale for glucose and
// cholesterol, so those markers declare it as their own `altUnit` instead.
const UNIT_SYNONYMS = {
  'gm/dl': { as: 'g/dl', factor: 1 },
  'gms/dl': { as: 'g/dl', factor: 1 },
  'g%': { as: 'g/dl', factor: 1 },
  'iu/l': { as: 'u/l', factor: 1 },
  'u/ml': { as: 'u/l', factor: 1000 },
  // Cell counts, in every spelling the labs in this repo's test corpus use.
  '10e3/ul': { as: 'k/ul', factor: 1 },
  '10*3/ul': { as: 'k/ul', factor: 1 },
  '10^3/ul': { as: 'k/ul', factor: 1 },
  'x10³cells/cumm': { as: 'k/ul', factor: 1 },
  '10³cells/cumm': { as: 'k/ul', factor: 1 },
  'thou/cumm': { as: 'k/ul', factor: 1 },
  'thousands/cumm': { as: 'k/ul', factor: 1 },
  'cells/cumm': { as: 'k/ul', factor: 0.001 },
  '/cumm': { as: 'k/ul', factor: 0.001 },
  'lakhs/cumm': { as: 'k/ul', factor: 100 },
  'lakh/cumm': { as: 'k/ul', factor: 100 },
  '10e6/ul': { as: 'm/ul', factor: 1 },
  '10*6/ul': { as: 'm/ul', factor: 1 },
  '10^6/ul': { as: 'm/ul', factor: 1 },
  'mill/cumm': { as: 'm/ul', factor: 1 },
  'mill/mm3': { as: 'm/ul', factor: 1 },
  'millions/cumm': { as: 'm/ul', factor: 1 },
  'million/cumm': { as: 'm/ul', factor: 1 },
};

// Normalise whatever unit string a lab report printed, so "MG/DL", "mg / dl"
// and "mgdl" all land on the same key.
export function normaliseUnit(unit) {
  if (!unit) return '';
  return String(unit)
    .toLowerCase()
    .replace(/µ/g, 'u')
    .replace(/μ/g, 'u')
    .replace(/[\s.]/g, '')
    .replace(/°/g, '')
    .replace(/percent/g, '%');
}

// Given a value plus the unit a report printed it in, return the value in the
// marker's canonical unit. Unrecognised units are left alone — guessing would
// silently corrupt data, so the importer flags them instead.
export function convertReported(value, unitText, marker) {
  const m = typeof marker === 'string' ? getMarker(marker) : marker;
  if (!m || value == null || !Number.isFinite(value)) return { value, converted: false, recognised: false };
  const raw = normaliseUnit(unitText);
  if (!raw) return { value, converted: false, recognised: false };

  // Fold a synonym spelling onto its canonical equivalent first, scaling the
  // value with it (cells/cumm -> K/µL divides by 1000).
  const synonym = UNIT_SYNONYMS[raw];
  const seen = synonym ? synonym.as : raw;
  const scaled = synonym ? value * synonym.factor : value;
  const rescaled = synonym != null && synonym.factor !== 1;

  if (seen === normaliseUnit(m.unit)) {
    return { value: round(scaled), converted: rescaled, recognised: true };
  }
  if (m.altUnit && seen === normaliseUnit(m.altUnit)) {
    return { value: round(fromAlt(scaled, m)), converted: true, recognised: true };
  }
  return { value, converted: false, recognised: false };
}

// Floating-point scaling turns 4800 * 0.001 into 4.800000000000001; a lab value
// never needs more precision than this.
function round(n) {
  return Number.isFinite(n) ? Number(n.toFixed(6)) : n;
}

/* ------------------------------------------------------------------ people */

export function kgToLb(kg) {
  return kg * 2.20462;
}

export function lbToKg(lb) {
  return lb / 2.20462;
}

export function cmToIn(cm) {
  return cm * 0.393701;
}

export function inToCm(inches) {
  return inches / 0.393701;
}

// 178 cm -> { feet: 5, inches: 10 }
export function cmToFtIn(cm) {
  const totalInches = cmToIn(cm);
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - feet * 12);
  // Rounding 11.6" up must roll over into the next foot, not read as 5'12".
  if (inches === 12) return { feet: feet + 1, inches: 0 };
  return { feet, inches };
}

export function ftInToCm(feet, inches = 0) {
  return inToCm(feet * 12 + inches);
}
