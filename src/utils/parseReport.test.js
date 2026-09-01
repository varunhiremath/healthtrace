import { describe, it, expect } from 'vitest';
import { parseReport, parseReportDate, parseReportName, matchProfileByName, normaliseText } from './parseReport.js';

const byKey = (hits) => Object.fromEntries(hits.map((h) => [h.markerKey, h.value]));

describe('normaliseText', () => {
  it('folds case, decorative punctuation and spacing', () => {
    expect(normaliseText('  Total   Cholesterol  (Serum) : ')).toBe('total cholesterol serum');
    expect(normaliseText('HDL–Cholesterol')).toBe('hdl-cholesterol');
  });
});

describe('parseReport — a typical lipid panel', () => {
  const text = `
    LIPID PROFILE
    Total Cholesterol        190    mg/dL     Ref: 0 - 200
    Triglycerides            145    mg/dL
    HDL Cholesterol           46    mg/dL
    LDL Cholesterol          120    mg/dL
    VLDL Cholesterol          29    mg/dL
  `;

  it('reads every marker on the panel', () => {
    const { hits } = parseReport(text);
    expect(byKey(hits)).toEqual({
      totalCholesterol: 190,
      triglycerides: 145,
      hdl: 46,
      ldl: 120,
      vldl: 29,
    });
  });

  it('prefers the specific alias over the general one', () => {
    const { hits } = parseReport(text);
    // "LDL Cholesterol 118" must be LDL, not another total cholesterol.
    const ldl = hits.find((h) => h.markerKey === 'ldl');
    expect(ldl.value).toBe(120);
    expect(hits.filter((h) => h.markerKey === 'totalCholesterol')).toHaveLength(1);
  });

  it('classifies each hit as it reads it', () => {
    const { hits } = parseReport(text);
    expect(hits.find((h) => h.markerKey === 'ldl').status).toBe('borderline');
    expect(hits.find((h) => h.markerKey === 'hdl').status).toBe('borderline');
    expect(hits.find((h) => h.markerKey === 'totalCholesterol').status).toBe('optimal');
  });

  it('keeps the source line and line number for every hit', () => {
    const { hits } = parseReport(text);
    const hdl = hits.find((h) => h.markerKey === 'hdl');
    expect(hdl.line).toContain('HDL Cholesterol');
    expect(typeof hdl.lineNumber).toBe('number');
  });

  it('is confident when a recognised unit sits beside the value', () => {
    const { hits } = parseReport(text);
    expect(hits.find((h) => h.markerKey === 'triglycerides').confidence).toBeGreaterThanOrEqual(0.9);
  });
});

describe('parseReport — formats labs actually use', () => {
  it('handles colons, tabs and multiple spaces', () => {
    const { hits } = parseReport('HbA1c:\t5.8\t%\nFasting Blood Sugar :  96 mg/dL');
    expect(byKey(hits)).toEqual({ hba1c: 5.8, fastingGlucose: 96 });
  });

  it('reads a blood pressure pair', () => {
    const { hits } = parseReport('Blood Pressure 128/82 mmHg');
    expect(byKey(hits)).toEqual({ systolic: 128, diastolic: 82 });
  });

  it('ignores a reversed or nonsensical BP pair', () => {
    const { hits } = parseReport('Blood Pressure 82/128 mmHg');
    expect(hits.find((h) => h.markerKey === 'systolic')).toBeUndefined();
  });

  it('strips thousands separators', () => {
    const { hits } = parseReport('Vitamin B12  1,024 pg/mL');
    expect(byKey(hits)).toEqual({ vitaminB12: 1024 });
  });

  it('reads values written with a leading decimal point', () => {
    const { hits } = parseReport('Bilirubin Direct  .18 mg/dL');
    expect(byKey(hits)).toEqual({ bilirubinDirect: 0.18 });
  });

  it('does not read a test code or prefix as the result', () => {
    const { hits } = parseReport('25-Hydroxy Vitamin D    18.6 ng/mL');
    expect(byKey(hits)).toEqual({ vitaminD: 18.6 });
  });

  it('reads Indian-format CBC lines', () => {
    const { hits } = parseReport(`
      Haemoglobin            13.4 g/dL
      Total Leucocyte Count  7.2 K/uL
      Platelet Count         245 K/uL
      Packed Cell Volume     41.2 %
    `);
    expect(byKey(hits)).toEqual({
      hemoglobin: 13.4,
      wbc: 7.2,
      platelets: 245,
      hematocrit: 41.2,
    });
  });
});

