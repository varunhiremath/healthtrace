export default function TopBar({ title, subtitle, right, back }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-6">
      <div className="flex min-w-0 items-center gap-2">
        {back}
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 truncate font-sans text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {right && <div className="flex flex-shrink-0 items-center gap-2 pt-1">{right}</div>}
    </div>
  );
}
