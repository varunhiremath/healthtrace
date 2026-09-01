import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, Check, Users } from 'lucide-react';
import useSettingsStore from '../../store/settingsStore.js';
import Modal from '../ui/Modal.jsx';
import Avatar from './Avatar.jsx';

// Whose health you are looking at, and how to change it.
//
// The switcher is always visible on Home rather than buried in settings,
// because the one thing that must never happen in a household app is reading
// one person's numbers believing they are another's.
export default function ProfileSwitcher({ profile, profiles, compact = false }) {
  const navigate = useNavigate();
  const setActiveProfile = useSettingsStore((s) => s.setActiveProfile);
  const [open, setOpen] = useState(false);

  const solo = profiles.length <= 1;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5"
        style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
        aria-label={`Viewing ${profile?.name || 'this profile'}. Switch person`}
      >
        <Avatar profile={profile} size={compact ? 26 : 30} />
        <span
          className="max-w-[7rem] truncate font-sans text-xs font-semibold"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {profile?.name || 'Set up profile'}
        </span>
        <ChevronDown size={13} style={{ color: 'var(--color-ash)' }} />
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={solo ? 'Your profile' : 'Whose health?'}
        subtitle={solo ? 'Add the rest of the family here' : `${profiles.length} people in this household`}
      >
        <div className="flex flex-col gap-1.5">
          {profiles.map((person) => {
            const active = person.id === profile?.id;
            return (
              <button
                key={person.id}
                onClick={() => {
                  setActiveProfile(person.id);
                  setOpen(false);
                }}
                className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-left"
                style={{
                  background: active ? 'var(--color-pulse-soft)' : 'var(--color-ivory)',
                  border: `1px solid ${active ? 'var(--color-pulse)' : 'transparent'}`,
                }}
              >
                <Avatar profile={person} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {person.name || 'Unnamed'}
                  </p>
                  <p className="truncate font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {person.relation || (active ? 'Currently viewing' : 'Tap to view')}
                  </p>
                </div>
                {active && <Check size={16} style={{ color: 'var(--color-pulse)' }} />}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-col gap-2 pb-2">
          <button
            onClick={() => {
              setOpen(false);
              navigate('/profiles/new');
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-sans text-sm font-semibold"
            style={{ background: 'var(--color-pulse)', color: '#ffffff' }}
          >
            <Plus size={15} /> Add a family member
          </button>
          <button
            onClick={() => {
              setOpen(false);
              navigate('/profiles');
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-sans text-sm font-semibold"
            style={{ background: 'var(--color-ivory)', color: 'var(--color-text-primary)' }}
          >
            <Users size={15} /> Manage profiles
          </button>
        </div>
      </Modal>
    </>
  );
}
