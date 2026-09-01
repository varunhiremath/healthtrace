import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, Check, Users } from 'lucide-react';
import { useProfiles, useProfile } from '../hooks/useHealth.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import useSettingsStore from '../store/settingsStore.js';
import { ageAt, relativeDate } from '../utils/dates.js';
import TopBar from '../components/layout/TopBar.jsx';
import Avatar from '../components/profile/Avatar.jsx';

// The household. Everyone the app is keeping records for, what each of them
// has on file, and who is currently being shown.
export default function ProfilesPage() {
  const navigate = useNavigate();
  const { profiles, loaded } = useProfiles();
  const { profileId } = useProfile();
  const setActiveProfile = useSettingsStore((s) => s.setActiveProfile);

  // Counts per person, so the list says how much is actually recorded for each.
  const counts = useLiveQuery(async () => {
    const out = {};
    for (const person of await db.profile.toArray()) {
      const [reports, readings] = await Promise.all([
        db.reports.where('profileId').equals(person.id).count(),
        db.readings.where('profileId').equals(person.id).count(),
      ]);
      const latest = await db.reports.where('profileId').equals(person.id).reverse().sortBy('date');
      out[person.id] = { reports, readings, lastDate: latest[0]?.date ?? null };
    }
    return out;
  }, [profiles.length], undefined);

  return (
    <div className="anim-fade-slide-up pb-6">
      <TopBar
        title="Family"
        subtitle={loaded ? `${profiles.length} ${profiles.length === 1 ? 'person' : 'people'}` : ''}
        right={
          <button
            onClick={() => navigate('/profiles/new')}
            aria-label="Add a family member"
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: 'var(--color-pulse)' }}
          >
            <Plus size={18} color="#ffffff" />
          </button>
        }
      />

      <div className="px-5 pt-4">
        <div className="flex flex-col gap-2.5">
          {profiles.map((person) => {
            const stats = counts?.[person.id];
            const active = person.id === profileId;
            const age = person.dob ? ageAt(person.dob) : null;

            return (
              <div
                key={person.id}
                className="rounded-2xl px-4 py-3.5"
                style={{
                  background: 'var(--color-chalk)',
                  border: `1px solid ${active ? 'var(--color-pulse)' : 'var(--color-ivory)'}`,
                }}
              >
                <div className="flex items-center gap-3">
                  <Avatar profile={person} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {person.name || 'Unnamed'}
                      </p>
                      {active && (
                        <span
                          className="flex-shrink-0 rounded-full px-1.5 py-0.5 font-sans text-[9px] font-bold uppercase"
                          style={{ background: 'var(--color-pulse-soft)', color: 'var(--color-pulse)' }}
                        >
                          Viewing
                        </span>
                      )}
                    </div>
                    <p className="truncate font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {[person.relation, age != null ? `${age} years` : null, person.sex]
                        .filter(Boolean)
                        .join(' · ') || 'No details yet'}
                    </p>
                    <p className="mt-0.5 font-sans text-[11px]" style={{ color: 'var(--color-ash)' }}>
                      {stats
                        ? `${stats.reports} report${stats.reports === 1 ? '' : 's'} · ${stats.readings} reading${stats.readings === 1 ? '' : 's'}${
                            stats.lastDate ? ` · last ${relativeDate(stats.lastDate).toLowerCase()}` : ''
                          }`
                        : '…'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  {!active && (
                    <button
                      onClick={() => setActiveProfile(person.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-sans text-xs font-semibold"
                      style={{ background: 'var(--color-pulse)', color: '#ffffff' }}
                    >
                      <Check size={13} /> View
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/profiles/${person.id}`)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 font-sans text-xs font-semibold"
                    style={{ background: 'var(--color-ivory)', color: 'var(--color-text-primary)' }}
                  >
                    Edit <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => navigate('/profiles/new')}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-sans text-sm font-semibold"
          style={{ background: 'transparent', border: '1px dashed var(--color-ivory)', color: 'var(--color-pulse)' }}
        >
          <Plus size={15} /> Add a family member
        </button>

        <div className="mt-5 flex items-start gap-2.5 rounded-2xl px-4 py-3.5" style={{ background: 'var(--color-pulse-soft)' }}>
          <Users size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-pulse)' }} />
          <p className="font-sans text-xs leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
            Everyone’s records are kept separately — reports, readings, targets and pinned markers all
            belong to one person. Reference ranges follow each person’s own age and sex. All of it stays
            on this device; a backup export includes the whole household in one file.
          </p>
        </div>
      </div>
    </div>
  );
}
