import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Info, Trash2, AlertTriangle } from 'lucide-react';
import { db } from '../db/db.js';
import { addProfile, updateProfile, deleteProfile } from '../db/actions.js';
import { useProfiles } from '../hooks/useHealth.js';
import { ageAt, todayKey } from '../utils/dates.js';
import { cmToFtIn, ftInToCm } from '../utils/units.js';
import useSettingsStore from '../store/settingsStore.js';
import useUIStore from '../store/uiStore.js';
import TopBar from '../components/layout/TopBar.jsx';
import Avatar from '../components/profile/Avatar.jsx';
import { Field, Input, Select, Button } from '../components/ui/Field.jsx';

const BLANK = { name: '', relation: '', dob: '', sex: '', heightCm: '' };

// One person's details — and the one screen that can remove them from the app.
// Handles both adding and editing, so there is no second, subtly different form.
export default function ProfilePage() {
  const { id } = useParams();
  const creating = id === 'new' || id === undefined;
  const profileId = creating ? null : Number(id);

  const navigate = useNavigate();
  const { profiles } = useProfiles();
  const setActiveProfile = useSettingsStore((s) => s.setActiveProfile);
  const forgetProfile = useSettingsStore((s) => s.forgetProfile);
  const showToast = useUIStore((s) => s.showToast);
  const confirm = useUIStore((s) => s.confirm);

  const [form, setForm] = useState(creating ? BLANK : null);
  const [heightMode, setHeightMode] = useState('cm');
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    if (creating || form) return;
    let cancelled = false;
    db.profile.get(profileId).then((row) => {
      if (cancelled || !row) return;
      setForm({
        name: row.name ?? '',
        relation: row.relation ?? '',
        dob: row.dob ?? '',
        sex: row.sex ?? '',
        heightCm: row.heightCm ?? '',
      });
    });
    return () => {
      cancelled = true;
    };
  }, [creating, form, profileId]);

  // How much would be lost, so the delete confirmation can say it out loud.
  useEffect(() => {
    if (creating) return;
    let cancelled = false;
    Promise.all([
      db.reports.where('profileId').equals(profileId).count(),
      db.readings.where('profileId').equals(profileId).count(),
    ]).then(([reports, readings]) => {
      if (!cancelled) setCounts({ reports, readings });
    });
    return () => {
      cancelled = true;
    };
  }, [creating, profileId]);

  if (!form) return null;

  const age = form.dob ? ageAt(form.dob) : null;
  const ftIn = form.heightCm ? cmToFtIn(Number(form.heightCm)) : { feet: '', inches: '' };
  const isLast = profiles.length <= 1;

  async function save() {
    if (saving) return;
    setSaving(true);
    const patch = {
      name: form.name.trim(),
      relation: form.relation.trim(),
      dob: form.dob,
      sex: form.sex || null,
      heightCm: form.heightCm === '' ? null : Number(form.heightCm),
    };
    try {
      if (creating) {
        const newId = await addProfile(patch);
        setActiveProfile(newId);
        showToast(`${patch.name || 'Profile'} added — now viewing their records`, { type: 'success' });
        navigate('/home', { replace: true });
      } else {
        await updateProfile(profileId, patch);
        showToast('Profile saved', { type: 'success' });
        navigate(-1);
      }
    } catch (error) {
      console.error(error);
      showToast('Could not save that profile.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${form.name || 'this profile'}?`,
      message: counts
        ? `This permanently deletes their ${counts.reports} report${counts.reports === 1 ? '' : 's'} and ${counts.readings} reading${counts.readings === 1 ? '' : 's'}, along with any targets and attachments. Nobody else's records are touched. This cannot be undone.`
        : 'This permanently deletes everything recorded for this person. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteProfile(profileId);
      forgetProfile(profileId);
      showToast('Profile deleted');
      navigate('/profiles', { replace: true });
    } catch (error) {
      showToast(error.message ?? 'Could not delete that profile.', { type: 'error' });
    }
  }

  return (
    <div className="anim-fade-slide-up pb-6">
      <TopBar
        title={creating ? 'Add a family member' : form.name || 'Profile'}
        subtitle={creating ? 'Their records are kept separate from everyone else’s' : form.relation || undefined}
        back={
          <button onClick={() => navigate(-1)} aria-label="Back" className="mr-1 p-1">
            <ArrowLeft size={20} style={{ color: 'var(--color-text-primary)' }} />
          </button>
        }
        right={
          !creating && !isLast ? (
            <button onClick={remove} aria-label="Delete profile" className="p-2">
              <Trash2 size={17} style={{ color: 'var(--status-high)' }} />
            </button>
          ) : null
        }
      />

      <div className="px-5 pt-4">
        {!creating && (
          <div className="mb-5 flex items-center gap-3">
            <Avatar profile={{ name: form.name, color: profiles.find((p) => p.id === profileId)?.color }} size={52} />
            <div>
              <p className="font-display text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {form.name || 'Unnamed'}
              </p>
              <p className="font-sans text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {counts ? `${counts.reports} reports · ${counts.readings} readings` : '…'}
              </p>
            </div>
          </div>
        )}

        <div className="mb-5 flex items-start gap-2.5 rounded-2xl px-4 py-3.5" style={{ background: 'var(--color-pulse-soft)' }}>
          <Info size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-pulse)' }} />
          <p className="font-sans text-xs leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
            Date of birth and sex select this person’s reference ranges — haemoglobin, creatinine,
            ferritin and HDL genuinely differ — and eGFR needs their age. Height is used for BMI.
            Leave anything blank and HealthTrace skips what depends on it rather than guessing.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Field label="Name" hint="Shown on their Home screen and used to match pasted reports." htmlFor="profile-name">
            <Input
              id="profile-name"
              autoFocus={creating}
              value={form.name}
              placeholder="e.g. Morgan"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>

          <Field label="Relationship" hint="Optional — just a label, like “Mum” or “Son”." htmlFor="profile-relation">
            <Input
              id="profile-relation"
              value={form.relation}
              placeholder="e.g. Me, Wife, Son"
              onChange={(e) => setForm({ ...form, relation: e.target.value })}
            />
          </Field>

          <Field
            label="Date of birth"
            hint={age != null ? `${age} years old — used for eGFR.` : 'Needed for eGFR.'}
            htmlFor="profile-dob"
          >
            <Input
              id="profile-dob"
              type="date"
              value={form.dob}
              max={todayKey()}
              onChange={(e) => setForm({ ...form, dob: e.target.value })}
            />
          </Field>

          <Field label="Sex at birth" hint="Selects the reference ranges that differ by sex." htmlFor="profile-sex">
            <Select id="profile-sex" value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          </Field>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-sans text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                Height
              </span>
              <div className="flex gap-1">
                {['cm', 'ftin'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setHeightMode(mode)}
                    className="rounded-full px-2.5 py-1 font-sans text-[11px] font-semibold"
                    style={{
                      background: heightMode === mode ? 'var(--color-pulse)' : 'var(--color-ivory)',
                      color: heightMode === mode ? '#ffffff' : 'var(--color-text-secondary)',
                    }}
                  >
                    {mode === 'cm' ? 'cm' : 'ft / in'}
                  </button>
                ))}
              </div>
            </div>

            {heightMode === 'cm' ? (
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                value={form.heightCm}
                placeholder="175"
                aria-label="Height in centimetres"
                onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
              />
            ) : (
              <div className="flex gap-3">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={ftIn.feet}
                  placeholder="ft"
                  aria-label="Height in feet"
                  onChange={(e) =>
                    setForm({ ...form, heightCm: ftInToCm(Number(e.target.value || 0), ftIn.inches || 0).toFixed(1) })
                  }
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  value={ftIn.inches}
                  placeholder="in"
                  aria-label="Height in inches"
                  onChange={(e) =>
                    setForm({ ...form, heightCm: ftInToCm(ftIn.feet || 0, Number(e.target.value || 0)).toFixed(1) })
                  }
                />
              </div>
            )}
            <span className="mt-1 block font-sans text-[11px]" style={{ color: 'var(--color-ash)' }}>
              Used for BMI. Stored in centimetres.
            </span>
          </div>
        </div>

        <Button full onClick={save} disabled={saving} className="mt-6">
          {creating ? 'Add to the family' : 'Save profile'}
        </Button>

        {!creating && isLast && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl px-4 py-3" style={{ background: 'var(--color-ivory)' }}>
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-ash)' }} />
            <p className="font-sans text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              This is the only profile, so it cannot be deleted. Add someone else first, or use
              More → Erase all data to start over.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
