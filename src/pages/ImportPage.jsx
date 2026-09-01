import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, AlertTriangle, CheckCircle2, Users } from 'lucide-react';
import { validateBackup } from '../utils/backup.js';
import { fromCsv } from '../utils/csv.js';
import { importBackup } from '../db/actions.js';
import { db } from '../db/db.js';
import useUIStore from '../store/uiStore.js';
import { useProfiles, useProfile } from '../hooks/useHealth.js';
import TopBar from '../components/layout/TopBar.jsx';
import Avatar from '../components/profile/Avatar.jsx';
import { Button } from '../components/ui/Field.jsx';

// Import validates first and writes second. You see exactly what will land, and
// what was rejected and why, before anything touches your existing data.
export default function ImportPage() {
  const navigate = useNavigate();
  const showToast = useUIStore((s) => s.showToast);
  const confirm = useUIStore((s) => s.confirm);
  const { profiles } = useProfiles();
  const { profileId: activeProfileId } = useProfile();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  // Which person a single-person file lands on. Null means "restore the people
  // the file brings with it", which only a household backup can do.
  const [intoProfileId, setIntoProfileId] = useState(null);

  async function onFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();

    if (file.name.toLowerCase().endsWith('.csv')) {
      const { readings, skipped } = fromCsv(text);
      // A CSV has no notion of people, so it always lands on one.
      setPreview({
        kind: 'csv',
        ok: readings.length > 0,
        errors: readings.length ? [] : skipped.slice(0, 1),
        skipped,
        data: { profiles: [], reports: [], readings, targets: [] },
      });
      setIntoProfileId(activeProfileId);
    } else {
      const result = validateBackup(text);
      setPreview({ kind: 'json', ...result });
      // A household backup restores its own people; a single-person file has to
      // be filed under somebody.
      const bringsPeople = (result.data?.profiles?.length ?? 0) > 1;
      setIntoProfileId(bringsPeople ? null : activeProfileId);
    }
    // Let the same file be chosen again after a cancelled import.
    event.target.value = '';
  }

  async function run(mode) {
    if (!preview?.ok || busy) return;
    if (mode === 'replace') {
      const existing = await db.readings.count();
      const ok = await confirm({
        title: 'Replace everything?',
        message: intoProfileId
          ? `Every profile's readings will be deleted — all ${existing} of them — and replaced by this file's ${preview.data.readings.length}. This cannot be undone.`
          : `Your whole household will be deleted — all ${existing} readings across ${profiles.length} ${profiles.length === 1 ? 'profile' : 'profiles'} — and replaced by the people in this file. This cannot be undone.`,
        confirmLabel: 'Replace',
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const result = await importBackup(preview.data, { mode, intoProfileId });
      showToast(
        result.profiles
          ? `Imported ${result.profiles} ${result.profiles === 1 ? 'person' : 'people'} and ${result.readings} readings`
          : `Imported ${result.readings} readings`,
        { type: 'success' }
      );
      navigate('/home');
    } catch (error) {
      console.error(error);
      showToast('That import failed. Nothing was changed.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim-fade-slide-up pb-6">
      <TopBar
        title="Import"
        subtitle="A HealthTrace backup, or a CSV"
        back={
          <button onClick={() => navigate(-1)} aria-label="Back" className="mr-1 p-1">
            <ArrowLeft size={20} style={{ color: 'var(--color-text-primary)' }} />
          </button>
        }
      />

      <div className="px-5 pt-4">
        <label
          className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl px-5 py-8 text-center"
          style={{ background: 'var(--color-chalk)', border: '1px dashed var(--color-ivory)' }}
        >
          <Upload size={22} style={{ color: 'var(--color-pulse)' }} />
          <span className="font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Choose a file
          </span>
          <span className="font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            .json backup or .csv with date, marker and value columns
          </span>
          <input type="file" accept=".json,.csv,application/json,text/csv" className="hidden" onChange={onFile} />
        </label>

        {preview && (
          <div className="mt-5">
            {preview.ok ? (
              <div className="flex items-start gap-2.5 rounded-2xl px-4 py-3.5" style={{ background: 'var(--status-optimal-soft)' }}>
                <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--status-optimal)' }} />
                <div>
                  <p className="font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Ready to import
                  </p>
                  <p className="mt-0.5 font-sans text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {preview.data.profiles?.length > 0 && (
                      <>
                        {preview.data.profiles.length} {preview.data.profiles.length === 1 ? 'person' : 'people'},{' '}
                      </>
                    )}
                    {preview.data.reports.length} report{preview.data.reports.length === 1 ? '' : 's'} and{' '}
                    {preview.data.readings.length} reading{preview.data.readings.length === 1 ? '' : 's'}.
                    {preview.legacy && ' This backup predates family profiles.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 rounded-2xl px-4 py-3.5" style={{ background: 'var(--status-high-soft)' }}>
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--status-high)' }} />
                <div>
                  <p className="font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Can’t import this file
                  </p>
                  {preview.errors.map((error) => (
                    <p key={error} className="mt-0.5 font-sans text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {error}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {preview.skipped?.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer font-sans text-xs font-semibold" style={{ color: 'var(--status-borderline)' }}>
                  {preview.skipped.length} row{preview.skipped.length === 1 ? '' : 's'} will be skipped
                </summary>
                <div className="mt-2 flex flex-col gap-1">
                  {preview.skipped.slice(0, 20).map((line, index) => (
                    <p key={index} className="font-mono text-[10px]" style={{ color: 'var(--color-ash)' }}>
                      {line}
                    </p>
                  ))}
                </div>
              </details>
            )}

            {/* Where it lands. A household backup can restore its own people;
                anything else has to be filed under one of yours. */}
            {preview.ok && profiles.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 font-sans text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                  Import into
                </p>
                <div className="flex flex-col gap-1.5">
                  {(preview.data.profiles?.length ?? 0) > 1 && (
                    <button
                      onClick={() => setIntoProfileId(null)}
                      className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-left"
                      style={{
                        background: intoProfileId === null ? 'var(--color-pulse-soft)' : 'var(--color-ivory)',
                        border: `1px solid ${intoProfileId === null ? 'var(--color-pulse)' : 'transparent'}`,
                      }}
                    >
                      <span
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                        style={{ background: 'var(--color-pulse)' }}
                      >
                        <Users size={15} color="#ffffff" />
                      </span>
                      <div>
                        <p className="font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                          The people in this file
                        </p>
                        <p className="font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                          Adds {preview.data.profiles.length} new profiles alongside yours
                        </p>
                      </div>
                    </button>
                  )}
                  {profiles.map((person) => (
                    <button
                      key={person.id}
                      onClick={() => setIntoProfileId(person.id)}
                      className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-left"
                      style={{
                        background: intoProfileId === person.id ? 'var(--color-pulse-soft)' : 'var(--color-ivory)',
                        border: `1px solid ${intoProfileId === person.id ? 'var(--color-pulse)' : 'transparent'}`,
                      }}
                    >
                      <Avatar profile={person} size={32} />
                      <div className="min-w-0">
                        <p className="truncate font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                          {person.name || 'Unnamed'}
                        </p>
                        <p className="font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                          {person.relation || 'Everything in the file goes to this person'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {preview.ok && (
              <div className="mt-5 flex flex-col gap-2.5">
                <Button full disabled={busy} onClick={() => run('merge')}>
                  Add to what I already have
                </Button>
                <Button full variant="danger" disabled={busy} onClick={() => run('replace')}>
                  Replace everything with this file
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
