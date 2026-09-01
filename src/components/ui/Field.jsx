// The one styled input used across every form, so entry looks the same
// everywhere and the tap targets stay large enough for a phone.
export function Field({ label, hint, children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="font-sans text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && (
        <span className="mt-1 block font-sans text-[11px]" style={{ color: 'var(--color-ash)' }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function Input(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl px-3.5 py-3 font-sans outline-none ${props.className ?? ''}`}
      style={{
        background: 'var(--color-ivory)',
        color: 'var(--color-text-primary)',
        border: '1px solid transparent',
        ...props.style,
      }}
      onFocus={(e) => {
        e.target.style.borderColor = 'var(--color-pulse)';
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.target.style.borderColor = 'transparent';
        props.onBlur?.(e);
      }}
    />
  );
}

export function Select(props) {
  return (
    <select
      {...props}
      className={`w-full appearance-none rounded-xl px-3.5 py-3 font-sans outline-none ${props.className ?? ''}`}
      style={{ background: 'var(--color-ivory)', color: 'var(--color-text-primary)', ...props.style }}
    />
  );
}

export function Button({ variant = 'primary', full, children, ...props }) {
  const styles = {
    primary: { background: 'var(--color-pulse)', color: '#ffffff' },
    secondary: { background: 'var(--color-ivory)', color: 'var(--color-text-primary)' },
    danger: { background: 'var(--status-high)', color: '#ffffff' },
    ghost: { background: 'transparent', color: 'var(--color-pulse)' },
  };
  return (
    <button
      {...props}
      className={`rounded-xl px-5 py-3 font-sans text-sm font-semibold disabled:opacity-40 ${full ? 'w-full' : ''} ${props.className ?? ''}`}
      style={{ ...styles[variant], ...props.style }}
    >
      {children}
    </button>
  );
}
