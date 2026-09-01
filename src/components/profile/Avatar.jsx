import { User } from 'lucide-react';
import { initialsOf } from '../../db/db.js';

// A person, as a coloured circle of initials. Used anywhere two family members
// could be confused for each other — which, in an app full of numbers, is
// everywhere.
export default function Avatar({ profile, size = 36, ring = false }) {
  const initials = initialsOf(profile?.name);
  const color = profile?.color ?? 'var(--color-pulse)';

  return (
    <span
      className="flex flex-shrink-0 items-center justify-center rounded-full font-display font-bold"
      style={{
        width: size,
        height: size,
        background: color,
        color: '#ffffff',
        fontSize: Math.round(size * 0.38),
        boxShadow: ring ? `0 0 0 2px var(--color-chalk), 0 0 0 4px ${color}` : 'none',
      }}
      aria-hidden="true"
    >
      {initials || <User size={Math.round(size * 0.5)} />}
    </span>
  );
}
