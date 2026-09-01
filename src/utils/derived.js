// Derived markers are COMPUTED, never stored. That is deliberate: delete the
// LDL and HDL readings behind a Non-HDL figure and the Non-HDL simply stops
// existing, with no stale row left behind to reconcile. Every function returns
// null rather than a wrong number when its inputs are missing or out of the
// range where the formula is valid.

import { ageAt } from './dates.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Body mass index from weight in kg and height in cm.
export function bmi(weightKg, heightCm) {
  const w = num(weightKg);
  const h = num(heightCm);
  if (w == null || h == null || h <= 0 || w <= 0) return null;
  const metres = h / 100;
  return w / (metres * metres);
}

// Every atherogenic particle: total cholesterol minus the protective fraction.
export function nonHdl(totalCholesterol, hdl) {
  const tc = num(totalCholesterol);
  const h = num(hdl);
  if (tc == null || h == null) return null;
  return tc - h;
}

export function cholRatio(totalCholesterol, hdl) {
  const tc = num(totalCholesterol);
  const h = num(hdl);
  if (tc == null || h == null || h <= 0) return null;
  return tc / h;
}

// Friedewald: LDL = TC - HDL - TG/5 (mg/dL). The formula breaks down once
// triglycerides pass 400 mg/dL, so above that we decline to estimate.
export function ldlFriedewald(totalCholesterol, hdl, triglycerides) {
  const tc = num(totalCholesterol);
  const h = num(hdl);
  const tg = num(triglycerides);
  if (tc == null || h == null || tg == null) return null;
  if (tg >= 400) return null;
  const ldl = tc - h - tg / 5;
  return ldl >= 0 ? ldl : null;
}

// HbA1c (%) expressed as an average glucose in mg/dL (ADAG study).
export function eag(hba1c) {
  const a = num(hba1c);
  if (a == null || a <= 0) return null;
  return 28.7 * a - 46.7;
}

// Insulin resistance from fasting glucose (mg/dL) and fasting insulin (µIU/mL).
export function homaIr(fastingGlucose, fastingInsulin) {
  const g = num(fastingGlucose);
  const i = num(fastingInsulin);
  if (g == null || i == null || g <= 0 || i <= 0) return null;
  return (g * i) / 405;
}

// Mean arterial pressure — one number for overall perfusion pressure.
export function map(systolic, diastolic) {
  const s = num(systolic);
  const d = num(diastolic);
  if (s == null || d == null) return null;
  return (s + 2 * d) / 3;
}

// CKD-EPI 2021 creatinine equation (the race-free revision).
//   eGFR = 142 × min(Scr/κ,1)^α × max(Scr/κ,1)^-1.200 × 0.9938^age × 1.012 (if female)
// Needs age and sex, so it returns null until the profile has both.
export function egfr(creatinine, age, sex) {
  const scr = num(creatinine);
  const years = num(age);
  if (scr == null || years == null || scr <= 0 || years <= 0) return null;
  if (sex !== 'male' && sex !== 'female') return null;
  const female = sex === 'female';
  const kappa = female ? 0.7 : 0.9;
  const alpha = female ? -0.241 : -0.302;
  const ratio = scr / kappa;
  const value =
    142 *
    Math.min(ratio, 1) ** alpha *
    Math.max(ratio, 1) ** -1.2 *
    0.9938 ** years *
    (female ? 1.012 : 1);
  return value;
}

// Given the raw readings of one report as { markerKey: value }, plus the user's
// profile, return the derived markers that can be computed from them. Anything
// that cannot be computed is simply absent — never null, never zero.
export function computeDerived(values = {}, profile = {}, dateKey) {
  const out = {};
  const age = profile.dob ? ageAt(profile.dob, dateKey || undefined) : null;

  const put = (key, value) => {
    if (value != null && Number.isFinite(value)) out[key] = value;
  };

  put('bmi', bmi(values.weight, profile.heightCm));
  put('nonHdl', nonHdl(values.totalCholesterol, values.hdl));
  put('cholRatio', cholRatio(values.totalCholesterol, values.hdl));
  put('eag', eag(values.hba1c));
  put('homaIr', homaIr(values.fastingGlucose, values.fastingInsulin));
  put('egfr', egfr(values.creatinine, age, profile.sex));

  return out;
}

// Which readings a derived value was computed from — shown on the marker detail
// screen so a computed number is never mistaken for one a lab measured.
export const DERIVED_SOURCES = {
  bmi: ['weight'],
  nonHdl: ['totalCholesterol', 'hdl'],
  cholRatio: ['totalCholesterol', 'hdl'],
  eag: ['hba1c'],
  homaIr: ['fastingGlucose', 'fastingInsulin'],
  egfr: ['creatinine'],
};
