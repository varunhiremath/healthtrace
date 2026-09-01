import { useState } from 'react';
import { HeartPulse, ShieldCheck, ClipboardPaste, TrendingUp } from 'lucide-react';
import { addProfile } from '../../db/actions.js';
import { listProfiles } from '../../db/db.js';
import { todayKey } from '../../utils/dates.js';
import useSettingsStore from '../../store/settingsStore.js';
import { Field, Input, Select, Button } from '../ui/Field.jsx';

// Three short steps, and the last one is skippable. The profile questions are
// asked here because two of them change what the app can compute — and the
// screen says so rather than just demanding the data.
const SLIDES = [
  {
    Icon: HeartPulse,
    title: 'Your health, in one place',
    body: 'Blood work, blood pressure, sugar, vitamins — every number you or your family have ever been given, kept together and charted over time.',
  },
  {
    Icon: ClipboardPaste,
    title: 'Paste a lab report, get your markers',
    body: 'Copy the text out of a lab PDF and HealthTrace reads the values out of it. It shows you everything it found before saving a thing.',
  },
  {
    Icon: ShieldCheck,
    title: 'It never leaves this device',
    body: 'No account, no server, no sync. Your health record lives in this app on this phone. Export a backup whenever you want a copy.',
  },
];

export default function Onboarding() {
  const complete = useSettingsStore((s) => s.completeOnboarding);
  const setActiveProfile = useSettingsStore((s) => s.setActiveProfile);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: '', relation: 'Me', dob: '', sex: '', heightCm: '' });

  const isProfileStep = step === SLIDES.length;

  async function finish(save) {
    // Dismiss first, save second. Marking onboarding complete is a synchronous
    // localStorage write; the profile write is an async IndexedDB round trip.
    // Waiting on the slow one before dismissing means a fast tap through to the
    // next screen can leave the welcome overlay up, or bring it back.
    complete();
    try {
      // A household always needs at least one person, so a profile is created
      // even when this step is skipped — it is just an empty one, named later.
      const existing = await listProfiles();
      if (existing.length) {
        setActiveProfile(existing[0].id);
        return;
      }
      const id = await addProfile(
        save
          ? {
              name: form.name.trim(),
              relation: form.relation.trim(),
              dob: form.dob,
              sex: form.sex || null,
              heightCm: form.heightCm === '' ? null : Number(form.heightCm),
            }
          : {}
      );
      setActiveProfile(id);
    } catch (error) {
      // The profile is entirely optional and editable later, so a failure here
      // must not trap someone on the welcome screen.
      console.error('Could not create the first profile:', error);
    }
  }

  const CurrentIcon = isProfileStep ? TrendingUp : SLIDES[step].Icon;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: 'var(--color-canvas)' }}>
      <div
        className="mx-auto flex w-full max-w-md flex-1 flex-col px-6"
        style={{
          paddingTop: 'calc(48px + env(safe-area-inset-top))',
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
        }}
      >
        {isProfileStep ? (
          <div className="anim-fade-slide-up flex flex-1 flex-col overflow-y-auto">
            <CurrentIcon size={30} style={{ color: 'var(--color-pulse)' }} />
            <h1 className="mt-4 font-display text-2xl font-extrabold" style={{ color: 'var(--color-text-primary)' }}>
              A couple of details
            </h1>
            <p className="mt-2 font-sans text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Some reference ranges differ by sex, and eGFR needs your age. Skip this and HealthTrace
              simply leaves out what it cannot work out — you can fill it in later.
            </p>

            <div className="mt-6 flex flex-col gap-4">
              <Field label="Name" htmlFor="ob-name">
                <Input
                  id="ob-name"
                  value={form.name}
                  placeholder="Optional"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Date of birth" htmlFor="ob-dob">
                <Input
                  id="ob-dob"
                  type="date"
                  max={todayKey()}
                  value={form.dob}
                  onChange={(e) => setForm({ ...form, dob: e.target.value })}
                />
              </Field>
              <Field label="Sex at birth" htmlFor="ob-sex">
                <Select id="ob-sex" value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
                  <option value="">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </Select>
              </Field>
              <Field label="Height" hint="In centimetres. Used for BMI." htmlFor="ob-height">
                <Input
                  id="ob-height"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={form.heightCm}
                  placeholder="175"
                  onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
                />
              </Field>
            </div>

            <div className="mt-auto flex flex-col gap-2 pt-6">
              <Button full onClick={() => finish(true)}>
                Start tracking
              </Button>
              <button
                onClick={() => finish(false)}
                className="py-2 font-sans text-sm font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Skip for now
              </button>
            </div>
          </div>
        ) : (
          <div className="anim-fade-slide-up flex flex-1 flex-col" key={step}>
            <div className="flex flex-1 flex-col justify-center">
              <span
                className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ background: 'var(--color-pulse-soft)' }}
              >
                <CurrentIcon size={28} style={{ color: 'var(--color-pulse)' }} />
              </span>
              <h1 className="font-display text-3xl font-extrabold leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                {SLIDES[step].title}
              </h1>
              <p className="mt-3 font-sans text-base leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {SLIDES[step].body}
              </p>
            </div>

            <div className="mb-5 flex justify-center gap-1.5">
              {SLIDES.map((slide, index) => (
                <span
                  key={slide.title}
                  className="h-1.5 rounded-full"
                  style={{
                    width: index === step ? 20 : 6,
                    background: index === step ? 'var(--color-pulse)' : 'var(--color-ivory)',
                    transition: 'width var(--dur-standard) var(--ease-out)',
                  }}
                />
              ))}
            </div>

            <Button full onClick={() => setStep(step + 1)}>
              {step === SLIDES.length - 1 ? 'Get started' : 'Next'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
