import useSettingsStore from '../store/settingsStore.js';

// Short, meaningful buzzes only — a health app should feel calm, not chatty.
const PATTERNS = {
  tap: 10,
  saved: [18, 30, 40],
  flagged: [40, 60, 40],
};

export function useHaptics() {
  const effects = useSettingsStore((s) => s.effects);
  return (kind = 'tap') => {
    if (!effects) return;
    navigator.vibrate?.(PATTERNS[kind] ?? PATTERNS.tap);
  };
}
