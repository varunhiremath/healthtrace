import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getMarker } from '../../data/markers.js';

// Measured against the summary card on the marker screen: it starts 94px down
// and runs 150px tall on every viewport height, because the top bar above it is
// a fixed stack. Keep these in step if that card's padding changes.
const CARD_TOP = 94;
const CARD_HEIGHT = 150;

// The next and previous markers, parked against the screen edges.
//
// A swipe nobody knows about is a feature nobody uses, so the gesture needs
// something visible saying which way to go and what is over there — "there is
// more this way" is far less useful than "Triglycerides is this way".
//
// The sliver is narrow and the name is set vertically on purpose: at phone
// width the content column is full-bleed, so anything pinned to an edge
// overlaps whatever is beside it, and 24px is the least this can take while
// still naming the marker. It sits beside the summary card at the top, clear
// of the chart, so the line is never behind it.
//
// PORTALLED TO document.body ON PURPOSE. The page root carries
// .anim-fade-slide-up, whose fill-mode leaves transform: translateY(0) on the
// element for good, and any transform other than none makes that element the
// containing block for position: fixed inside it. Rendered in place, these
// would be pinned to the whole scrolling page rather than the viewport and
// would slide away as you scrolled. Same reason modals portal out.
export default function EdgePager({ prev, next, onGo, animate = true }) {
  if (!prev && !next) return null;
  return createPortal(
    <>
      {prev && <Sliver markerKey={prev} side="left" onGo={onGo} animate={animate} />}
      {next && <Sliver markerKey={next} side="right" onGo={onGo} animate={animate} />}
    </>,
    document.body
  );
}

function Sliver({ markerKey, side, onGo, animate }) {
  const marker = getMarker(markerKey);
  if (!marker) return null;
  const isLeft = side === 'left';
  const Chevron = isLeft ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={() => onGo(markerKey)}
      aria-label={`${isLeft ? 'Previous' : 'Next'} marker: ${marker.name}`}
      className={`flex flex-col items-center justify-center gap-1.5 ${
        animate ? (isLeft ? 'anim-edge-pop-left' : 'anim-edge-pop-right') : ''
      }`}
      style={{
        position: 'fixed',
        // Level with the summary card — the block carrying the current value —
        // so the pager reads as belonging to "this marker" rather than floating
        // over the page. A fixed pixel offset, not a percentage: everything
        // above that card is a fixed stack (top bar, then the card), measured
        // at 94px from the top and unchanged across 640, 820 and 932px-tall
        // viewports, whereas a percentage drifts onto the chart as the screen
        // grows. Plus the notch inset, which the app shell adds to the page but
        // cannot add to something portalled out of it.
        top: `calc(${CARD_TOP}px + env(safe-area-inset-top))`,
        [side]: 0,
        [isLeft ? 'paddingLeft' : 'paddingRight']: `env(safe-area-inset-${side})`,
        zIndex: 30,
        height: CARD_HEIGHT,
        width: 24,
        background: 'var(--color-chalk)',
        border: '1px solid var(--color-ivory)',
        borderLeftWidth: isLeft ? 0 : 1,
        borderRightWidth: isLeft ? 1 : 0,
        borderRadius: isLeft ? '0 14px 14px 0' : '14px 0 0 14px',
        boxShadow: isLeft ? '4px 0 16px rgba(15,23,42,0.10)' : '-4px 0 16px rgba(15,23,42,0.10)',
      }}
    >
      <span
        className="truncate font-sans text-[9px] font-bold uppercase tracking-wide"
        style={{
          color: 'var(--color-text-secondary)',
          writingMode: 'vertical-rl',
          // Read bottom-to-top on the left, top-to-bottom on the right, so each
          // name runs away from its own edge rather than upside down.
          transform: isLeft ? 'rotate(180deg)' : 'none',
          maxHeight: 106,
        }}
      >
        {marker.name}
      </span>
      <Chevron size={13} className="flex-shrink-0" style={{ color: 'var(--color-pulse)' }} />
    </button>
  );
}