describe('parseReport — unit handling', () => {
  it('converts a value reported in the alternate unit', () => {
    const { hits } = parseReport('Total Cholesterol 4.66 mmol/L');
    const hit = hits.find((h) => h.markerKey === 'totalCholesterol');
    expect(hit.converted).toBe(true);
    expect(hit.value).toBeCloseTo(180.2, 1);
  });

  it('leaves the value alone and lowers confidence for an unknown unit', () => {
    const { hits } = parseReport('Total Cholesterol 186 zorkles/L');
    const hit = hits.find((h) => h.markerKey === 'totalCholesterol');
    expect(hit.value).toBe(186);
    expect(hit.converted).toBe(false);
  });

  it('still reads a value with no unit printed, less confidently', () => {
    const withUnit = parseReport('LDL Cholesterol 118 mg/dL').hits[0];
    const without = parseReport('LDL Cholesterol 118').hits[0];
    expect(without.value).toBe(118);
    expect(without.confidence).toBeLessThan(withUnit.confidence);
  });
});

describe('parseReport — refusing to over-read', () => {
  it('does not fire an alias inside a longer word', () => {
    const { hits } = parseReport('Patient was fasting for 12 hours before the plastic tube draw');
    expect(hits.find((h) => h.markerKey === 'ast')).toBeUndefined();
  });

  it('takes only the first mention of a marker', () => {
    const { hits } = parseReport(`
      LDL Cholesterol 118 mg/dL
      Interpretation: your LDL Cholesterol 118 is borderline
    `);
    expect(hits.filter((h) => h.markerKey === 'ldl')).toHaveLength(1);
  });

  it('lowers confidence on a line that announces itself as a reference range', () => {
    const plain = parseReport('Uric Acid 6.2 mg/dL').hits[0];
    const ranged = parseReport('Uric Acid reference range 3.5 - 7.2 mg/dL').hits[0];
    expect(ranged.confidence).toBeLessThan(plain.confidence);
  });

  it('lowers confidence for a value far off the marker scale', () => {
    const sane = parseReport('HbA1c 5.8 %').hits[0];
    const wild = parseReport('HbA1c 90210 %').hits[0];
    expect(wild.confidence).toBeLessThan(sane.confidence);
  });

  it('collects numeric lines it could not name, so nothing goes missing silently', () => {
    const { hits, unmatchedLines } = parseReport('Specimen 4471829 collected\nSome Unknown Assay  12.4 units');
    expect(hits).toHaveLength(0);
    expect(unmatchedLines.length).toBeGreaterThan(0);
  });

  it('returns empty results for empty input', () => {
    expect(parseReport('')).toEqual({ hits: [], unmatchedLines: [] });
    expect(parseReport(null)).toEqual({ hits: [], unmatchedLines: [] });
  });

  it('uses sex-specific bands when classifying', () => {
    const male = parseReport('HDL Cholesterol 45 mg/dL', { sex: 'male' }).hits[0];
    const female = parseReport('HDL Cholesterol 45 mg/dL', { sex: 'female' }).hits[0];
    expect(male.status).toBe('borderline');
    expect(female.status).toBe('low');
  });
});

