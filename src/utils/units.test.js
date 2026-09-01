import { describe, it, expect } from 'vitest';
import {
  toAlt, fromAlt, displayUnit, toDisplay, fromDisplay, hasAltUnit,
  normaliseUnit, convertReported, kgToLb, lbToKg, cmToFtIn, ftInToCm, cmToIn, inToCm,
} from './units.js';
import { getMarker } from '../data/markers.js';

describe('canonical <-> alternate units', () => {
  it('converts cholesterol between mg/dL and mmol/L', () => {
    expect(toAlt(200, 'totalCholesterol')).toBeCloseTo(5.172, 3);
    expect(fromAlt(5.172, 'totalCholesterol')).toBeCloseTo(200, 2);
  });

  it('converts glucose and creatinine', () => {
    expect(toAlt(90, 'fastingGlucose')).toBeCloseTo(4.996, 3);
    expect(toAlt(1.0, 'creatinine')).toBeCloseTo(88.4, 3);
    expect(fromAlt(88.4, 'creatinine')).toBeCloseTo(1.0, 5);
  });

  it('round-trips every convertible marker', () => {
    for (const key of ['ldl', 'hdl', 'triglycerides', 'fastingGlucose', 'vitaminD', 'vitaminB12', 'weight', 'waist']) {
      const marker = getMarker(key);
      expect(hasAltUnit(marker)).toBe(true);
      expect(fromAlt(toAlt(42, marker), marker)).toBeCloseTo(42, 6);
    }
  });

  it('handles temperature, which is not a plain ratio', () => {
    expect(toAlt(37, 'temperature')).toBeCloseTo(98.6, 5);
    expect(fromAlt(98.6, 'temperature')).toBeCloseTo(37, 5);
    expect(toAlt(0, 'temperature')).toBe(32);
  });

  it('leaves a marker with no alternate unit untouched', () => {
    expect(hasAltUnit('hba1c')).toBe(false);
    expect(toAlt(5.4, 'hba1c')).toBe(5.4);
    expect(fromAlt(5.4, 'hba1c')).toBe(5.4);
  });

  it('passes missing values straight through', () => {
    expect(toAlt(null, 'ldl')).toBeNull();
    expect(fromAlt(undefined, 'ldl')).toBeUndefined();
  });
});

describe('display preferences', () => {
  it('shows the canonical unit by default', () => {
    expect(displayUnit('ldl')).toBe('mg/dL');
    expect(toDisplay(100, 'ldl')).toBe(100);
  });

  it('shows the alternate unit when the marker is set to it', () => {
    const prefs = { ldl: 'alt' };
    expect(displayUnit('ldl', prefs)).toBe('mmol/L');
    expect(toDisplay(100, 'ldl', prefs)).toBeCloseTo(2.586, 3);
    expect(fromDisplay(2.586, 'ldl', prefs)).toBeCloseTo(100, 2);
  });

  it('ignores an alt preference on a marker that has no alt unit', () => {
    expect(displayUnit('hba1c', { hba1c: 'alt' })).toBe('%');
    expect(toDisplay(5.4, 'hba1c', { hba1c: 'alt' })).toBe(5.4);
  });
});

describe('normaliseUnit', () => {
  it('folds case, spacing, dots and micro signs', () => {
    expect(normaliseUnit('MG / DL')).toBe('mg/dl');
    expect(normaliseUnit('mg.dL')).toBe('mgdl');
    expect(normaliseUnit('µIU/mL')).toBe('uiu/ml');
    expect(normaliseUnit('μmol/L')).toBe('umol/l');
    expect(normaliseUnit('')).toBe('');
    expect(normaliseUnit(null)).toBe('');
  });
});

describe('convertReported', () => {
  it('recognises the canonical unit and leaves the value alone', () => {
    expect(convertReported(180, 'mg/dL', 'totalCholesterol')).toEqual({ value: 180, converted: false, recognised: true });
  });

  it('converts a value reported in the alternate unit', () => {
    const out = convertReported(4.66, 'mmol/L', 'totalCholesterol');
    expect(out.recognised).toBe(true);
    expect(out.converted).toBe(true);
    expect(out.value).toBeCloseTo(180.2, 1);
  });

  it('refuses to guess at an unrecognised unit', () => {
    const out = convertReported(180, 'furlongs', 'totalCholesterol');
    expect(out).toEqual({ value: 180, converted: false, recognised: false });
  });

  it('treats a missing unit as simply unstated', () => {
    expect(convertReported(180, '', 'totalCholesterol').recognised).toBe(false);
  });
});

describe('body measurements', () => {
  it('converts weight and length', () => {
    expect(kgToLb(70)).toBeCloseTo(154.32, 2);
    expect(lbToKg(154.32)).toBeCloseTo(70, 2);
    expect(cmToIn(100)).toBeCloseTo(39.37, 2);
    expect(inToCm(39.37)).toBeCloseTo(100, 2);
  });

  it('splits centimetres into feet and inches', () => {
    expect(cmToFtIn(178)).toEqual({ feet: 5, inches: 10 });
    expect(cmToFtIn(152.4)).toEqual({ feet: 5, inches: 0 });
  });

  it('rolls 12 inches over into the next foot', () => {
    // 181.5 cm is 5'11.5", which rounds to 12" and must become 6'0".
    expect(cmToFtIn(181.5)).toEqual({ feet: 5, inches: 11 });
    expect(cmToFtIn(182.7)).toEqual({ feet: 6, inches: 0 });
  });

  it('round-trips feet/inches back to centimetres', () => {
    expect(ftInToCm(5, 10)).toBeCloseTo(177.8, 1);
    expect(ftInToCm(6, 0)).toBeCloseTo(182.88, 2);
  });
});
