import { create } from 'zustand';
import { applyTheme } from '../utils/theme.js';

const KEY = 'healthtrace_prefs';

// The markers a new person starts with pinned to their Home screen.
export const DEFAULT_PINNED = ['systolic', 'hba1c', 'ldl', 'hdl', 'vitaminD', 'hemoglobin'];

const DEFAULTS = {
  onboarded: false,
  theme: 'system',
  effects: true,
  sound: false,
  // Per-marker display unit: { [markerKey]: 'canonical' | 'alt' }. A display
  // preference of the person USING the app, so it is not per-profile.
  units: {},
  // Which family member the app is currently showing. Remembered across
  // launches so opening the app lands where you left off.
  activeProfileId: null,
  // Pinned markers are per-person: what matters for a parent is not what
  // matters for a child. { [profileId]: string[] }
  pinnedByProfile: {},
  // Date-first reading of ambiguous report dates (04/03/2026 = 4 March).
  dayFirstDates: true,
  // Reminders are best-effort only: the app can nudge you when you open it,
  // because a PWA with no backend cannot reliably wake itself in the background.
  checkupReminder: true,
  checkupIntervalDays: 365,
  lastRemindedDate: '',
};

const PERSISTED = Object.keys(DEFAULTS);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const merged = { ...DEFAULTS };
    for (const key of PERSISTED) if (key in saved) merged[key] = saved[key];
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

const useSettingsStore = create((set, get) => ({
  ...load(),

  persist() {
    const state = get();
    const out = {};
    for (const key of PERSISTED) out[key] = state[key];
    try {
      localStorage.setItem(KEY, JSON.stringify(out));
    } catch {
      /* private mode or quota — preferences are not worth crashing over */
    }
  },

  setTheme(theme) {
    set({ theme });
    get().persist();
    applyTheme(theme);
  },
  setEffects(effects) {
    set({ effects });
    get().persist();
  },
  setSound(sound) {
    set({ sound });
    get().persist();
  },
  setUnit(markerKey, mode) {
    set((s) => ({ units: { ...s.units, [markerKey]: mode } }));
    get().persist();
  },
  setActiveProfile(activeProfileId) {
    set({ activeProfileId });
    get().persist();
  },
  // Reading pins falls back to the defaults, so a person who has never touched
  // the star still gets a sensible Home screen.
  pinnedFor(profileId) {
    const saved = get().pinnedByProfile[profileId];
    return Array.isArray(saved) ? saved : DEFAULT_PINNED;
  },
  togglePinned(profileId, markerKey) {
    const current = get().pinnedFor(profileId);
    const next = current.includes(markerKey)
      ? current.filter((k) => k !== markerKey)
      : [...current, markerKey];
    set((s) => ({ pinnedByProfile: { ...s.pinnedByProfile, [profileId]: next } }));
    get().persist();
  },
  setPinned(profileId, pinned) {
    set((s) => ({ pinnedByProfile: { ...s.pinnedByProfile, [profileId]: pinned } }));
    get().persist();
  },
  // Called when a person is deleted, so their pins do not linger in storage.
  forgetProfile(profileId) {
    set((s) => {
      const { [profileId]: removed, ...rest } = s.pinnedByProfile;
      return {
        pinnedByProfile: rest,
        activeProfileId: s.activeProfileId === profileId ? null : s.activeProfileId,
      };
    });
    get().persist();
  },
  setDayFirstDates(dayFirstDates) {
    set({ dayFirstDates });
    get().persist();
  },
  setCheckupReminder(checkupReminder) {
    set({ checkupReminder });
    get().persist();
  },
  setCheckupIntervalDays(checkupIntervalDays) {
    set({ checkupIntervalDays });
    get().persist();
  },
  markReminded(dateKey) {
    set({ lastRemindedDate: dateKey });
    get().persist();
  },
  completeOnboarding() {
    set({ onboarded: true });
    get().persist();
  },
  resetPreferences() {
    set({ ...DEFAULTS });
    get().persist();
    applyTheme(DEFAULTS.theme);
  },
}));

export default useSettingsStore;
