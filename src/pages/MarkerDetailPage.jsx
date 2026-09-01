import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Star, Target, Trash2, Info, Calculator, Share2 } from 'lucide-react';
import { getMarker } from '../data/markers.js';
import { CATEGORIES } from '../data/categories.js';
import { useMarkerHistory, useHealthData } from '../hooks/useHealth.js';
import { seriesFor, stats, slopePerMonth, RANGES } from '../utils/trends.js';
import { formatValue, formatRange, statusMeta, isValidTarget } from '../utils/ranges.js';
import { displayUnit, toDisplay, fromDisplay, hasAltUnit } from '../utils/units.js';
import { formatDate, relativeDate, todayKey } from '../utils/dates.js';
import { DERIVED_SOURCES } from '../utils/derived.js';
import { pagerOrder, pagerNeighbours } from '../utils/pager.js';
import useSwipeNav from '../hooks/useSwipeNav.js';
import EdgePager from '../components/health/EdgePager.jsx';
import { deleteReading, setTarget, clearTarget } from '../db/actions.js';
import useSettingsStore from '../store/settingsStore.js';
import useUIStore from '../store/uiStore.js';
import TopBar from '../components/layout/TopBar.jsx';
import TrendChart from '../components/charts/TrendChart.jsx';
import RangeBar from '../components/health/RangeBar.jsx';
import StatusPill from '../components/health/StatusPill.jsx';
import DeltaBadge from '../components/health/DeltaBadge.jsx';
import CountUp from '../components/fx/CountUp.jsx';
import Modal from '../components/ui/Modal.jsx';
import ShareSheet from '../components/share/ShareSheet.jsx';
import { Field, Input, Button } from '../components/ui/Field.jsx';

