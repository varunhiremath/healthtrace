export default function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="anim-fade-in flex flex-col items-center px-6 py-14 text-center">
      {Icon && (
        <span
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: 'var(--color-pulse-soft)' }}
        >
          <Icon size={24} style={{ color: 'var(--color-pulse)' }} />
        </span>
      )}
      <p className="font-display text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
        {title}
      </p>
      {body && (
        <p className="mt-2 max-w-xs font-sans text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {body}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
