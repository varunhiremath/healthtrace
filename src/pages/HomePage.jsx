import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, ChevronRight, HeartPulse, ShieldCheck } from 'lucide-react';
import { useHealthData } from '../hooks/useHealth.js';
import { buildInsights, headline, inRangeScore } from '../utils/insights.js';
import { relativeDate } from '../utils/dates.js';
import { getMarker } from '../data/markers.js';
import useSettingsStore from '../store/settingsStore.js';
import SnapshotRing from '../components/home/SnapshotRing.jsx';
import InsightCard from '../components/home/InsightCard.jsx';
import MarkerRow from '../components/health/MarkerRow.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ProfileSwitcher from '../components/profile/ProfileSwitcher.jsx';

export default function HomePage() {
  const navigate = useNavigate();
  const data = useHealthData();
  const units = useSettingsStore((s) => s.units);

  const insights = useMemo(
    () => buildInsights({ rows: data.rows, reports: data.reports, sex: data.sex }),
    [data.rows, data.reports, data.sex]
  );
  const verdict = headline(data.rows);
  const score = inRangeScore(data.rows);
  const lastReport = data.reports[0];

  if (data.loading) return <LoadingState />;

  if (!data.rows.length) {
    return (
      <div className="anim-fade-slide-up">
        <Header name={data.profile.name} profile={data.profile} profiles={data.profiles} />
        <EmptyState
          icon={HeartPulse}
          title="Let’s get your baseline in"
          body="Add a checkup report — you can paste the text straight from a lab PDF — or log a single vital like blood pressure or weight."
          action={
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/reports/new')}
                className="rounded-xl px-5 py-3 font-sans text-sm font-semibold"
                style={{ background: 'var(--color-pulse)', color: '#ffffff' }}
              >
                Add a report
              </button>
              <button
                onClick={() => navigate('/log')}
                className="rounded-xl px-5 py-3 font-sans text-sm font-semibold"
                style={{ background: 'var(--color-ivory)', color: 'var(--color-text-primary)' }}
              >
                Log a vital
              </button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="anim-fade-slide-up px-5 pb-6">
      <Header name={data.profile.name} profile={data.profile} profiles={data.profiles} />

      {/* Snapshot: the whole picture in one glance. */}
      <section
        className="mb-4 flex items-center gap-4 rounded-2xl px-4 py-4"
        style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
      >
        {score && <SnapshotRing inRange={score.inRange} total={score.total} />}
        <div className="min-w-0">
          <p
            className="font-display text-lg font-bold leading-tight"
            style={{
              color:
                verdict.tone === 'good'
                  ? 'var(--status-optimal)'
                  : verdict.tone === 'alert'
                    ? 'var(--status-high)'
                    : 'var(--status-borderline)',
            }}
          >
            {verdict.text}
          </p>
          <p className="mt-1 font-sans text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {lastReport
              ? `Last report ${relativeDate(lastReport.date).toLowerCase()}${lastReport.lab ? ` · ${lastReport.lab}` : ''}`
              : 'From the readings you have logged so far.'}
          </p>
          <p className="mt-2 flex items-center gap-1 font-sans text-[10px]" style={{ color: 'var(--color-ash)' }}>
            <ShieldCheck size={11} /> Stored only on this device
          </p>
        </div>
      </section>

      {/* Quick actions */}
      <div className="mb-5 flex gap-3">
        <QuickAction icon={Plus} label="Log a vital" sub="BP, sugar, weight" onClick={() => navigate('/log')} />
        <QuickAction icon={FileText} label="Add report" sub="Paste or type" onClick={() => navigate('/reports/new')} />
      </div>

      {/* What your numbers say */}
      {insights.length > 0 && (
        <section className="mb-6">
          <SectionTitle>What your numbers say</SectionTitle>
          <div className="flex flex-col gap-2.5">
            {insights.slice(0, 5).map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onClick={insight.markerKey ? () => navigate(`/markers/${insight.markerKey}`) : undefined}
              />
            ))}
          </div>
          <p className="mt-3 font-sans text-[11px] leading-relaxed" style={{ color: 'var(--color-ash)' }}>
            These notes compare your readings to general adult reference ranges. They are not medical
            advice — talk to your doctor about what they mean for you.
          </p>
        </section>
      )}

      {/* Pinned markers */}
      <section className="mb-6">
        <div className="mb-2.5 flex items-center justify-between">
          <SectionTitle noMargin>Pinned</SectionTitle>
          <button
            onClick={() => navigate('/trends')}
            className="flex items-center gap-0.5 font-sans text-xs font-semibold"
            style={{ color: 'var(--color-pulse)' }}
          >
            All markers <ChevronRight size={13} />
          </button>
        </div>

        {data.pinnedRows.length === 0 && data.pinnedMissing.length === 0 ? (
          <p className="font-sans text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Pin the markers you care about from any marker screen and they will show up here.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {data.pinnedRows.map((row) => (
              <MarkerRow
                key={row.markerKey}
                row={row}
                sex={data.sex}
                units={units}
                onClick={() => navigate(`/markers/${row.markerKey}`)}
              />
            ))}
            {data.pinnedMissing.map((key) => (
              <MissingMarker key={key} markerKey={key} onClick={() => navigate('/log')} />
            ))}
          </div>
        )}
      </section>

      {/* Needs a look */}
      {data.concerns.filter((row) => row.status !== 'optimal' && row.status !== 'unknown').length > 0 && (
        <section>
          <SectionTitle>Worth a look</SectionTitle>
          <div className="flex flex-col gap-2.5">
            {data.concerns
              .filter((row) => row.status !== 'optimal' && row.status !== 'unknown')
              .slice(0, 6)
              .map((row) => (
                <MarkerRow
                  key={row.markerKey}
                  row={row}
                  sex={data.sex}
                  units={units}
                  dense
                  showRange={false}
                  onClick={() => navigate(`/markers/${row.markerKey}`)}
                />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Header({ name, profile, profiles = [] }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  // With more than one person on file, the heading names WHOSE health this is —
  // reading the wrong family member's numbers is the failure that matters here.
  const household = profiles.length > 1;

  return (
    <div className="px-5 pb-4 pt-6" style={{ marginLeft: -20, marginRight: -20 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-sans text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {household ? 'Health record' : greeting}
            {!household && name ? `, ${name}` : ''}
          </p>
          <h1 className="truncate font-display text-2xl font-extrabold" style={{ color: 'var(--color-text-primary)' }}>
            {household ? name || 'Unnamed' : 'Your health'}
          </h1>
        </div>
        <div className="flex-shrink-0 pt-1">
          <ProfileSwitcher profile={profile} profiles={profiles} />
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children, noMargin }) {
  return (
    <h2
      className={`font-sans text-xs font-bold uppercase tracking-wide ${noMargin ? '' : 'mb-2.5'}`}
      style={{ color: 'var(--color-text-secondary)' }}
    >
      {children}
    </h2>
  );
}

function QuickAction({ icon: Icon, label, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 flex-col items-start gap-1.5 rounded-2xl px-3.5 py-3"
      style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full"
        style={{ background: 'var(--color-pulse-soft)' }}
      >
        <Icon size={15} style={{ color: 'var(--color-pulse)' }} />
      </span>
      <span className="font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {label}
      </span>
      <span className="font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
        {sub}
      </span>
    </button>
  );
}

function MissingMarker({ markerKey, onClick }) {
  const marker = getMarker(markerKey);
  if (!marker) return null;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left"
      style={{ background: 'var(--color-chalk)', border: '1px dashed var(--color-ivory)' }}
    >
      <div>
        <p className="font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {marker.name}
        </p>
        <p className="font-sans text-[11px]" style={{ color: 'var(--color-ash)' }}>
          No reading yet — tap to add one
        </p>
      </div>
      <Plus size={16} style={{ color: 'var(--color-pulse)' }} />
    </button>
  );
}

function LoadingState() {
  return (
    <div className="px-5 pt-6">
      <div className="h-6 w-32 rounded-lg" style={{ background: 'var(--color-ivory)' }} />
      <div className="mt-4 h-40 rounded-2xl" style={{ background: 'var(--color-ivory)' }} />
      <div className="mt-3 h-20 rounded-2xl" style={{ background: 'var(--color-ivory)' }} />
      <div className="mt-3 h-20 rounded-2xl" style={{ background: 'var(--color-ivory)' }} />
    </div>
  );
}
