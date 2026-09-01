import { NavLink } from 'react-router-dom';
import { Home, PlusCircle, FileText, TrendingUp, Settings } from 'lucide-react';

// Five tabs: where you stand, add something, the reports behind it, the trends
// over time, and everything else. Add is centred and filled because logging a
// reading is the action the app exists to make easy.
const tabs = [
  { to: '/home', label: 'Home', Icon: Home },
  { to: '/reports', label: 'Reports', Icon: FileText },
  { to: '/log', label: 'Add', Icon: PlusCircle, primary: true },
  { to: '/trends', label: 'Trends', Icon: TrendingUp },
  { to: '/more', label: 'More', Icon: Settings },
];

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 items-start justify-around"
      style={{
        background: 'var(--color-chalk)',
        borderTop: '1px solid var(--color-ivory)',
        paddingTop: 'var(--space-2)',
        paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))',
        borderTopLeftRadius: 'var(--radius-xl)',
        borderTopRightRadius: 'var(--radius-xl)',
      }}
    >
      {tabs.map(({ to, label, Icon, primary }) => (
        <NavLink key={to} to={to} aria-label={label} className="flex flex-col items-center gap-1">
          {({ isActive }) => (
            <>
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{
                  background: primary ? 'var(--color-pulse)' : 'transparent',
                  boxShadow: primary ? '0 4px 12px rgba(79,70,229,0.34)' : 'none',
                  color: primary ? '#ffffff' : isActive ? 'var(--color-pulse)' : 'var(--color-ash)',
                  transform: !primary && isActive ? 'translateY(-1px) scale(1.1)' : 'none',
                  transition: 'transform var(--dur-standard) var(--ease-out), color var(--dur-standard)',
                }}
              >
                <Icon size={primary ? 21 : 22} strokeWidth={primary ? 2.3 : 2} />
              </span>
              <span
                className="font-sans text-[10px]"
                style={{
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-ash)',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
