import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav.jsx';
import UiHost from '../ui/UiHost.jsx';
import Onboarding from '../onboarding/Onboarding.jsx';
import useSettingsStore from '../../store/settingsStore.js';
import { useProfiles } from '../../hooks/useHealth.js';

export default function AppLayout() {
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
