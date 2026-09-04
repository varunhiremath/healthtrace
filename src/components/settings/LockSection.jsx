import { useState } from 'react';
import { Lock, LockOpen, Fingerprint, KeyRound, Timer, ShieldOff, AlertTriangle } from 'lucide-react';
import { Field, Input, Select, Button } from '../ui/Field.jsx';
import Modal from '../ui/Modal.jsx';
import useLockStore from '../../store/lockStore.js';
import useSettingsStore from '../../store/settingsStore.js';
import useUIStore from '../../store/uiStore.js';
import { createVault, removeVault, changePassphrase, enableBiometric, disableBiometric } from '../../db/vault.js';
import { passphraseStrength } from '../../utils/crypto.js';

const AUTO_LOCK_CHOICES = [
  { value: 0, label: 'The moment I switch away' },
  { value: 1, label: 'After 1 minute' },
  { value: 2, label: 'After 2 minutes' },
  { value: 5, label: 'After 5 minutes' },
  { value: 15, label: 'After 15 minutes' },
  { value: -1, label: 'Only when I close the app' },
];

export default function LockSection() {
  const { status, biometric, biometricPossible, refresh, lockNow } = useLockStore();
  const autoLockMinutes = useSettingsStore((s) => s.autoLockMinutes);
  const setAutoLockMinutes = useSettingsStore((s) => s.setAutoLockMinutes);
  const showToast = useUIStore((s) => s.showToast);
  const confirm = useUIStore((s) => s.confirm);

  const [setupOpen, setSetupOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const locked = status !== 'off';

  const toggleBiometric = async () => {
    try {
      if (biometric) {
        const sure = await confirm({
          title: 'Stop using your fingerprint?',
          message: 'You will unlock with your passphrase from now on. Nothing is decrypted or re-encrypted.',
          confirmLabel: 'Remove it',
        });
        if (!sure) return;
        await disableBiometric();
        showToast('Fingerprint unlock removed.');
      } else {
        await enableBiometric();
        showToast('Fingerprint unlock is on.', { type: 'success' });
      }
      await refresh();
    } catch (error) {
      showToast(error.message ?? 'That did not work.', { type: 'error', duration: 6000 });
    }
  };

  return (
    <section className="mb-5">
      <h2
        className="mb-2 font-sans text-xs font-bold uppercase tracking-wide"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        Lock
      </h2>

      {!locked ? (
        <div className="overflow-hidden rounded-2xl" style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}>
          <Row
            icon={Lock}
            title="Lock this app"
            body="Encrypt your readings with a passphrase, and unlock with your fingerprint."
            onClick={() => setSetupOpen(true)}
          />
          <p
            className="px-4 pb-4 font-sans text-xs leading-relaxed"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Right now your health history sits in this browser's storage as plain text. Anything that can reach that
            storage can read it.
          </p>
        </div>
      ) : (
        <>
          <div className="divide-y overflow-hidden rounded-2xl" style={{ background: 'var(--color-chalk)', borderColor: 'var(--color-ivory)' }}>
            <Row icon={LockOpen} title="Lock now" body="Shuts it immediately and forgets the key." onClick={lockNow} />

            <label className="flex cursor-pointer items-center gap-3 px-4 py-3.5">
              <Fingerprint size={16} style={{ color: 'var(--color-ash)' }} />
              <span className="flex-1">
                <span className="block font-sans text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  Unlock with fingerprint
                </span>
                <span className="block font-sans text-xs leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
                  {biometricPossible
                    ? 'Holds a second key in your phone’s secure chip. Stronger than the passphrase, not a shortcut past it.'
                    : 'Not available in this browser or on this device.'}
                </span>
              </span>
              <input
                type="checkbox"
                className="sr-only"
                checked={biometric}
                disabled={!biometricPossible}
                onChange={toggleBiometric}
              />
              <Switch on={biometric} dim={!biometricPossible} />
            </label>

            <div className="px-4 py-3.5">
              <Field label="Lock again when I leave" htmlFor="auto-lock">
                <Select
                  id="auto-lock"
                  value={autoLockMinutes}
                  onChange={(event) => setAutoLockMinutes(Number(event.target.value))}
                >
                  {AUTO_LOCK_CHOICES.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <p
                className="mt-2 flex items-start gap-1.5 font-sans text-[11.5px] leading-snug"
                style={{ color: 'var(--color-ash)' }}
              >
                <Timer size={13} className="mt-0.5 flex-shrink-0" />
                Entering a report often means switching to a photo or a PDF and back, so locking instantly is usually
                more annoying than it is useful.
              </p>
            </div>

            <Row
              icon={KeyRound}
              title="Change passphrase"
              body="Re-wraps the key. None of your readings are rewritten."
              onClick={() => setChangeOpen(true)}
            />
            <Row
              icon={ShieldOff}
              title="Remove the lock"
              body="Decrypts everything back to plain storage."
              danger
              onClick={() => setRemoveOpen(true)}
            />
          </div>

          <p className="mt-2 font-sans text-[11.5px] leading-relaxed" style={{ color: 'var(--color-ash)' }}>
            <strong>What is and is not hidden.</strong> Every value, note, profile name, lab, doctor and attached
            report is encrypted. The structure is not: which markers you track, and on what dates, stays readable so
            the app can still find them. If the mere fact that you track a particular marker would be sensitive, that
            is the limit of what this hides.
          </p>
        </>
      )}

      <SetupModal open={setupOpen} onClose={() => setSetupOpen(false)} />
      <ChangeModal open={changeOpen} onClose={() => setChangeOpen(false)} />
      <RemoveModal open={removeOpen} onClose={() => setRemoveOpen(false)} />
    </section>
  );
}

function Switch({ on, dim }) {
  return (
    <span
      aria-hidden
      className="relative h-6 w-10 flex-shrink-0 rounded-full"
      style={{
        background: on ? 'var(--color-pulse)' : 'var(--color-ivory)',
        opacity: dim ? 0.4 : 1,
        transition: 'background var(--dur-standard)',
      }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full"
        style={{
          background: '#ffffff',
          left: on ? '18px' : '2px',
          transition: 'left var(--dur-standard) var(--ease-out)',
          boxShadow: '0 1px 3px rgba(15,23,42,0.25)',
        }}
      />
    </span>
  );
}

function Row({ icon: Icon, title, body, onClick, danger }) {
  const colour = danger ? 'var(--status-high)' : 'var(--color-text-primary)';
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
      <Icon size={16} style={{ color: danger ? 'var(--status-high)' : 'var(--color-ash)' }} />
      <span className="flex-1">
        <span className="block font-sans text-sm font-medium" style={{ color: colour }}>
          {title}
        </span>
        <span className="block font-sans text-xs leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
          {body}
        </span>
      </span>
    </button>
  );
}

const STRENGTH_COPY = {
  empty: '',
  weak: 'Short enough to be guessed by somebody who copies this database. Length is the only thing that really helps — try a few unrelated words.',
  fair: 'Better. A couple more words would put it out of reach of a determined attempt.',
  good: 'Good. This would take a serious effort to break.',
  strong: 'Strong.',
};

const STRENGTH_COLOUR = {
  empty: 'var(--color-ash)',
  weak: 'var(--status-high)',
  fair: 'var(--color-text-secondary)',
  good: 'var(--status-optimal)',
  strong: 'var(--status-optimal)',
};

function SetupModal({ open, onClose }) {
  const refresh = useLockStore((s) => s.refresh);
  const biometricPossible = useLockStore((s) => s.biometricPossible);
  const showToast = useUIStore((s) => s.showToast);

  const [passphrase, setPassphrase] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const strength = passphraseStrength(passphrase);
  const ready = passphrase.length >= 8 && passphrase === confirmText && understood;

  const reset = () => {
    setPassphrase('');
    setConfirmText('');
    setUnderstood(false);
    setError('');
    setBusy(false);
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await createVault(passphrase);
      await refresh();
      // Offered, never forced: a fingerprint that fails to register must not
      // leave the vault half set up.
      if (biometricPossible) {
        try {
          await enableBiometric();
          showToast('Locked. Fingerprint unlock is on.', { type: 'success' });
        } catch {
          showToast('Locked. Fingerprint unlock could not be set up — try again from Settings.', { duration: 6000 });
        }
        await refresh();
      } else {
        showToast('Locked. Your health history is encrypted on this device.', { type: 'success' });
      }
      reset();
      onClose();
    } catch (problem) {
      setError(problem.message ?? 'That did not work.');
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Lock this app"
      subtitle="Encrypts every reading, note and report"
    >
      <div className="space-y-4 pb-2">
        <div
          className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
          style={{ background: 'var(--status-high-soft)' }}
        >
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--status-high)' }} />
          <p className="font-sans text-[12.5px] leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
            <strong>There is no way to reset this.</strong> No server holds a copy. If you forget the passphrase,
            every reading and report you have entered is gone for good. Export a backup first if you want a way back.
          </p>
        </div>

        <Field
          label="Passphrase"
          hint="A few unrelated words beats a short scramble of symbols. Nothing is rate-limited here, so length is what protects you."
          htmlFor="new-passphrase"
        >
          <Input
            id="new-passphrase"
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(event) => {
              setPassphrase(event.target.value);
              setError('');
            }}
          />
        </Field>

        {passphrase && (
          <p className="font-sans text-xs leading-snug" style={{ color: STRENGTH_COLOUR[strength.verdict] }}>
            {STRENGTH_COPY[strength.verdict]}
          </p>
        )}

        <Field label="Type it again" htmlFor="confirm-passphrase">
          <Input
            id="confirm-passphrase"
            type="password"
            autoComplete="new-password"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
          />
        </Field>
        {confirmText && passphrase !== confirmText && (
          <p className="font-sans text-xs" style={{ color: 'var(--status-high)' }}>
            These two do not match.
          </p>
        )}

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0"
            style={{ accentColor: 'var(--color-pulse)' }}
          />
          <span className="font-sans text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            I understand that forgetting this passphrase means losing my health history, permanently.
          </span>
        </label>

        {error && (
          <p className="font-sans text-xs" style={{ color: 'var(--status-high)' }}>
            {error}
          </p>
        )}

        <Button full disabled={!ready || busy} onClick={submit}>
          {busy ? 'Encrypting…' : 'Lock it'}
        </Button>
      </div>
    </Modal>
  );
}

