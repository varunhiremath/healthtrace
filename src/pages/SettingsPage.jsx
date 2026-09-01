import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, Monitor, Sparkles, Volume2, CalendarClock, Calendar } from 'lucide-react';
import useSettingsStore from '../store/settingsStore.js';
import { useHealthData } from '../hooks/useHealth.js';
import { getMarker } from '../data/markers.js';
import TopBar from '../components/layout/TopBar.jsx';

export default function SettingsPage() {
  const navigate = useNavigate();
  const s = useSettingsStore();
  const data = useHealthData();

  return (
    <div className="anim-fade-slide-up pb-6">
      <TopBar
        title="Settings"
        back={
          <button onClick={() => navigate(-1)} aria-label="Back" className="mr-1 p-1">
            <ArrowLeft size={20} style={{ color: 'var(--color-text-primary)' }} />
          </button>
        }
      />

      <div className="px-5 pt-4">
        <Group title="Appearance">
          <div className="rounded-2xl px-4 py-3.5" style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}>
            <p className="mb-2.5 font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Theme
            </p>
            <div className="flex gap-2">
              {[
                { key: 'light', label: 'Light', Icon: Sun },
                { key: 'dark', label: 'Dark', Icon: Moon },
                { key: 'system', label: 'System', Icon: Monitor },
              ].map((option) => (
                <button
                  key={option.key}
                  onClick={() => s.setTheme(option.key)}
                  className="flex flex-1 flex-col items-center gap-1 rounded-xl py-2.5 font-sans text-[11px] font-semibold"
                  style={{
                    background: s.theme === option.key ? 'var(--color-pulse)' : 'var(--color-ivory)',
                    color: s.theme === option.key ? '#ffffff' : 'var(--color-text-secondary)',
                  }}
                >
                  <option.Icon size={15} />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <Toggle
            icon={Sparkles}
            label="Motion and haptics"
            sub="Rings that fill, numbers that count up, a light buzz on save"
            value={s.effects}
            onChange={s.setEffects}
          />
          <Toggle
            icon={Volume2}
            label="Sounds"
            sub="A short chime when a reading is saved"
            value={s.sound}
            onChange={s.setSound}
          />
        </Group>

        <Group title="Reading your reports">
          <Toggle
            icon={Calendar}
            label="Dates are day-first"
            sub={s.dayFirstDates ? '04/03/2026 reads as 4 March 2026' : '04/03/2026 reads as 3 April 2026'}
            value={s.dayFirstDates}
            onChange={s.setDayFirstDates}
          />
        </Group>

        <Group title="Checkup reminder">
          <Toggle
            icon={CalendarClock}
            label="Remind me when a panel is old"
            sub="Shown on Home when you open the app"
            value={s.checkupReminder}
            onChange={s.setCheckupReminder}
          />
          {s.checkupReminder && (
            <div className="rounded-2xl px-4 py-3.5" style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}>
              <p className="mb-2.5 font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Nudge me after
              </p>
              <div className="flex gap-2">
                {[
                  { days: 182, label: '6 months' },
                  { days: 365, label: '1 year' },
                  { days: 730, label: '2 years' },
                ].map((option) => (
                  <button
                    key={option.days}
                    onClick={() => s.setCheckupIntervalDays(option.days)}
                    className="flex-1 rounded-xl py-2.5 font-sans text-xs font-semibold"
                    style={{
                      background: s.checkupIntervalDays === option.days ? 'var(--color-pulse)' : 'var(--color-ivory)',
                      color: s.checkupIntervalDays === option.days ? '#ffffff' : 'var(--color-text-secondary)',
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-2.5 font-sans text-[11px] leading-relaxed" style={{ color: 'var(--color-ash)' }}>
                This is an in-app note on your Home screen, not a push notification. HealthTrace has no
                server, so it cannot wake your phone on its own — it can only tell you when you open it.
              </p>
            </div>
          )}
        </Group>

        {Object.keys(s.units).length > 0 && (
          <Group title="Units you have changed">
            <div className="rounded-2xl px-4 py-3.5" style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}>
              {Object.entries(s.units).map(([key, mode]) => {
                const marker = getMarker(key);
                if (!marker) return null;
                return (
                  <div key={key} className="flex items-center justify-between py-1">
                    <span className="font-sans text-xs" style={{ color: 'var(--color-text-primary)' }}>
                      {marker.name}
                    </span>
                    <span className="font-sans text-xs font-semibold" style={{ color: 'var(--color-pulse)' }}>
                      {mode === 'alt' ? marker.altUnit : marker.unit}
                    </span>
                  </div>
                );
              })}
              <p className="mt-2 font-sans text-[11px]" style={{ color: 'var(--color-ash)' }}>
                Change a marker’s unit from its own screen.
              </p>
            </div>
          </Group>
        )}

        <Group title={data.profiles.length > 1 ? `Pinned for ${data.profile.name || 'this profile'}` : 'Pinned on Home'}>
          <div className="rounded-2xl px-4 py-3.5" style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}>
            {data.pinned.length === 0 ? (
              <p className="font-sans text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Nothing pinned. Tap the star on any marker to pin it.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.pinned.map((key) => {
                  const marker = getMarker(key);
                  if (!marker) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => s.togglePinned(data.profileId, key)}
                      className="rounded-full px-3 py-1.5 font-sans text-[11px] font-semibold"
                      style={{ background: 'var(--color-pulse-soft)', color: 'var(--color-pulse)' }}
                    >
                      {marker.short} ✕
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Group>
      </div>
    </div>
  );
}

function Group({ title, children }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 font-sans text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
        {title}
      </h2>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function Toggle({ icon: Icon, label, sub, value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left"
      style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--color-ivory)' }}>
        <Icon size={16} style={{ color: 'var(--color-pulse)' }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {label}
        </p>
        <p className="font-sans text-[11px] leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
          {sub}
        </p>
      </div>
      <span
        className="relative h-6 w-11 flex-shrink-0 rounded-full"
        style={{ background: value ? 'var(--color-pulse)' : 'var(--color-ivory)' }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full"
          style={{
            left: value ? 22 : 2,
            background: '#ffffff',
            boxShadow: '0 1px 3px rgba(15,23,42,0.25)',
            transition: 'left var(--dur-standard) var(--ease-out)',
          }}
        />
      </span>
    </button>
  );
}
