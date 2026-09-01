import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getMarker } from '../../data/markers.js';

// The next and previous markers, parked against the screen edges.
//
// A swipe nobody knows about is a feature nobody uses, so the gesture needs
// something visible saying which way to go and what is over there — "there is
// more this way" is far less useful than "Triglycerides is this way".
//
// The sliver is narrow and the name is set vertically on purpose: at phone
// width the content column is full-bleed, so anything pinned to an edge
// overlaps whatever is beside it, and 24px is the least this can take while
// still naming the marker. It sits below the chart so the line is never
// covered.
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
        animate ? (isLeft ? 'anim-edge-peek-left' : 'anim-edge-peek-right') : ''
      }`}
      style={{
        position: 'fixed',
        // Anchored to the BOTTOM, not to a percentage of the viewport. What sits
        // above the chart is a fixed stack of pixels, so a percentage puts this
        // over the plot on one screen size and under it on another; measured up
        // from the bottom nav it clears the chart on a tall screen and stays
        // reachable on a short one. It also means no vertical transform, so the
        // peek keyframes have nothing to overwrite.
        bottom: 116,
        [side]: 0,
        [isLeft ? 'paddingLeft' : 'paddingRight']: `env(safe-area-inset-${side})`,
        zIndex: 30,
        height: 150,
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
          maxHeight: 108,
        }}
      >
        {marker.name}
      </span>
      <Chevron size={13} className="flex-shrink-0" style={{ color: 'var(--color-pulse)' }} />
    </button>
  );
}
