import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getMarker } from '../../data/markers.js';

// The next and previous markers, parked against the screen edges.
//
// A swipe nobody knows about is a feature nobody uses, so the gesture needs
// something visible saying which way to go and what is over there — "there is
// more this way" is far less useful than "Triglycerides is this way".
//
// It wears the app's primary indigo with white type rather than the quiet card
// treatment it started with. The first attempt was 9px uppercase in muted grey,
// on a near-white sliver, against a near-white page: small type and low
// contrast compounding each other, and unreadable at arm's length. Filled
// indigo is also how every other pressable thing in the app is coloured, so it
// reads as a control instead of decoration.
//
// The name is set vertically on purpose: at phone width the content column is
// full-bleed, so anything pinned to an edge overlaps whatever is beside it, and
// 30px is the least this can take while still naming the marker. It sits level
// with the summary card, clear of the chart, so the line is never behind it.
//
// PORTALLED TO document.body ON PURPOSE. The page root carries
// .anim-fade-slide-up, whose fill-mode leaves transform: translateY(0) on the
// element for good, and any transform other than none makes that element the
// containing block for position: fixed inside it. Rendered in place, these
// would be pinned to the whole scrolling page rather than the viewport and
// would slide away as you scrolled. Same reason modals portal out.

// Measured against the summary card on the marker screen: it starts 94px down
// and runs 150px tall on every viewport height, because the top bar above it is
// a fixed stack. Keep these in step if that card's padding changes.
const CARD_TOP = 94;
const CARD_HEIGHT = 150;

export default function EdgePager({ prev, next, onGo, animate = true }) {
  if (!prev && !next) return null;
  return createPortal(
    <>
      {prev && <Tab markerKey={prev} side="left" onGo={onGo} animate={animate} />}
      {next && <Tab markerKey={next} side="right" onGo={onGo} animate={animate} />}
    </>,
    document.body
  );
}

function Tab({ markerKey, side, onGo, animate }) {
  const marker = getMarker(markerKey);
  if (!marker) return null;
  const isLeft = side === 'left';
  const Chevron = isLeft ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={() => onGo(markerKey)}
      aria-label={`${isLeft ? 'Previous' : 'Next'} marker: ${marker.name}`}
      className={`flex flex-col items-center justify-center gap-2 ${
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
        width: 30,
        background: 'var(--color-pulse)',
        border: 'none',
        borderRadius: isLeft ? '0 16px 16px 0' : '16px 0 0 16px',
        boxShadow: isLeft ? '5px 0 20px rgba(79,70,229,0.35)' : '-5px 0 20px rgba(79,70,229,0.35)',
      }}
    >
      <span
        className="truncate font-sans text-[11px] font-bold tracking-wide"
        style={{
          // White on the accent, per the design rule — never the dark ink.
          color: '#ffffff',
          writingMode: 'vertical-rl',
          // Read bottom-to-top on the left, top-to-bottom on the right, so each
          // name runs away from its own edge rather than upside down.
          transform: isLeft ? 'rotate(180deg)' : 'none',
          maxHeight: 104,
        }}
      >
        {marker.name}
      </span>
      <span
        className={`flex flex-shrink-0 ${
          animate ? (isLeft ? 'anim-chevron-nudge-left' : 'anim-chevron-nudge-right') : ''
        }`}
      >
        <Chevron size={16} strokeWidth={2.75} style={{ color: '#ffffff' }} />
      </span>
    </button>
  );
}
