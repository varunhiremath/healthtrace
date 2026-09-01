// Shown instead of a blank app when IndexedDB will not open — usually a
// blocked upgrade from another open tab, or private-browsing restrictions.
// It never offers to delete anything: the data may be perfectly fine.
export default function DbRecovery() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-8 text-center"
      style={{ background: 'var(--color-chalk)' }}
    >
      <p className="font-display text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
        Can’t open your data
      </p>
      <p className="mt-3 max-w-sm font-sans text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        HealthTrace stores everything in this browser’s database, and it would not open. This
        usually means another tab has HealthTrace open on an older version, or the browser is in a
        private window where storage is restricted.
      </p>
      <p className="mt-3 max-w-sm font-sans text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        Close any other HealthTrace tabs and reload. Your data has not been touched.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-6 rounded-xl px-8 py-3 font-sans text-sm font-semibold"
        style={{ background: 'var(--color-pulse)', color: '#ffffff' }}
      >
        Reload
      </button>
    </div>
  );
}
