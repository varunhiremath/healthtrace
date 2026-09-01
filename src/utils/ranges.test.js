import { describe, it, expect } from 'vitest';
import {
  classify, bandsFor, optimalRange, formatRange, scalePosition, bandSegments,
  trendDirection, isOutOfRange, severity, statusMeta, formatValue,
  isValidTarget, effectiveMarker,
} from './ranges.js';
import { MARKERS, getMarker } from '../data/markers.js';

describe('classify', () => {
  it('places a value in the first band it does not exceed', () => {
    expect(classify(85, 'ldl')).toBe('optimal');
    expect(classify(99, 'ldl')).toBe('optimal');
    expect(classify(100, 'ldl')).toBe('borderline');
    expect(classify(129, 'ldl')).toBe('borderline');
    expect(classify(130, 'ldl')).toBe('high');
    expect(classify(200, 'ldl')).toBe('critical');
  });

  it('handles markers where low is the problem', () => {
    expect(classify(60, 'fastingGlucose')).toBe('low');
    expect(classify(90, 'fastingGlucose')).toBe('optimal');
    expect(classify(110, 'fastingGlucose')).toBe('borderline');
    expect(classify(160, 'fastingGlucose')).toBe('high');
  });

  it('uses sex-specific bands when the person is female', () => {
    // HDL 45: fine for a man, low for a woman.
    expect(classify(45, 'hdl', 'male')).toBe('borderline');
    expect(classify(45, 'hdl', 'female')).toBe('low');
    expect(classify(45, 'hdl')).toBe('borderline'); // default = male bands
  });

  it('falls back to default bands for a sex with no override', () => {
    expect(bandsFor(getMarker('ldl'), 'female')).toBe(getMarker('ldl').bands);
  });

  it('returns unknown for a marker with no bands or a missing value', () => {
    expect(classify(72, 'weight')).toBe('unknown');
    expect(classify(null, 'ldl')).toBe('unknown');
    expect(classify(NaN, 'ldl')).toBe('unknown');
    expect(classify(undefined, 'ldl')).toBe('unknown');
  });

  it('accepts a marker object as well as a key', () => {
    expect(classify(85, getMarker('ldl'))).toBe('optimal');
  });
});

describe('optimalRange / formatRange', () => {
  it('reads a window bounded on both sides', () => {
    expect(optimalRange(getMarker('fastingGlucose'))).toEqual({ min: 69, max: 99 });
    expect(formatRange('fastingGlucose')).toBe('70 – 99');
  });

  it('reads a window open at the bottom', () => {
    expect(optimalRange(getMarker('ldl'))).toEqual({ min: null, max: 99 });
    expect(formatRange('ldl')).toBe('Under 100');
  });

  it('reads a window open at the top', () => {
    // HDL 40-59 is acceptable but not protective, so the optimal window opens
    // at 60 for everyone; the sex difference sits in the low band instead.
    expect(optimalRange(getMarker('hdl'), 'male')).toEqual({ min: 59, max: null });
    expect(formatRange('hdl', 'male')).toBe('60 and above');
    expect(formatRange('hdl', 'female')).toBe('60 and above');
    expect(classify(45, 'hdl', 'male')).toBe('borderline');
    expect(classify(45, 'hdl', 'female')).toBe('low');
  });

  it('bumps the exclusive lower bound by one display step', () => {
    // Haemoglobin has one decimal, so 12.9 exclusive reads as 13.0.
    expect(formatRange('hemoglobin', 'male')).toBe('13.0 – 17.2');
    // Creatinine has two.
    expect(formatRange('creatinine', 'male')).toBe('0.74 – 1.18');
  });

  it('returns null when the marker has no optimal band', () => {
    expect(optimalRange(getMarker('weight'))).toBeNull();
    expect(formatRange('weight')).toBeNull();
  });
});

describe('scalePosition', () => {
  it('maps a value onto 0..1 across the marker scale', () => {
    expect(scalePosition(40, 'ldl')).toBe(0); // scale starts at 40
    expect(scalePosition(220, 'ldl')).toBe(1);
    expect(scalePosition(130, 'ldl')).toBeCloseTo(0.5, 5);
  });

  it('clamps values beyond the scale', () => {
    expect(scalePosition(10, 'ldl')).toBe(0);
    expect(scalePosition(900, 'ldl')).toBe(1);
    expect(scalePosition(null, 'ldl')).toBe(0);
  });
});

describe('bandSegments', () => {
  it('covers the whole scale with no gaps or overlaps', () => {
    for (const marker of MARKERS) {
      const segs = bandSegments(marker);
      if (!segs.length) continue;
      const total = segs.reduce((sum, s) => sum + s.width, 0);
      expect(total).toBeCloseTo(100, 4);
      expect(segs[0].start).toBeCloseTo(0, 4);
      for (let i = 1; i < segs.length; i += 1) {
        expect(segs[i].start).toBeCloseTo(segs[i - 1].start + segs[i - 1].width, 4);
      }
    }
  });

  it('returns nothing for a marker with no bands', () => {
    expect(bandSegments('weight')).toEqual([]);
  });
});

