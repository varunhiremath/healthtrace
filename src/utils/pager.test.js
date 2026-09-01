import { describe, it, expect } from 'vitest';
import { pagerOrder, pagerNeighbours, swipeDirection, SWIPE } from './pager.js';

const CATEGORIES = [{ key: 'vitals' }, { key: 'lipids' }, { key: 'blood' }];
const row = (markerKey, category) => ({ markerKey, marker: { category } });

describe('pagerOrder', () => {
  it('groups by category in the order the list shows them', () => {
    const rows = [row('hdl', 'lipids'), row('bmi', 'vitals'), row('wbc', 'blood'), row('ldl', 'lipids')];
    expect(pagerOrder(rows, CATEGORIES)).toEqual(['bmi', 'hdl', 'ldl', 'wbc']);
  });

  it('keeps catalogue order within a category', () => {
    const rows = [row('a', 'lipids'), row('b', 'lipids'), row('c', 'lipids')];
    expect(pagerOrder(rows, CATEGORIES)).toEqual(['a', 'b', 'c']);
  });

  it('puts an unknown category last rather than dropping it', () => {
    const rows = [row('mystery', 'nope'), row('bmi', 'vitals')];
    expect(pagerOrder(rows, CATEGORIES)).toEqual(['bmi', 'mystery']);
  });

  it('does not mutate the rows it was given', () => {
    const rows = [row('hdl', 'lipids'), row('bmi', 'vitals')];
    pagerOrder(rows, CATEGORIES);
    expect(rows.map((r) => r.markerKey)).toEqual(['hdl', 'bmi']);
  });

  it('survives empty input', () => {
    expect(pagerOrder()).toEqual([]);
    expect(pagerOrder([], CATEGORIES)).toEqual([]);
  });
});

describe('pagerNeighbours', () => {
  const keys = ['a', 'b', 'c'];

  it('finds both neighbours in the middle', () => {
    expect(pagerNeighbours(keys, 'b')).toEqual({ index: 1, total: 3, prev: 'a', next: 'c' });
  });

  it('stops at each end instead of wrapping', () => {
    expect(pagerNeighbours(keys, 'a').prev).toBe(null);
    expect(pagerNeighbours(keys, 'a').next).toBe('b');
    expect(pagerNeighbours(keys, 'c').next).toBe(null);
    expect(pagerNeighbours(keys, 'c').prev).toBe('b');
  });

  it('reports a marker that is not in the list as unplaced', () => {
    expect(pagerNeighbours(keys, 'zzz')).toEqual({ index: -1, total: 3, prev: null, next: null });
  });

  it('has nowhere to go from a list of one', () => {
    expect(pagerNeighbours(['only'], 'only')).toEqual({ index: 0, total: 1, prev: null, next: null });
  });
});

describe('swipeDirection', () => {
  const from = { x: 200, y: 400, at: 0 };
  const end = (dx, dy, ms) => ({ x: 200 + dx, y: 400 + dy, at: ms });

  it('reads a sideways flick as a direction', () => {
    expect(swipeDirection(from, end(-120, 5, 200))).toBe('left');
    expect(swipeDirection(from, end(120, -5, 200))).toBe('right');
  });

  it('ignores a flick too short to be deliberate', () => {
    expect(swipeDirection(from, end(-(SWIPE.minDistance - 1), 0, 150))).toBe(null);
    expect(swipeDirection(from, end(-SWIPE.minDistance, 0, 150))).toBe('left');
  });

  it('leaves a vertical gesture alone, so the page still scrolls', () => {
    expect(swipeDirection(from, end(-70, 300, 200))).toBe(null);
    // Diagonal, but decisively sideways, still counts.
    expect(swipeDirection(from, end(-140, 60, 200))).toBe('left');
  });

  it('ignores a slow drag, which is how a chart is read', () => {
    expect(swipeDirection(from, end(-200, 0, SWIPE.maxDuration + 1))).toBe(null);
    expect(swipeDirection(from, end(-200, 0, SWIPE.maxDuration))).toBe('left');
  });

  it('returns null for a gesture it never saw the start or end of', () => {
    expect(swipeDirection(null, end(-120, 0, 100))).toBe(null);
    expect(swipeDirection(from, null)).toBe(null);
    expect(swipeDirection(from, { x: NaN, y: 0, at: 100 })).toBe(null);
  });
});