// One marker, everything about it: where you stand, how you got here, every
// reading behind the line, and what the marker actually means.
export default function MarkerDetailPage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const history = useMarkerHistory(key);
  const data = useHealthData();
  const units = useSettingsStore((s) => s.units);
  const togglePinned = useSettingsStore((s) => s.togglePinned);
  const effects = useSettingsStore((s) => s.effects);
  const setUnit = useSettingsStore((s) => s.setUnit);
  const showToast = useUIStore((s) => s.showToast);
  const confirm = useUIStore((s) => s.confirm);

  const [range, setRange] = useState('all');
  const [targetOpen, setTargetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const windowed = useMemo(() => {
    if (!history) return [];
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    return days == null
      ? history.series
      : seriesFor(history.series, key, { days, from: todayKey() });
  }, [history, range, key]);

  // Every marker this person has data for, in the order Trends lists them, so
  // a swipe walks the same path as scrolling that page.
  const order = useMemo(() => pagerOrder(data.rows, CATEGORIES), [data.rows]);
  const { prev, next } = useMemo(() => pagerNeighbours(order, key), [order, key]);
  const goTo = (target) => target && navigate(`/markers/${target}`, { replace: true });
  const swipe = useSwipeNav({
    onLeft: () => goTo(next),
    onRight: () => goTo(prev),
    enabled: Boolean(prev || next),
  });

  // A new marker starts at the top. Paging is the same component with a
  // different param, so nothing scrolls it back on its own.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [key]);

  if (!history) {
    return (
      <div className="px-5 pt-10 text-center">
        <p className="font-sans text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          That marker does not exist.
        </p>
      </div>
    );
  }

  const { marker, base, series, latest, status, sex } = history;
  const meta = statusMeta(status);
  const unit = displayUnit(marker, units);
  const summary = stats(windowed);
  const drift = slopePerMonth(series);
  const isPinned = data.pinned.includes(key);
  const target = data.targets[key];

  async function removeReading(reading) {
    const ok = await confirm({
      title: 'Delete this reading?',
      message: `${formatValue(reading.value, marker)} ${marker.unit} from ${formatDate(reading.date)}. Any calculated value that used it disappears too.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await deleteReading(reading.id);
    showToast('Reading deleted');
  }

  return (
    <div key={key} className="anim-fade-slide-up pb-6" {...swipe}>
      <EdgePager prev={prev} next={next} onGo={goTo} animate={effects} />
      <TopBar
        title={marker.name}
        subtitle={
          data.profiles.length > 1
            ? `${data.profile.name || 'This profile'} · ${base.derived ? 'calculated' : marker.unit}`
            : base.derived
              ? 'Calculated from your other readings'
              : marker.unit
        }
        back={
          <button onClick={() => navigate(-1)} aria-label="Back" className="mr-1 p-1">
            <ArrowLeft size={20} style={{ color: 'var(--color-text-primary)' }} />
          </button>
        }
        right={
          <>
            {latest && (
              <button onClick={() => setShareOpen(true)} aria-label="Share this reading" className="p-2">
                <Share2 size={17} style={{ color: 'var(--color-text-primary)' }} />
              </button>
            )}
            <button onClick={() => togglePinned(data.profileId, key)} aria-label={isPinned ? 'Unpin' : 'Pin to Home'} className="p-2">
            <Star
              size={18}
              fill={isPinned ? 'var(--color-pulse)' : 'none'}
              style={{ color: isPinned ? 'var(--color-pulse)' : 'var(--color-ash)' }}
            />
            </button>
          </>
        }
      />

      <div className="px-5 pt-4">
        {/* Where you stand */}
        {latest ? (
          <section
            className="mb-5 rounded-2xl px-4 py-4"
            style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <CountUp
                    value={toDisplay(latest.value, marker, units)}
                    decimals={marker.decimals}
                    className="font-display text-4xl font-extrabold"
                    style={{ color: meta.color }}
                  />
                  <span className="font-sans text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {unit}
                  </span>
                </div>
                <p className="mt-0.5 font-sans text-[11px]" style={{ color: 'var(--color-ash)' }}>
                  {formatDate(latest.date)} · {relativeDate(latest.date)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusPill status={status} />
                {history.delta && <DeltaBadge delta={history.delta} marker={marker} />}
              </div>
            </div>

            <div className="mt-4">
              <RangeBar value={latest.value} marker={marker} sex={sex} height={9} />
              <div className="mt-1.5 flex items-center justify-between">
                <p className="font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {formatRange(marker, sex)
                    ? `${marker.isTarget ? 'Your target' : 'Usual range'}: ${formatRange(marker, sex)} ${unit}`
                    : 'No general reference range for this marker'}
                </p>
                <button
                  onClick={() => setTargetOpen(true)}
                  className="flex items-center gap-1 font-sans text-[11px] font-semibold"
                  style={{ color: 'var(--color-pulse)' }}
                >
                  <Target size={11} /> {target ? 'Edit target' : 'Set target'}
                </button>
              </div>
            </div>
          </section>
        ) : (
          <p className="mb-5 font-sans text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            No readings for this marker yet.
          </p>
        )}

        {/* The trend */}
        {series.length > 1 && (
          <section className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-sans text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                Over time
              </h2>
              <div className="flex gap-1">
                {RANGES.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => setRange(option.key)}
                    className="rounded-full px-2.5 py-1 font-sans text-[11px] font-semibold"
                    style={{
                      background: range === option.key ? 'var(--color-pulse)' : 'var(--color-ivory)',
                      color: range === option.key ? '#ffffff' : 'var(--color-text-secondary)',
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="rounded-2xl px-2 py-3"
              style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
            >
              {windowed.length > 1 ? (
                <TrendChart series={windowed} marker={marker} sex={sex} unitLabel={unit} />
              ) : (
                <p className="py-10 text-center font-sans text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  Only one reading in this window.
                </p>
              )}
            </div>

            {summary && windowed.length > 1 && (
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <Stat label="Lowest" value={formatValue(toDisplay(summary.min, marker, units), marker)} unit={unit} />
                <Stat label="Average" value={formatValue(toDisplay(summary.average, marker, units), marker)} unit={unit} />
                <Stat label="Highest" value={formatValue(toDisplay(summary.max, marker, units), marker)} unit={unit} />
              </div>
            )}

            {drift != null && Math.abs(drift) > 0.001 && (
              <p className="mt-2.5 font-sans text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                Across all {series.length} readings this has moved about{' '}
                <span className="tnum font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {drift > 0 ? '+' : ''}
                  {formatValue(drift, marker)} {marker.unit}
                </span>{' '}
                per month on average.
              </p>
            )}
          </section>
        )}

        {/* What it is */}
        <section
          className="mb-5 flex items-start gap-2.5 rounded-2xl px-4 py-3.5"
          style={{ background: 'var(--color-pulse-soft)' }}
        >
          {base.derived ? (
            <Calculator size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-pulse)' }} />
          ) : (
            <Info size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-pulse)' }} />
          )}
          <div>
            <p className="font-sans text-xs leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
              {marker.about}
            </p>
            {base.derived && (
              <p className="mt-1.5 font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                Calculated from{' '}
                {(DERIVED_SOURCES[key] ?? [])
                  .map((sourceKey) => getMarker(sourceKey)?.name)
                  .filter(Boolean)
                  .join(' and ')}
                . Delete those readings and this disappears with them.
              </p>
            )}
          </div>
        </section>

        {/* Unit switch */}
        {hasAltUnit(marker) && (
          <section className="mb-5">
            <h2 className="mb-2 font-sans text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
              Show this marker in
            </h2>
            <div className="flex gap-2">
              {[
                { mode: 'canonical', label: marker.unit },
                { mode: 'alt', label: marker.altUnit },
              ].map((option) => (
                <button
                  key={option.mode}
                  onClick={() => setUnit(key, option.mode)}
                  className="flex-1 rounded-xl py-2.5 font-sans text-sm font-semibold"
                  style={{
                    background: (units[key] ?? 'canonical') === option.mode ? 'var(--color-pulse)' : 'var(--color-ivory)',
                    color: (units[key] ?? 'canonical') === option.mode ? '#ffffff' : 'var(--color-text-secondary)',
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 font-sans text-[11px]" style={{ color: 'var(--color-ash)' }}>
              Only changes how it is shown. Your readings are stored in {marker.unit} either way.
            </p>
          </section>
        )}

        {/* Every reading */}
        {series.length > 0 && (
          <section>
            <h2 className="mb-2.5 font-sans text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
              All {series.length} reading{series.length === 1 ? '' : 's'}
            </h2>
            <div className="flex flex-col gap-1.5">
              {[...series].reverse().map((reading, index) => (
                <div
                  key={reading.id ?? `${reading.date}-${index}`}
                  className="flex items-center gap-3 rounded-xl px-3.5 py-2.5"
                  style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {formatDate(reading.date)}
                    </p>
                    {reading.note && (
                      <p className="truncate font-sans text-[11px]" style={{ color: 'var(--color-ash)' }}>
                        {reading.note}
                      </p>
                    )}
                  </div>
                  <span className="tnum font-display text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    {formatValue(toDisplay(reading.value, marker, units), marker)}
                  </span>
                  <span className="w-10 font-sans text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {unit}
                  </span>
                  {reading.id != null ? (
                    <button onClick={() => removeReading(reading)} aria-label="Delete reading" className="p-1">
                      <Trash2 size={14} style={{ color: 'var(--color-ash)' }} />
                    </button>
                  ) : (
                    <span className="w-6 text-center font-sans text-[9px]" style={{ color: 'var(--color-ash)' }}>
                      calc
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <ShareSheet
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        row={{ markerKey: key, marker, value: latest?.value, status, date: latest?.date, delta: history.delta }}
        sex={sex}
        units={units}
        profileName={data.profile.name}
        series={series}
      />

      <TargetSheet
        isOpen={targetOpen}
        onClose={() => setTargetOpen(false)}
        marker={marker}
        base={base}
        units={units}
        existing={target}
        onSave={async (next) => {
          await setTarget(data.profileId, key, next);
          showToast('Target saved', { type: 'success' });
        }}
        onClear={async () => {
          await clearTarget(data.profileId, key);
          showToast('Back to the general reference range');
        }}
      />
    </div>
  );
}

function Stat({ label, value, unit }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}>
      <p className="font-sans text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </p>
      <p className="tnum font-display text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
        {value}
        <span className="ml-1 font-sans text-[10px] font-normal" style={{ color: 'var(--color-ash)' }}>
          {unit}
        </span>
      </p>
    </div>
  );
}

// A target your doctor gave you, which replaces the population reference range
// for this marker everywhere in the app.
function TargetSheet({ isOpen, onClose, marker, base, units, existing, onSave, onClear }) {
  const unit = displayUnit(base, units);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  // Seed the inputs from the saved target each time the sheet opens.
  const [seededFor, setSeededFor] = useState(null);
  if (isOpen && seededFor !== existing) {
    setSeededFor(existing);
    setMin(existing?.min != null ? String(formatValue(toDisplay(existing.min, base, units), base)) : '');
    setMax(existing?.max != null ? String(formatValue(toDisplay(existing.max, base, units), base)) : '');
  }

  const parsed = {
    min: min === '' ? null : fromDisplay(Number(min), base, units),
    max: max === '' ? null : fromDisplay(Number(max), base, units),
  };
  const valid = isValidTarget(parsed);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Set your target"
      subtitle={`Replaces the general range for ${base.name}`}
    >
      <p className="mb-4 font-sans text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        If your doctor gave you a number to aim for, put it here and HealthTrace will grade this
        marker against your target instead of the general adult range. Leave a box empty for an
        open-ended target.
      </p>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label={`Minimum (${unit})`} htmlFor="target-min">
            <Input id="target-min" type="number" inputMode="decimal" step="any" value={min} placeholder="—" onChange={(e) => setMin(e.target.value)} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label={`Maximum (${unit})`} htmlFor="target-max">
            <Input id="target-max" type="number" inputMode="decimal" step="any" value={max} placeholder="—" onChange={(e) => setMax(e.target.value)} />
          </Field>
        </div>
      </div>

      {!valid && (min !== '' || max !== '') && (
        <p className="mt-2 font-sans text-[11px]" style={{ color: 'var(--status-high)' }}>
          The minimum has to be below the maximum.
        </p>
      )}

      <div className="mt-5 flex gap-3 pb-2">
        {existing && (
          <Button
            variant="secondary"
            onClick={async () => {
              await onClear();
              onClose();
            }}
          >
            Remove
          </Button>
        )}
        <Button
          full
          disabled={!valid}
          onClick={async () => {
            await onSave(parsed);
            onClose();
          }}
        >
          Save target
        </Button>
      </div>
    </Modal>
  );
}