describe('trendDirection', () => {
  it('calls a move into range better and out of range worse', () => {
    expect(trendDirection(140, 95, 'ldl')).toBe('better');
    expect(trendDirection(95, 140, 'ldl')).toBe('worse');
  });

  it('treats movement within the healthy window as flat', () => {
    expect(trendDirection(80, 95, 'ldl')).toBe('flat');
  });

  it('compares distance to the window when both readings are outside it', () => {
    expect(trendDirection(180, 140, 'ldl')).toBe('better');
    expect(trendDirection(140, 180, 'ldl')).toBe('worse');
  });

  it('knows that rising is better for a higher-is-better marker', () => {
    expect(trendDirection(30, 36, 'hdl', 'male')).toBe('better');
    expect(trendDirection(36, 30, 'hdl', 'male')).toBe('worse');
  });

  it('reports flat and unknown honestly', () => {
    expect(trendDirection(100, 100, 'ldl')).toBe('flat');
    expect(trendDirection(null, 100, 'ldl')).toBe('unknown');
    expect(trendDirection(70, 72, 'weight')).toBe('unknown');
  });
});

describe('status helpers', () => {
  it('ranks severity and flags what needs attention', () => {
    expect(severity('optimal')).toBe(0);
    expect(severity('critical')).toBe(3);
    expect(isOutOfRange('optimal')).toBe(false);
    expect(isOutOfRange('unknown')).toBe(false);
    expect(isOutOfRange('borderline')).toBe(true);
    expect(isOutOfRange('high')).toBe(true);
  });

  it('falls back to the unknown style for an unrecognised status', () => {
    expect(statusMeta('nonsense')).toBe(statusMeta('unknown'));
  });

  it('formats values at the marker precision', () => {
    expect(formatValue(1.239, getMarker('creatinine'))).toBe('1.24');
    expect(formatValue(99.6, getMarker('ldl'))).toBe('100');
    expect(formatValue(null, getMarker('ldl'))).toBe('—');
  });
});