function ChangeModal({ open, onClose }) {
  const showToast = useUIStore((s) => s.showToast);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const strength = passphraseStrength(next);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await changePassphrase(current, next);
      showToast('Passphrase changed.', { type: 'success' });
      setCurrent('');
      setNext('');
      setBusy(false);
      onClose();
    } catch (problem) {
      setError(
        problem?.message?.includes('at least') ? problem.message : 'That current passphrase does not open this vault.'
      );
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Change passphrase">
      <div className="space-y-4 pb-2">
        <Field label="Current passphrase" htmlFor="current-passphrase">
          <Input
            id="current-passphrase"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => {
              setCurrent(event.target.value);
              setError('');
            }}
          />
        </Field>
        <Field label="New passphrase" htmlFor="next-passphrase">
          <Input
            id="next-passphrase"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </Field>
        {next && (
          <p className="font-sans text-xs leading-snug" style={{ color: STRENGTH_COLOUR[strength.verdict] }}>
            {STRENGTH_COPY[strength.verdict]}
          </p>
        )}
        {error && (
          <p className="font-sans text-xs" style={{ color: 'var(--status-high)' }}>
            {error}
          </p>
        )}
        <p className="font-sans text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Only the wrapping around the key changes. Not one stored reading is rewritten, and a registered fingerprint
          keeps working.
        </p>
        <Button full disabled={busy || !current || next.length < 8} onClick={submit}>
          Change it
        </Button>
      </div>
    </Modal>
  );
}

function RemoveModal({ open, onClose }) {
  const refresh = useLockStore((s) => s.refresh);
  const showToast = useUIStore((s) => s.showToast);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await removeVault(passphrase);
      await refresh();
      showToast('Lock removed. Your data is stored in the clear again.');
      setPassphrase('');
      setBusy(false);
      onClose();
    } catch {
      setError('That passphrase does not open this vault.');
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Remove the lock?">
      <div className="space-y-4 pb-2">
        <p className="font-sans text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Everything is decrypted back into plain browser storage, where anything with access to this device can read
          it.
        </p>
        <Field label="Passphrase" htmlFor="remove-passphrase">
          <Input
            id="remove-passphrase"
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(event) => {
              setPassphrase(event.target.value);
              setError('');
            }}
          />
        </Field>
        {error && (
          <p className="font-sans text-xs" style={{ color: 'var(--status-high)' }}>
            {error}
          </p>
        )}
        <Button variant="danger" full disabled={busy || !passphrase} onClick={submit}>
          {busy ? 'Decrypting…' : 'Remove the lock'}
        </Button>
      </div>
    </Modal>
  );
}
