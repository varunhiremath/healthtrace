import { useNavigate } from 'react-router-dom';
import { Plus, FileText, ChevronRight, FlaskConical } from 'lucide-react';
import { useHealthData } from '../hooks/useHealth.js';
import { formatDate, relativeDate } from '../utils/dates.js';
import { classify, effectiveMarker } from '../utils/ranges.js';
import { getMarker } from '../data/markers.js';
import TopBar from '../components/layout/TopBar.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';

// Every checkup you have logged, newest first. A report is the unit a doctor
// thinks in, so it is the unit the app stores and shows.
export default function ReportsPage() {
  const navigate = useNavigate();
  const data = useHealthData();

  const countsByReport = {};
  for (const reading of data.readings) {
    if (reading.reportId == null) continue;
    const bucket = (countsByReport[reading.reportId] ??= { total: 0, flagged: 0 });
    bucket.total += 1;
    const base = getMarker(reading.markerKey);
    if (!base) continue;
    const status = classify(reading.value, effectiveMarker(base, data.targets), data.sex);
    if (status !== 'optimal' && status !== 'unknown') bucket.flagged += 1;
  }

  const loose = data.readings.filter((reading) => reading.reportId == null);

  return (
    <div className="anim-fade-slide-up pb-6">
      <TopBar
        title="Reports"
        subtitle={data.reports.length ? `${data.reports.length} on file` : 'Your checkups and blood work'}
        right={
          <button
            onClick={() => navigate('/reports/new')}
            aria-label="New report"
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: 'var(--color-pulse)' }}
          >
            <Plus size={18} color="#ffffff" />
          </button>
        }
      />

      <div className="px-5 pt-4">
        {!data.loading && data.reports.length === 0 && (
          <EmptyState
            icon={FileText}
            title="No reports yet"
            body="Add your past checkups and blood work. Paste the text from a lab PDF and HealthTrace will read the markers out of it."
            action={
              <button
                onClick={() => navigate('/reports/new')}
                className="rounded-xl px-5 py-3 font-sans text-sm font-semibold"
                style={{ background: 'var(--color-pulse)', color: '#ffffff' }}
              >
                Add your first report
              </button>
            }
          />
        )}

        <div className="flex flex-col gap-2.5">
          {data.reports.map((report) => {
            const counts = countsByReport[report.id] ?? { total: 0, flagged: 0 };
            return (
              <button
                key={report.id}
                onClick={() => navigate(`/reports/${report.id}`)}
                className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left"
                style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
              >
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background: counts.flagged ? 'var(--status-borderline-soft)' : 'var(--status-optimal-soft)',
                  }}
                >
                  <FlaskConical
                    size={17}
                    style={{ color: counts.flagged ? 'var(--status-borderline)' : 'var(--status-optimal)' }}
                  />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {report.title || 'Health report'}
                  </p>
                  <p className="truncate font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {formatDate(report.date)} · {relativeDate(report.date)}
                    {report.lab ? ` · ${report.lab}` : ''}
                  </p>
                  <p className="mt-0.5 font-sans text-[11px]" style={{ color: 'var(--color-ash)' }}>
                    {counts.total} marker{counts.total === 1 ? '' : 's'}
                    {counts.flagged > 0 && (
                      <span style={{ color: 'var(--status-borderline)' }}> · {counts.flagged} outside range</span>
                    )}
                  </p>
                </div>

                <ChevronRight size={16} style={{ color: 'var(--color-ash)' }} />
              </button>
            );
          })}
        </div>

        {loose.length > 0 && (
          <p className="mt-5 font-sans text-[11px] leading-relaxed" style={{ color: 'var(--color-ash)' }}>
            You also have {loose.length} reading{loose.length === 1 ? '' : 's'} logged on their own, outside any
            report. They still appear in your trends.
          </p>
        )}
      </div>
    </div>
  );
}
