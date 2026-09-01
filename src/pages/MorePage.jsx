import { useNavigate } from 'react-router-dom';
import {
  User, Users, Sliders, Download, Upload, ShieldCheck, ChevronRight, Trash2, FileSpreadsheet, HeartPulse,
} from 'lucide-react';
import { useHealthData, useProfiles } from '../hooks/useHealth.js';
import { db } from '../db/db.js';
import { buildBackup, backupFilename } from '../utils/backup.js';
import { toCsv } from '../utils/csv.js';
import { eraseAllData } from '../db/actions.js';
import useSettingsStore from '../store/settingsStore.js';
import useUIStore from '../store/uiStore.js';
import TopBar from '../components/layout/TopBar.jsx';

export default function MorePage() {
  const navigate = useNavigate();
  const data = useHealthData();
  const { profiles } = useProfiles();
  const settings = useSettingsStore();
  const showToast = useUIStore((s) => s.showToast);
  const confirm = useUIStore((s) => s.confirm);

  function download(filename, contents, type) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoke on the next tick so the download has definitely started.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // A backup is the household's whole archive, not just whoever is on screen —
  // exporting one person and later restoring it would quietly lose the rest.
  async function exportJson() {
    const [allProfiles, allReports, allReadings, allTargets] = await Promise.all([
      db.profile.toArray(),
      db.reports.toArray(),
      db.readings.toArray(),
      db.targets.toArray(),
    ]);
    const doc = buildBackup({
      profiles: allProfiles,
      reports: allReports,
      readings: allReadings,
      targets: allTargets,
      settings: { units: settings.units, pinnedByProfile: settings.pinnedByProfile, theme: settings.theme },
    });
    download(backupFilename(), JSON.stringify(doc, null, 2), 'application/json');
    showToast(
      `Backup downloaded — ${allProfiles.length} ${allProfiles.length === 1 ? 'person' : 'people'}, ${allReadings.length} readings`,
      { type: 'success' }
    );
  }

  // CSV is the one you hand a doctor, so it is one person: the one on screen.
  function exportCsv() {
    if (!data.readings.length) {
      showToast('Nothing to export for this person yet.');
      return;
    }
    const who = (data.profile.name || 'profile').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    download(
      backupFilename().replace('.json', `-${who}.csv`),
      toCsv(data.readings, { sex: data.sex }),
      'text/csv'
    );
    showToast(`CSV downloaded for ${data.profile.name || 'this profile'}`, { type: 'success' });
  }

  async function eraseEverything() {
    const [reports, readings] = await Promise.all([db.reports.count(), db.readings.count()]);
    const ok = await confirm({
      title: 'Erase everything?',
      message: `This deletes every profile in this household — ${profiles.length} ${profiles.length === 1 ? 'person' : 'people'}, ${reports} reports and ${readings} readings — from this device, permanently. Export a backup first if you might want any of it back.`,
      confirmLabel: 'Erase it all',
      danger: true,
    });
    if (!ok) return;
    await eraseAllData();
    showToast('All data erased');
    navigate('/home');
  }

  return (
    <div className="anim-fade-slide-up pb-6">
      <TopBar title="More" subtitle="Your profile, your settings, your data" />

      <div className="px-5 pt-4">
        <Group title="Household">
          <Row
            icon={Users}
            label="Family"
            sub={
              profiles.length > 1
                ? `${profiles.length} people · viewing ${data.profile.name || 'unnamed'}`
                : 'Add the rest of the family'
            }
            onClick={() => navigate('/profiles')}
          />
          <Row
            icon={User}
            label={data.profile.name ? `${data.profile.name}’s details` : 'Profile details'}
            sub="Date of birth, sex, height"
            onClick={() => navigate(`/profiles/${data.profileId}`)}
          />
          <Row icon={Sliders} label="Settings" sub="Theme, units, reminders" onClick={() => navigate('/settings')} />
        </Group>

        <Group title="Your data">
          <Row
            icon={Download}
            label="Export a backup"
            sub={`Everyone — ${profiles.length} ${profiles.length === 1 ? 'person' : 'people'}, all reports`}
            onClick={exportJson}
          />
          <Row
            icon={FileSpreadsheet}
            label="Export as CSV"
            sub={`${data.profile.name || 'This person'} only — for a spreadsheet or a doctor`}
            onClick={exportCsv}
          />
          <Row icon={Upload} label="Import" sub="Restore a backup or load a CSV" onClick={() => navigate('/import')} />
        </Group>

        <Group title="Danger zone">
          <Row icon={Trash2} label="Erase all data" sub="Every profile. Cannot be undone." danger onClick={eraseEverything} />
        </Group>

        <div className="mt-6 flex items-start gap-2.5 rounded-2xl px-4 py-3.5" style={{ background: 'var(--color-pulse-soft)' }}>
          <ShieldCheck size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-pulse)' }} />
          <div>
            <p className="font-sans text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Everything stays on this device
            </p>
            <p className="mt-1 font-sans text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              HealthTrace has no account, no server and no sync. Every profile in this household lives
              in this browser’s storage and is never uploaded anywhere. That also means none of it is
              backed up for you — export a copy now and then, especially before clearing browser data
              or changing phone.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-1 pb-4">
          <HeartPulse size={18} style={{ color: 'var(--color-ash)' }} />
          <p className="font-display text-sm font-bold" style={{ color: 'var(--color-text-secondary)' }}>
            HealthTrace
          </p>
          <p className="max-w-xs text-center font-sans text-[10px] leading-relaxed" style={{ color: 'var(--color-ash)' }}>
            Reference ranges are general adult values and vary by lab. HealthTrace records and charts
            your numbers — it does not diagnose, and it is not a substitute for your doctor.
          </p>
        </div>
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

function Row({ icon: Icon, label, sub, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left"
      style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
    >
      <span
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
        style={{ background: danger ? 'var(--status-high-soft)' : 'var(--color-ivory)' }}
      >
        <Icon size={16} style={{ color: danger ? 'var(--status-high)' : 'var(--color-pulse)' }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-sans text-sm font-semibold" style={{ color: danger ? 'var(--status-high)' : 'var(--color-text-primary)' }}>
          {label}
        </p>
        <p className="truncate font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
          {sub}
        </p>
      </div>
      <ChevronRight size={16} style={{ color: 'var(--color-ash)' }} />
    </button>
  );
}
