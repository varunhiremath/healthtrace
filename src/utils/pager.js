// Paging from one marker straight to the next, without going back to the list.
//
// Two pure pieces: the ORDER markers are paged in, and whether a touch was a
// swipe. Both are decided here rather than in the screen, so the order that a
// gesture walks is provably the order the Trends list shows — a "next" that
// disagreed with the list it came from would feel like a different app.

// The Trends list groups by category and keeps catalogue order inside each
// group, so paging follows the same path the eye would take down that page.
// Sorting is stable, so within a category the incoming order survives.
export function pagerOrder(rows = [], categories = []) {
  const rank = new Map(categories.map((category, index) => [category.key, index]));
  const place = (row) => rank.get(row?.marker?.category) ?? categories.length;
  return [...rows].sort((a, b) => place(a) - place(b)).map((row) => row.markerKey);
}

/**
 * Where paging can go from here.
 *
 * The ends are dead ends on purpose: wrapping from the last marker back to the
 * first would make a swipe feel like it had done nothing, since the screen it
 * lands on looks like where the journey started.
 */
export function pagerNeighbours(keys = [], currentKey) {
  const index = keys.indexOf(currentKey);
  if (index < 0) return { index: -1, total: keys.length, prev: null, next: null };
  return {
    index,
    total: keys.length,
    prev: index > 0 ? keys[index - 1] : null,
    next: index < keys.length - 1 ? keys[index + 1] : null,
  };
}

// A flick, not a drag. Long presses and slow drags are how you read a chart —
// the tooltip follows your finger — so only a quick, clearly sideways gesture
// counts as "take me to the next marker".
export const SWIPE = {
  minDistance: 60, // px travelled sideways
  maxDuration: 600, // ms; past this it is a drag, not a flick
  axisRatio: 1.5, // how much more sideways than vertical it must be
};

/**
 * @returns {'left'|'right'|null} the direction of a swipe, or null if the
 * gesture was not one. Points are `{ x, y, at }` in px and ms.
 */
export function swipeDirection(from, to, options = SWIPE) {
  if (!from || !to) return null;
  const { minDistance, maxDuration, axisRatio } = { ...SWIPE, ...options };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (![dx, dy].every(Number.isFinite)) return null;
  if (to.at - from.at > maxDuration) return null;
  if (Math.abs(dx) < minDistance) return null;
  // A mostly-vertical gesture is the page scrolling, and must stay that way.
  if (Math.abs(dx) < Math.abs(dy) * axisRatio) return null;
  return dx < 0 ? 'left' : 'right';
}
