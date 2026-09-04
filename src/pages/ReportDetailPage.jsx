import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Stethoscope } from 'lucide-react';
import { db } from '../db/db.js';
import { openRow } from '../db/vault.js';
import { useReportReadings, useHealthData } from '../hooks/useHealth.js';
import { reportSummary } from '../utils/insights.js';
import { formatDate, relativeDate } from '../utils/dates.js';
import { formatValue, formatRange, statusMeta } from '../utils/ranges.js';
import { displayUnit, toDisplay } from '../utils/units.js';
import { categoryName } from '../data/categories.js';
import { getMarker } from '../data/markers.js';
import { DERIVED_SOURCES } from '../utils/derived.js';
import useSettingsStore from '../store/settingsStore.js';
import TopBar from '../components/layout/TopBar.jsx';
import StatusPill from '../components/health/StatusPill.jsx';
import RangeBar from '../components/health/RangeBar.jsx';

// One checkup, read the way a lab prints it: grouped by panel, each value
// against its range. Derived markers are computed from this report's own
// readings and clearly labelled as calculated.
export default function ReportDetailPage() {
  const { id } = useParams();
  const reportId = Number(id);
  const navigate = useNavigate();
  const { readings, groups, loading } = useReportReadings(reportId);
  const data = useHealthData();
  const units = useSettingsStore((s) => s.units);
  const [report, setReport] = useState(null);

  useEffect(() => {
    let cancelled = false;
    db.reports
      .get(reportId)
      .then((row) => openRow('reports', row))
      .then((row) => {
        if (!cancelled) setReport(row ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, readings.length]);

  const summary = reportSummary(readings, data.sex);
  const derived = report ? (data.derivedByDate[report.date] ?? {}) : {};

  if (!loading && !report) {
    return (
      <div className="px-5 pt-10 text-center">
        <p className="font-sans text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          That report no longer exists.
        </p>
      </div>
    );
  }

  return (
    <div className="anim-fade-slide-up pb-6">
      <TopBar
        title={report?.title || 'Health report'}
        subtitle={report ? `${formatDate(report.date)} · ${relativeDate(report.date)}` : ''}
        back={
          <button onClick={() => navigate('/reports')} aria-label="Back" className="mr-1 p-1">
            <ArrowLeft size={20} style={{ color: 'var(--color-text-primary)' }} />
          </button>
        }
        right={
          <button onClick={() => navigate(`/reports/${reportId}/edit`)} aria-label="Edit report" className="p-2">
            <Pencil size={17} style={{ color: 'var(--color-text-primary)' }} />
          </button>
        }
      />

      <div className="px-5 pt-4">
        {/* At-a-glance summary of the whole panel */}
        <div
          className="mb-5 flex items-center gap-4 rounded-2xl px-4 py-3.5"
          style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
        >
          <div>
            <p className="tnum font-display text-2xl font-extrabold" style={{ color: 'var(--color-text-primary)' }}>
              {summary.total}
            </p>
            <p className="font-sans text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
              markers
            </p>
          </div>
          <div className="h-9 w-px" style={{ background: 'var(--color-ivory)' }} />
          <div>
            <p
              className="tnum font-display text-2xl font-extrabold"
              style={{ color: summary.flagged ? 'var(--status-borderline)' : 'var(--status-optimal)' }}
            >
              {summary.flagged}
            </p>
            <p className="font-sans text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
              outside range
            </p>
          </div>
          {(report?.lab || report?.doctor) && (
            <>
              <div className="h-9 w-px" style={{ background: 'var(--color-ivory)' }} />
              <div className="min-w-0">
                <p className="truncate font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {report.lab || report.doctor}
                </p>
                <p className="font-sans text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                  {report.lab ? 'lab' : 'doctor'}
                </p>
              </div>
            </>
          )}
        </div>

        {report?.note && (
          <div className="mb-5 flex items-start gap-2 rounded-2xl px-4 py-3" style={{ background: 'var(--color-pulse-soft)' }}>
            <Stethoscope size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-pulse)' }} />
            <p className="font-sans text-xs leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
              {report.note}
            </p>
          </div>
        )}

        {/* The panel itself */}
        {groups.map((group) => (
          <section key={group.category} className="mb-6">
            <h2 className="mb-2.5 font-sans text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
              {categoryName(group.category)}
            </h2>
            <div className="flex flex-col gap-2">
              {group.readings.map((reading) => (
                <ValueLine
                  key={reading.id}
                  marker={reading.marker}
                  value={reading.value}
                  status={reading.status}
                  sex={data.sex}
                  units={units}
                  onClick={() => navigate(`/markers/${reading.markerKey}`)}
                />
              ))}
            </div>
          </section>
        ))}

        {/* Calculated from this report's own numbers */}
        {Object.keys(derived).length > 0 && (
          <section className="mb-6">
            <h2 className="mb-1 font-sans text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
              Calculated
            </h2>
            <p className="mb-2.5 font-sans text-[11px]" style={{ color: 'var(--color-ash)' }}>
              Worked out from the readings above — no lab measured these directly.
            </p>
            <div className="flex flex-col gap-2">
              {Object.entries(derived).map(([key, value]) => {
                const marker = getMarker(key);
                if (!marker) return null;
                const sources = (DERIVED_SOURCES[key] ?? [])
                  .map((sourceKey) => getMarker(sourceKey)?.short)
                  .filter(Boolean)
                  .join(' + ');
                return (
                  <ValueLine
                    key={key}
                    marker={marker}
                    value={value}
                    status={data.rowByKey[key]?.status}
                    sex={data.sex}
                    units={units}
                    footnote={sources ? `from ${sources}` : undefined}
                    onClick={() => navigate(`/markers/${key}`)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {!loading && readings.length === 0 && (
          <p className="py-8 text-center font-sans text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            This report has no markers on it yet.
          </p>
        )}
      </div>
    </div>
  );
}

function ValueLine({ marker, value, status, sex, units, footnote, onClick }) {
  const meta = statusMeta(status);
  const unit = displayUnit(marker, units);
  const range = formatRange(marker, sex);

  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl px-4 py-3 text-left"
      style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-sans text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {marker.name}
        </p>
        <div className="flex flex-shrink-0 items-baseline gap-1">
          <span className="tnum font-display text-lg font-bold" style={{ color: meta.color }}>
            {formatValue(toDisplay(value, marker, units), marker)}
          </span>
          <span className="font-sans text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
            {unit}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2.5">
        <div className="flex-1">
          <RangeBar value={value} marker={marker} sex={sex} height={5} />
        </div>
        <StatusPill status={status} size="sm" />
      </div>

      <p className="mt-1.5 font-sans text-[10px]" style={{ color: 'var(--color-ash)' }}>
        {range ? `Usual range ${range} ${unit}` : 'No general reference range'}
        {footnote ? ` · ${footnote}` : ''}
      </p>
    </button>
  );
}
