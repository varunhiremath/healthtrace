import { useEffect, useRef, useState } from 'react';
import { Lock, Fingerprint } from 'lucide-react';
import { Field, Input, Button } from './ui/Field.jsx';
import useLockStore from '../store/lockStore.js';

// What you see when HealthTrace is shut.
//
// This is not a screen guard in front of readable data — while this is showing,
// the data key does not exist in memory and every reading in the database is
// ciphertext. There is nothing behind this screen to skip to.
export default function LockScreen() {
  const biometric = useLockStore((s) => s.biometric);
  const unlock = useLockStore((s) => s.unlock);
  const unlockBiometric = useLockStore((s) => s.unlockBiometric);

  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(!biometric);
  const attempted = useRef(false);

  const tryBiometric = async () => {
    setError('');
    setBusy(true);
    try {
      await unlockBiometric();
    } catch (problem) {
      // A cancelled prompt is not an error worth shouting about — it usually
      // means "let me type it instead".
      const cancelled = problem?.name === 'NotAllowedError' || problem?.name === 'AbortError';
      if (!cancelled) setError(problem?.message ?? 'That did not work.');
      setShowPassphrase(true);
      setBusy(false);
    }
  };

  // Offer the fingerprint straight away: being made to tap a button before
  // being allowed to use the thing you registered is pure friction. Once only,
  // so a cancel does not immediately re-prompt.
  useEffect(() => {
    if (!biometric || attempted.current) return;
    attempted.current = true;
    tryBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometric]);

  const submit = async (event) => {
    event.preventDefault();
    if (!passphrase) return;
    setBusy(true);
    setError('');
    try {
      await unlock(passphrase);
    } catch {
      // Deliberately vague, and always the same: there is nothing useful to
      // tell somebody who is guessing.
      setError('That passphrase does not open this vault.');
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col justify-center px-6"
      style={{
        background: 'var(--color-canvas)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="anim-fade-slide-up mx-auto w-full max-w-sm">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: 'var(--color-pulse)' }}
        >
          <Lock size={20} style={{ color: '#ffffff' }} />
        </span>

        <h1 className="mt-5 font-display text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          HealthTrace is locked
        </h1>
        <p className="mt-2 font-sans text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Your readings, reports and profiles are encrypted on this device. Nothing can read them until you unlock.
        </p>

        {biometric && (
          <Button variant="secondary" full className="mt-6" disabled={busy} onClick={tryBiometric}>
            <Fingerprint size={17} className="mr-2 inline-block align-[-4px]" />
            Unlock with fingerprint
          </Button>
        )}

        {showPassphrase ? (
          <form onSubmit={submit} className="mt-4">
            <Field label="Passphrase" hint={error} htmlFor="unlock-passphrase">
              <Input
                id="unlock-passphrase"
                type="password"
                autoFocus={!biometric}
                autoComplete="current-password"
                value={passphrase}
                onChange={(event) => {
                  setPassphrase(event.target.value);
                  setError('');
                }}
              />
            </Field>
            {error && (
              <p className="mt-1.5 font-sans text-xs" style={{ color: 'var(--status-high)' }}>
                {error}
              </p>
            )}
            <Button full type="submit" className="mt-4" disabled={busy || !passphrase}>
              {busy ? 'Opening…' : 'Unlock'}
            </Button>
          </form>
        ) : (
          <button
            onClick={() => setShowPassphrase(true)}
            className="mt-4 w-full py-2 font-sans text-[13px] font-semibold"
            style={{ color: 'var(--color-pulse)' }}
          >
            Use passphrase instead
          </button>
        )}

        <p className="mt-8 font-sans text-xs leading-relaxed" style={{ color: 'var(--color-ash)' }}>
          There is no reset. No server holds a copy of this passphrase, and nobody — including whoever wrote this
          app — can recover your health history without it.
        </p>
      </div>
    </div>
  );
}
