import { describe, it, expect } from 'vitest';
import {
  bmi, nonHdl, cholRatio, ldlFriedewald, eag, homaIr, map, egfr,
  computeDerived, DERIVED_SOURCES,
} from './derived.js';
import { DERIVED_KEYS } from '../data/markers.js';

describe('bmi', () => {
  it('computes weight over height squared', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.86, 2);
    expect(bmi(90, 180)).toBeCloseTo(27.78, 2);
  });

  it('returns null without both inputs', () => {
    expect(bmi(70, null)).toBeNull();
    expect(bmi(null, 175)).toBeNull();
    expect(bmi(70, 0)).toBeNull();
    expect(bmi(-5, 175)).toBeNull();
  });
});

describe('lipid derivations', () => {
  it('computes non-HDL and the total:HDL ratio', () => {
    expect(nonHdl(200, 50)).toBe(150);
    expect(cholRatio(200, 50)).toBe(4);
  });

  it('estimates LDL by Friedewald', () => {
    // 200 - 50 - 150/5 = 120
    expect(ldlFriedewald(200, 50, 150)).toBeCloseTo(120, 6);
  });

  it('refuses to estimate LDL once triglycerides pass 400', () => {
    expect(ldlFriedewald(300, 40, 400)).toBeNull();
    expect(ldlFriedewald(300, 40, 900)).toBeNull();
    // Just under the cut-off it still estimates.
    expect(ldlFriedewald(300, 40, 399)).toBeCloseTo(180.2, 1);
  });

  it('guards against divide-by-zero and impossible results', () => {
    expect(cholRatio(200, 0)).toBeNull();
    expect(nonHdl(200, null)).toBeNull();
    // TC below HDL + TG/5 would give a negative LDL, which is not a reading.
    expect(ldlFriedewald(50, 45, 150)).toBeNull();
  });
});

describe('glycemic derivations', () => {
  it('converts HbA1c to estimated average glucose', () => {
    expect(eag(5.0)).toBeCloseTo(96.8, 1);
    expect(eag(7.0)).toBeCloseTo(154.2, 1);
  });

  it('computes HOMA-IR from fasting glucose and insulin', () => {
    expect(homaIr(90, 6)).toBeCloseTo(1.333, 3);
    expect(homaIr(110, 15)).toBeCloseTo(4.074, 3);
  });

  it('returns null for non-positive inputs', () => {
    expect(eag(0)).toBeNull();
    expect(homaIr(90, 0)).toBeNull();
    expect(homaIr(null, 6)).toBeNull();
  });
});

describe('map', () => {
  it('weights diastolic twice as heavily as systolic', () => {
    expect(map(120, 80)).toBeCloseTo(93.33, 2);
    expect(map(null, 80)).toBeNull();
  });
});

describe('egfr (CKD-EPI 2021)', () => {
  it('gives a normal filtration rate for healthy creatinine', () => {
    // 40-year-old man, creatinine 0.9 -> around 105.
    const value = egfr(0.9, 40, 'male');
    expect(value).toBeGreaterThan(98);
    expect(value).toBeLessThan(112);
  });

  it('applies the female coefficient', () => {
    const male = egfr(0.9, 40, 'male');
    const female = egfr(0.9, 40, 'female');
    expect(female).not.toBeCloseTo(male, 1);
    expect(female).toBeGreaterThan(70);
  });

  it('falls as creatinine rises and as age rises', () => {
    expect(egfr(1.8, 40, 'male')).toBeLessThan(egfr(0.9, 40, 'male'));
    expect(egfr(0.9, 70, 'male')).toBeLessThan(egfr(0.9, 40, 'male'));
  });

  it('declines to guess without age or sex', () => {
    expect(egfr(0.9, null, 'male')).toBeNull();
    expect(egfr(0.9, 40, null)).toBeNull();
    expect(egfr(0.9, 40, 'unspecified')).toBeNull();
    expect(egfr(0, 40, 'male')).toBeNull();
  });
});

describe('computeDerived', () => {
  const profile = { dob: '1986-05-10', sex: 'male', heightCm: 175 };

  it('derives everything its inputs allow', () => {
    const out = computeDerived(
      {
        weight: 70,
        totalCholesterol: 200,
        hdl: 50,
        hba1c: 5.4,
        fastingGlucose: 92,
        fastingInsulin: 7,
        creatinine: 0.95,
      },
      profile,
      '2026-08-31'
    );
    expect(out.bmi).toBeCloseTo(22.86, 2);
    expect(out.nonHdl).toBe(150);
    expect(out.cholRatio).toBe(4);
    expect(out.eag).toBeCloseTo(108.3, 1);
    expect(out.homaIr).toBeCloseTo(1.59, 2);
    expect(out.egfr).toBeGreaterThan(80);
  });

  it('omits, rather than nulls, anything it cannot compute', () => {
    const out = computeDerived({ totalCholesterol: 200 }, profile, '2026-08-31');
    expect(out).toEqual({});
    expect('nonHdl' in out).toBe(false);
  });

  it('cannot compute eGFR without a date of birth', () => {
    const out = computeDerived({ creatinine: 0.95 }, { sex: 'male' }, '2026-08-31');
    expect('egfr' in out).toBe(false);
  });

  it('computes BMI only once a height is on the profile', () => {
    expect(computeDerived({ weight: 70 }, { sex: 'male' }, '2026-08-31')).toEqual({});
    expect(computeDerived({ weight: 70 }, profile, '2026-08-31').bmi).toBeCloseTo(22.86, 2);
  });

  it('survives being called with nothing at all', () => {
    expect(computeDerived()).toEqual({});
  });
});

describe('derived catalogue wiring', () => {
  it('names a source for every derived marker the catalogue declares', () => {
    for (const key of DERIVED_KEYS) {
      expect(DERIVED_SOURCES[key]).toBeDefined();
      expect(DERIVED_SOURCES[key].length).toBeGreaterThan(0);
    }
  });
});
