import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav.jsx';
import UiHost from '../ui/UiHost.jsx';
import LockScreen from '../LockScreen.jsx';
import Onboarding from '../onboarding/Onboarding.jsx';
import useSettingsStore from '../../store/settingsStore.js';
import useLockStore from '../../store/lockStore.js';
import { useProfiles } from '../../hooks/useHealth.js';

export default function AppLayout() {
  const status = useLockStore((s) => s.status);

  useAutoLock();

  // Nothing renders until the vault has been read, so a locked app never
  // flashes somebody's health history before the lock screen arrives.
  if (status === 'checking') return <div style={{ minHeight: '100vh', background: 'var(--color-canvas)' }} />;
  if (status === 'locked') return <LockScreen />;

  return <UnlockedApp />;
}

// Split out so the profile query — and everything it decrypts — only mounts
// once the app is actually open.
function UnlockedApp() {
  const { profiles, loaded } = useProfiles();
  const onboarded = useSettingsStore((s) => s.onboarded);
  // Onboarding also stands in for "there is nobody to show" — after an erase,
  // the app must not sit on an empty Home with no way to create a profile.
  const needsSetup = loaded && (!onboarded || profiles.length === 0);

  return (
    <div
      className="min-h-full"
      style={{
        background: 'var(--color-canvas)',
        // Clear the status bar / notch on edge-to-edge devices (Android 15+, iOS).
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <main className="mx-auto w-full max-w-md pb-24">
        <Outlet />
      </main>
      <BottomNav />
      {needsSetup && <Onboarding />}
      <UiHost />
    </div>
  );
}

/**
 * Close the lock again after the app has been in the background a while.
 *
 * The delay is the whole design problem. Locking the instant you switch away
 * would be the "secure" choice and would also make the app tiresome, because
 * entering a report means hopping to a photo or a PDF and back. Two minutes by
 * default, configurable, and 0 is there for anyone who wants it strict.
 */
function useAutoLock() {
  const status = useLockStore((s) => s.status);
  const lockNow = useLockStore((s) => s.lockNow);
  const minutes = useSettingsStore((s) => s.autoLockMinutes);

  useEffect(() => {
    if (status !== 'unlocked' || minutes < 0) return undefined;

    let timer;
    const onVisibility = () => {
      clearTimeout(timer);
      if (document.visibilityState !== 'hidden') return;
      if (minutes === 0) lockNow();
      else timer = setTimeout(lockNow, minutes * 60000);
    };

    document.addEventListener('visibilitychange', onVisibility);
    // A closed tab takes the key with it anyway — this just makes it explicit
    // rather than relying on the page being torn down.
    window.addEventListener('pagehide', lockNow);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', lockNow);
    };
  }, [status, minutes, lockNow]);
}
