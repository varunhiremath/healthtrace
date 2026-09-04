import { create } from 'zustand';
import {
  hasVault,
  isUnlocked,
  lock,
  onVaultChange,
  unlockWithPassphrase,
  unlockWithBiometric,
  biometricEnrolled,
  platformAuthenticatorAvailable,
} from '../db/vault.js';

// The lock's state, for React. The KEY itself is not here — it stays in
// vault.js's module scope. This store only knows whether the app is open,
// shut, or has no lock at all.

const useLockStore = create((set, get) => ({
  // 'checking' until the database has been read, so the app never flashes an
  // unlocked screen at somebody who has a lock set.
  status: 'checking',
  biometric: false,
  biometricPossible: false,
  // Counts up on every unlock, so Dexie live queries can take it as a
  // dependency and re-run once the data becomes readable.
  generation: 0,

  async refresh() {
    const [locked, enrolled, possible] = await Promise.all([
      hasVault(),
      biometricEnrolled(),
      platformAuthenticatorAvailable(),
    ]);
    set({
      status: !locked ? 'off' : isUnlocked() ? 'unlocked' : 'locked',
      biometric: enrolled,
      biometricPossible: possible,
      generation: get().generation + 1,
    });
  },

  async unlock(passphrase) {
    await unlockWithPassphrase(passphrase);
    await get().refresh();
  },

  async unlockBiometric() {
    await unlockWithBiometric();
    await get().refresh();
  },

  lockNow() {
    if (get().status !== 'unlocked') return;
    lock();
    get().refresh();
  },
}));

// vault.js announces every change; the store re-reads rather than being told
// what changed, so there is one source of truth about whether we are open.
onVaultChange(() => {
  useLockStore.getState().refresh();
});

export default useLockStore;