describe('catalogue integrity', () => {
  it('every marker has ascending bands ending in an open one', () => {
    for (const marker of MARKERS) {
      const sets = [marker.bands, ...Object.values(marker.bandsBySex ?? {})];
      for (const bands of sets) {
        if (!bands?.length) continue;
        expect(bands[bands.length - 1].upTo).toBeNull();
        const bounded = bands.slice(0, -1).map((b) => b.upTo);
        expect(bounded).toEqual([...bounded].sort((a, b) => a - b));
        for (const band of bands) expect(severity(band.status)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('every marker has a scale wide enough to contain its bounded bands', () => {
    for (const marker of MARKERS) {
      const [min, max] = marker.scale;
      expect(max).toBeGreaterThan(min);
      for (const band of marker.bands ?? []) {
        if (band.upTo != null) expect(band.upTo).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('every marker has a unit, aliases, and a plain-English description', () => {
    for (const marker of MARKERS) {
      expect(marker.unit).toBeTruthy();
      expect(marker.aliases.length).toBeGreaterThan(0);
      expect(marker.about.length).toBeGreaterThan(10);
      for (const alias of marker.aliases) expect(alias).toBe(alias.toLowerCase());
    }
  });
});

describe('custom targets', () => {
  it('accepts a target with either bound, or both', () => {
    expect(isValidTarget({ max: 70 })).toBe(true);
    expect(isValidTarget({ min: 60 })).toBe(true);
    expect(isValidTarget({ min: 60, max: 100 })).toBe(true);
  });

  it('rejects an empty or contradictory target', () => {
    expect(isValidTarget(null)).toBe(false);
    expect(isValidTarget({})).toBe(false);
    expect(isValidTarget({ min: null, max: null })).toBe(false);
    expect(isValidTarget({ min: 100, max: 70 })).toBe(false);
    expect(isValidTarget({ min: 70, max: 70 })).toBe(false);
    expect(isValidTarget({ max: NaN })).toBe(false);
  });

  it('rebuilds the bands so every other function follows the target', () => {
    const targets = { ldl: { max: 70 } };
    const marker = effectiveMarker('ldl', targets);
    expect(marker.isTarget).toBe(true);
    expect(classify(65, marker)).toBe('optimal');
    // 95 is optimal against the population range but misses this target.
    expect(classify(95, 'ldl')).toBe('optimal');
    expect(classify(95, marker)).toBe('high');
    expect(formatRange(marker)).toBe('Under 71');
  });

  it('supports a target with a lower bound', () => {
    const marker = effectiveMarker('vitaminD', { vitaminD: { min: 40, max: 80 } });
    expect(classify(35, marker)).toBe('low');
    expect(classify(60, marker)).toBe('optimal');
    expect(classify(95, marker)).toBe('high');
    expect(formatRange(marker)).toBe('40.1 – 80.0');
  });

  it('widens the visual scale to contain the target', () => {
    const marker = effectiveMarker('ldl', { ldl: { max: 300 } });
    expect(marker.scale[1]).toBe(300);
    const segments = bandSegments(marker);
    expect(segments.reduce((sum, s) => sum + s.width, 0)).toBeCloseTo(100, 4);
  });

  it('ignores a sex override once a target replaces the bands', () => {
    const marker = effectiveMarker('hdl', { hdl: { min: 50 } });
    expect(classify(45, marker, 'male')).toBe('low');
    expect(classify(55, marker, 'female')).toBe('optimal');
  });

  it('returns the catalogue marker untouched when there is no target', () => {
    expect(effectiveMarker('ldl', {})).toBe(getMarker('ldl'));
    expect(effectiveMarker('ldl', { ldl: {} })).toBe(getMarker('ldl'));
    expect(effectiveMarker('notAMarker', {})).toBeNull();
  });
});

describe('published reference ranges', () => {
  // Band boundaries are the last value still IN the band, so a boundary written
  // one step off makes a range read as "29.1 - 100.0" instead of "30.0 - 100.0".
  // These are the ranges as a lab would print them, locked in against that.
  const EXPECTED = {
    ldl: 'Under 100',
    totalCholesterol: 'Under 200',
    triglycerides: 'Under 150',
    vldl: 'Under 30',
    apoB: 'Under 90',
    lpa: 'Under 30',
    cholRatio: 'Under 3.5',
    nonHdl: 'Under 130',
    fastingGlucose: '70 – 99',
    ppGlucose: 'Under 140',
    randomGlucose: 'Under 140',
    hba1c: 'Under 5.7',
    eag: 'Under 115',
    homaIr: 'Under 1.50',
    fastingInsulin: '2.0 – 8.0',
    vitaminD: '30.0 – 100.0',
    vitaminB12: '300 – 900',
    folate: '3.0 – 20.0',
    magnesium: '1.60 – 2.60',
    tsh: '0.40 – 4.00',
    t3: '80 – 200',
    t4: '5.0 – 12.0',
    ft3: '2.30 – 4.20',
    ft4: '0.80 – 1.80',
    alt: '7 – 40',
    ast: '8 – 40',
    alp: '40 – 129',
    ggt: '9 – 55',
    bilirubinTotal: '0.20 – 1.20',
    bilirubinDirect: 'Under 0.30',
    albumin: '3.5 – 5.4',
    totalProtein: '6.0 – 8.3',
    urea: '12 – 43',
    bun: '6 – 20',
    calcium: '8.5 – 10.2',
    sodium: '135 – 145',
    potassium: '3.5 – 5.1',
    chloride: '98 – 107',
    wbc: '4.00 – 11.00',
    platelets: '150 – 450',
    mcv: '80.0 – 100.0',
    mch: '26.0 – 34.0',
    mchc: '31.0 – 36.0',
    rdw: '11.5 – 14.5',
    neutrophils: '40.0 – 75.0',
    lymphocytes: '20.0 – 45.0',
    monocytes: '2.0 – 10.0',
    eosinophils: 'Under 6.0',
    basophils: 'Under 2.0',
    esr: 'Under 20',
    hsCrp: 'Under 1.00',
    homocysteine: '5.0 – 15.0',
    psa: 'Under 4.00',
    cortisol: '5.0 – 23.0',
    testosterone: '300 – 1000',
    egfr: '60 and above',
    spo2: '95 and above',
    bmi: '18.5 – 24.9',
    temperature: '36.0 – 37.5',
    respRate: '12 – 20',
    systolic: '90 – 119',
    diastolic: '60 – 79',
    pulse: '60 – 100',
    iron: '65 – 175',
    tibc: '240 – 450',
  };

  for (const [key, expected] of Object.entries(EXPECTED)) {
    it(`${key} reads as "${expected}"`, () => {
      expect(formatRange(key)).toBe(expected);
    });
  }

  it('uses the male bands by default and the female ones on request', () => {
    expect(formatRange('hemoglobin', 'male')).toBe('13.0 – 17.2');
    expect(formatRange('hemoglobin', 'female')).toBe('11.6 – 15.5');
    expect(formatRange('hematocrit', 'male')).toBe('40.0 – 50.0');
    expect(formatRange('hematocrit', 'female')).toBe('36.0 – 45.0');
    expect(formatRange('creatinine', 'female')).toBe('0.56 – 1.02');
    expect(formatRange('uricAcid', 'female')).toBe('2.5 – 6.0');
    expect(formatRange('ferritin', 'male')).toBe('30.0 – 400.0');
    expect(formatRange('ferritin', 'female')).toBe('15.0 – 200.0');
    expect(formatRange('rbc', 'male')).toBe('4.50 – 5.90');
    expect(formatRange('rbc', 'female')).toBe('3.90 – 5.20');
    expect(formatRange('waist', 'male')).toBe('Under 94.0');
    expect(formatRange('waist', 'female')).toBe('Under 80.0');
  });

  it('leaves no marker with a bounded optimal window unaccounted for', () => {
    const covered = new Set([
      ...Object.keys(EXPECTED),
      'hemoglobin', 'hematocrit', 'creatinine', 'uricAcid', 'ferritin', 'rbc', 'waist', 'hdl', 'weight',
    ]);
    const uncovered = MARKERS.filter((m) => !covered.has(m.key)).map((m) => m.key);
    expect(uncovered).toEqual([]);
  });
});