describe('parseReportDate', () => {
  it('reads an ISO date', () => {
    expect(parseReportDate('Collected on 2026-03-04 at 08:15')).toBe('2026-03-04');
  });

  it('reads a day-first slashed date', () => {
    expect(parseReportDate('Report Date: 04/03/2026')).toBe('2026-03-04');
  });

  it('reads a month-first date when told to', () => {
    expect(parseReportDate('03/04/2026', { dayFirst: false })).toBe('2026-03-04');
  });

  it('resolves ambiguity when one part cannot be a month', () => {
    expect(parseReportDate('25/12/2025')).toBe('2025-12-25');
    expect(parseReportDate('12/25/2025')).toBe('2025-12-25');
  });

  it('reads a named month', () => {
    expect(parseReportDate('Sample drawn 4 Mar 2026')).toBe('2026-03-04');
    expect(parseReportDate('4-March-2026')).toBe('2026-03-04');
  });

  it('returns null when there is no date, or the date is impossible', () => {
    expect(parseReportDate('no date here')).toBeNull();
    expect(parseReportDate('31/02/2026')).toBeNull();
    expect(parseReportDate('')).toBeNull();
  });
});

describe('parseReport — reference ranges printed beside the result', () => {
  it('still trusts a result that has its range on the same line after it', () => {
    // This is how most labs lay a row out, and the first number is the result.
    const { hits } = parseReport('Total Cholesterol   186   mg/dL   Ref: 0 - 200');
    const hit = hits.find((h) => h.markerKey === 'totalCholesterol');
    expect(hit.value).toBe(186);
    expect(hit.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('still doubts a line where the range comes first', () => {
    const { hits } = parseReport('Total Cholesterol   reference range 0 - 200 mg/dL');
    expect(hits[0].confidence).toBeLessThan(0.7);
  });

  it('reads a whole panel where every row carries its range', () => {
    const { hits } = parseReport(`
      Total Cholesterol   212   mg/dL   Ref: 0 - 200
      Triglycerides       186   mg/dL   Ref: 0 - 150
      HDL Cholesterol      41   mg/dL   Ref: 40 - 60
      LDL Cholesterol     134   mg/dL   Ref: 0 - 100
    `);
    expect(Object.fromEntries(hits.map((h) => [h.markerKey, h.value]))).toEqual({
      totalCholesterol: 212,
      triglycerides: 186,
      hdl: 41,
      ldl: 134,
    });
    // All four must be confident enough to be pre-selected on the import screen.
    for (const hit of hits) expect(hit.confidence).toBeGreaterThanOrEqual(0.7);
  });
});

// These fixtures are the shapes real reports actually arrive in — an Epic /
// MyChart PDF flattened to text, and two Indian lab layouts. Every bug they
// encode was found by running the parser over genuine reports.
describe('parseReport — split-line (Epic/MyChart) layout', () => {
  it('reads a two-column lipid panel whose values sit two lines below', () => {
    const { hits } = parseReport(`Results
Cholesterol Triglycerides
Normal range: 200 mg/dL or below Normal range: 150 mg/dL or below
173 92
200 200 150 150
LDL Calculated HDL
Normal range: below 100 mg/dL Normal range: 40.0 mg/dL or above
94 58.2
100 100 40 40`);
    expect(byKey(hits)).toEqual({ totalCholesterol: 173, triglycerides: 92, ldl: 94, hdl: 58.2 });
    for (const hit of hits) expect(hit.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('skips the "Value Value" header row and the axis-tick row', () => {
    const { hits } = parseReport(`White Blood Cells RBC
Normal value: 3.5 - 10.5 10E3/uL Normal value: 4.20 - 5.87 10E6/uL
Value Value
8.4 5.12
High`);
    expect(byKey(hits)).toEqual({ wbc: 8.4, rbc: 5.12 });
  });

  it('does not read "Hemoglobin A1C" as a haemoglobin of 1', () => {
    const { hits } = parseReport(`Hemoglobin A1C
Normal range: below 5.7 %
5.4 High
5.7 5.7`);
    expect(byKey(hits)).toEqual({ hba1c: 5.4 });
    expect(hits.find((h) => h.markerKey === 'hemoglobin')).toBeUndefined();
  });

  it('refuses a row where one column is a marker it cannot name', () => {
    // "1.7" is the A/G ratio, not the bilirubin — one label, but two columns.
    const { hits } = parseReport(`A/G Ratio Total Bilirubin
Normal range: 1.0 - 2.2 Normal range: 0.2 - 1.5 mg/dL
1.7
Value
<0.2`);
    expect(hits.find((h) => h.markerKey === 'bilirubinTotal')).toBeUndefined();
  });

  it('refuses a value line whose count does not match the labels', () => {
    const { hits } = parseReport(`nRBC# Neutrophils % (Auto)
Normal value: 0 - 0.012 10E3/uL Normal value: 34.0 - 67.9 %
Value Value
0.00 55.1`);
    // Two values, one nameable label: assigning either would be a guess.
    expect(hits).toHaveLength(0);
  });

  it('does not treat an interpretation sentence as a result', () => {
    const { hits } = parseReport(`Glucose
Normal range: 70 - 109 mg/dL
93
70 70 109 109
Glucose Reference Range :
Random glucose of 200 mg/dL or greater in patients with classic symptoms of hyperglycemia or
hyperglycemic crisis.`);
    const random = hits.find((h) => h.markerKey === 'randomGlucose');
    // If it is reported at all, it must not be confident enough to pre-select.
    if (random) expect(random.confidence).toBeLessThan(0.7);
  });

  it('flags a bare "Glucose" instead of assuming it was fasting', () => {
    const { hits } = parseReport('Glucose\nNormal range: 70 - 109 mg/dL\n104');
    const hit = hits.find((h) => h.markerKey === 'fastingGlucose');
    expect(hit.value).toBe(104);
    expect(hit.confidence).toBeLessThan(0.7);
  });
});

describe('parseReport — Indian lab layouts', () => {
  it('scales cell counts from cumm units', () => {
    const { hits } = parseReport(`TOTAL W.B.C 6200 cells/cumm 4000 - 11000
R.B.C COUNT 5.10 mill/cumm 4.2 - 6.5
PLATELET COUNT 3.05 Lakhs/cumm 1.4 - 4`);
    expect(byKey(hits)).toEqual({ wbc: 6.2, rbc: 5.1, platelets: 305 });
  });

  it('reads initialisms written with dots', () => {
    const { hits } = parseReport('P.C.V 42.0 % 40 - 54\nM.C.H.C 34.1 % 30 - 35');
    expect(byKey(hits)).toEqual({ hematocrit: 42, mchc: 34.1 });
  });

  it('reads a specimen-prefixed marker name', () => {
    const { hits } = parseReport('S.ALBUMIN 4.20 g/dl 3.5 - 5.2');
    expect(byKey(hits)).toEqual({ albumin: 4.2 });
  });

  it('converts T3 reported in ng/mL to the stored ng/dL', () => {
    const { hits } = parseReport('TOTAL TRIIODOTHYRONINE (T3) 1.20 ng/mL 0.8 - 2');
    const hit = hits.find((h) => h.markerKey === 't3');
    expect(hit.value).toBe(120);
    expect(hit.converted).toBe(true);
  });

  it('does not read the digit inside a method note as a result', () => {
    // "P5P" in the method name must not become an AST of 5.
    const { hits } = parseReport('SGOT/ AST (Enzymatic UV without P5P) 31 U/L [15-41]');
    expect(byKey(hits)).toEqual({ ast: 31 });
  });

  it('does not read an ESR row as a heart rate, because of "mm/hr"', () => {
    const { hits } = parseReport('ESR(Erythrocyte sedimentation rate) 11 mm/hr 0 - 9');
    expect(byKey(hits)).toEqual({ esr: 11 });
    expect(hits.find((h) => h.markerKey === 'pulse')).toBeUndefined();
  });

  it('accepts mmol/L for electrolytes, where it equals mEq/L', () => {
    const { hits } = parseReport('S.SODIUM(NA+) 140 mmol/l 135 - 145\nS.POTASSIUM(K+) 4.3 mmol/l 3.5 - 5.5');
    expect(byKey(hits)).toEqual({ sodium: 140, potassium: 4.3 });
    for (const hit of hits) expect(hit.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('reads a bracketed reference interval without taking it as the value', () => {
    const { hits } = parseReport(`TOTAL CHOLESTEROL (CHOD/POD) 172 mg/dL [<200]Normal:
HDL-CHOLESTEROL 61 mg/dl [40-70]
LDL- CHOLESTEROL 94 mg/dL [<100]Normal:`);
    expect(byKey(hits)).toEqual({ totalCholesterol: 172, hdl: 61, ldl: 94 });
  });
});

describe('parseReport — never offers a derived marker', () => {
  it('ignores eGFR, eAG and non-HDL, which the app computes itself', () => {
    const { hits } = parseReport(`eGFR 100.2 mL/min/1.73m2
Estimated Average Glucose (eAG) 123 mg/dL
Non HDL Chol. 141 mg/dL`);
    for (const key of ['egfr', 'eag', 'nonHdl']) {
      expect(hits.find((h) => h.markerKey === key)).toBeUndefined();
    }
  });
});

describe('parseReportDate — month-first named dates', () => {
  it('reads the way US reports print a collection date', () => {
    expect(parseReportDate('Collected on Nov 04, 2025 8:40 AM')).toBe('2025-11-04');
    expect(parseReportDate('Collection Date : 11 Jul 2026 08:25')).toBe('2026-07-11');
    expect(parseReportDate('COLLECTED ON : 27-05-2022 at 08:27 AM')).toBe('2022-05-27');
  });
});

describe('parseReportName', () => {
  it('reads the header formats these labs use', () => {
    expect(parseReportName('Name: Alex Rivera | DOB: 01/02/1980 | MRN: X000000000 | PCP: Sam Lee, DO')).toBe('Alex Rivera');
    expect(parseReportName('NAME : Mr. ALEX RIVERA REG/LAB NO. : 10000000 / 11111')).toBe('Alex Rivera');
    expect(parseReportName('Name : MR ALEX RIVERA Age : 40 Yr(s) Sex :Male')).toBe('Alex Rivera');
    expect(parseReportName('Dear Mr Alex Rivera ,')).toBe('Alex Rivera');
  });

  it('strips titles and normalises case', () => {
    expect(parseReportName('Name: MRS. JANE T DOE')).toBe('Jane T Doe');
    expect(parseReportName('Name: dr. chris park')).toBe('Chris Park');
  });

  it('only looks at the header, not the whole document', () => {
    const body = `${'filler\n'.repeat(60)}Name: Someone Else`;
    expect(parseReportName(body)).toBeNull();
  });

  it('returns null rather than guessing at a header it misread', () => {
    expect(parseReportName('Name: 12345')).toBeNull();
    expect(parseReportName('Resulting lab: CENTRAL LAB')).toBeNull();
    expect(parseReportName('')).toBeNull();
    expect(parseReportName(null)).toBeNull();
  });
});

describe('matchProfileByName', () => {
  const family = [
    { id: 1, name: 'Alex Rivera' },
    { id: 2, name: 'Dana Rivera' },
    { id: 3, name: 'Kim' },
  ];

  it('matches a full name', () => {
    expect(matchProfileByName('Alex Rivera', family).id).toBe(1);
  });

  it('matches a first name against a full one, and the reverse', () => {
    expect(matchProfileByName('Kim Rivera', family).id).toBe(3);
    expect(matchProfileByName('Alex', family).id).toBe(1);
  });

  it('ignores titles and punctuation', () => {
    expect(matchProfileByName('Mr. ALEX RIVERA', family).id).toBe(1);
  });

  it('refuses an ambiguous match rather than picking one', () => {
    // "Rivera" alone fits two people in this household.
    expect(matchProfileByName('Rivera', family)).toBeNull();
    expect(matchProfileByName('Morgan', family)).toBeNull();
    expect(matchProfileByName('', family)).toBeNull();
  });

  it('handles an empty household', () => {
    expect(matchProfileByName('Alex', [])).toBeNull();
  });
});
