import { statusMeta } from '../../utils/ranges.js';

// The one place a status becomes a colour. Every screen uses this, so "high"
// can never be teal on one page and rose on another.
export default function StatusPill({ status, label, size = 'md' }) {
  const meta = statusMeta(status);
  const small = size === 'sm';
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full font-sans font-semibold ${
        small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
      }`}
      style={{ background: meta.soft, color: meta.color }}
    >
      <span
        className="inline-block rounded-full"
        style={{ width: small ? 5 : 6, height: small ? 5 : 6, background: meta.color }}
      />
      {label ?? meta.label}
    </span>
  );
}
