import { useEffect, useRef } from 'react';
import { swipeDirection } from '../utils/pager.js';

/**
 * Flick left or right to go somewhere; arrow keys do the same on a keyboard.
 *
 * Returns touch handlers to spread onto the element being swiped. Nothing here
 * calls preventDefault: a vertical gesture is never claimed, so the page goes
 * on scrolling exactly as it did before, and a horizontal one has nothing to
 * cancel because the page does not scroll sideways.
 */
export default function useSwipeNav({ onLeft, onRight, enabled = true } = {}) {
  const start = useRef(null);
  const handlers = useRef({ onLeft, onRight });
  handlers.current = { onLeft, onRight };

  useEffect(() => {
    if (!enabled) return undefined;
    function onKeyDown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Not while someone is typing in a field or working a control.
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
      if (event.key === 'ArrowRight') handlers.current.onLeft?.();
      else if (event.key === 'ArrowLeft') handlers.current.onRight?.();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  if (!enabled) return {};

  return {
    onTouchStart(event) {
      // A second finger means a pinch or a zoom, not a page turn.
      if (event.touches?.length !== 1) {
        start.current = null;
        return;
      }
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
    },
    onTouchEnd(event) {
      const from = start.current;
      start.current = null;
      const touch = event.changedTouches?.[0];
      if (!from || !touch) return;
      const direction = swipeDirection(from, { x: touch.clientX, y: touch.clientY, at: Date.now() });
      // Swiping left carries you forward, the way a page turns.
      if (direction === 'left') handlers.current.onLeft?.();
      else if (direction === 'right') handlers.current.onRight?.();
    },
    onTouchCancel() {
      start.current = null;
    },
  };
}
