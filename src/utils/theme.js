// Resolves 'system' to the OS preference, applies the theme to <html>, and
// keeps the browser/Android status bar colour in step. Guarded so it is safe to
// import outside a browser (tests, SSR-style tooling).

export function resolveTheme(theme) {
  if (theme === 'system') {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0b1120' : '#4f46e5');
}
