import { useEffect, useRef, useState } from 'react';
import useSettingsStore from '../../store/settingsStore.js';

// Counts a number up on first paint. Health figures deserve a beat of
// attention — but only when effects are on and motion is welcome.
export default function CountUp({ value, decimals = 0, duration = 600, className, style }) {
  const effects = useSettingsStore((s) => s.effects);
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const animate = effects && !reduced && Number.isFinite(value);

  const [shown, setShown] = useState(animate ? 0 : value);
  const frame = useRef(0);

  useEffect(() => {
    if (!animate) {
      setShown(value);
      return undefined;
    }
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      // Ease-out cubic: fast start, settles gently on the real figure.
      const eased = 1 - (1 - progress) ** 3;
      setShown(value * eased);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else setShown(value);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration, animate]);

  if (!Number.isFinite(shown)) return <span className={className} style={style}>—</span>;
  return (
    <span className={`tnum ${className ?? ''}`} style={style}>
      {shown.toFixed(decimals)}
    </span>
  );
}
