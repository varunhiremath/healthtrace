import { describe, it, expect } from 'vitest';
import { linesFromTextItems, describePdfLimit, MAX_BYTES } from './pdfText.js';

// pdfjs hands over positioned fragments; [4] is x, [5] is y. y grows UPWARD,
// so a larger y is higher on the page.
const item = (text, x, y) => ({ str: text, transform: [1, 0, 0, 1, x, y] });

describe('linesFromTextItems', () => {
  it('rebuilds a row from fragments that share a baseline', () => {
    expect(
      linesFromTextItems([item('Total Cholesterol', 50, 700), item('186', 300, 700), item('mg/dL', 360, 700)])
    ).toEqual(['Total Cholesterol 186 mg/dL']);
  });

  it('orders fragments left to right regardless of the order they arrive in', () => {
    expect(
      linesFromTextItems([item('mg/dL', 360, 700), item('186', 300, 700), item('Total Cholesterol', 50, 700)])
    ).toEqual(['Total Cholesterol 186 mg/dL']);
  });

  it('orders rows down the page, which means descending y', () => {
    expect(
      linesFromTextItems([item('second', 50, 680), item('first', 50, 700), item('third', 50, 660)])
    ).toEqual(['first', 'second', 'third']);
  });

  it('keeps a two-column lab table reading across, then down', () => {
    // The Epic layout: two markers on one row, their values on the row below.
    expect(
      linesFromTextItems([
        item('White Blood Cells', 40, 500),
        item('RBC', 300, 500),
        item('9.7', 40, 480),
        item('5.91', 300, 480),
      ])
    ).toEqual(['White Blood Cells RBC', '9.7 5.91']);
  });

  it('treats near-identical baselines as one row', () => {
    // A raised unit or a slightly-off fragment must not start a new line.
    expect(linesFromTextItems([item('TSH', 50, 700), item('3.611', 200, 702)])).toEqual(['TSH 3.611']);
  });

  it('starts a new row once the gap is clearly a new line', () => {
    expect(linesFromTextItems([item('TSH', 50, 700), item('3.611', 50, 690)])).toEqual(['TSH', '3.611']);
  });

  it('drops empty fragments and collapses runs of whitespace', () => {
    expect(linesFromTextItems([item('HbA1c', 50, 700), item('   ', 120, 700), item('5.9', 200, 700)])).toEqual([
      'HbA1c 5.9',
    ]);
  });

  it('ignores malformed items rather than throwing', () => {
    expect(
      linesFromTextItems([
        item('good', 50, 700),
        { str: 'no transform' },
        { transform: [1, 0, 0, 1, 0, 700] },
        null,
        undefined,
      ])
    ).toEqual(['good']);
  });

  it('handles an empty or missing page', () => {
    expect(linesFromTextItems([])).toEqual([]);
    expect(linesFromTextItems()).toEqual([]);
  });
});

describe('describePdfLimit', () => {
  it('accepts a normal report', () => {
    expect(describePdfLimit({ size: 200 * 1024 })).toBeNull();
  });

  it('explains, in MB, when a file is too big', () => {
    const message = describePdfLimit({ size: MAX_BYTES + 1 });
    expect(message).toContain('MB');
    expect(message).toContain('25');
  });

  it('handles no file', () => {
    expect(describePdfLimit(null)).toBe('No file chosen.');
  });
});
