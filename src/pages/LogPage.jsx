import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, FileText, Check } from 'lucide-react';
import { getMarker } from '../data/markers.js';
import { todayKey } from '../utils/dates.js';
import { classify, formatValue, formatRange, effectiveMarker } from '../utils/ranges.js';
import { displayUnit, fromDisplay, toDisplay } from '../utils/units.js';
import { addReading } from '../db/actions.js';
import { useHealthData } from '../hooks/useHealth.js';
import { useHaptics } from '../hooks/useHaptics.js';
import { playCue } from '../utils/sound.js';
import useSettingsStore from '../store/settingsStore.js';
import useUIStore from '../store/uiStore.js';
import TopBar from '../components/layout/TopBar.jsx';
import MarkerPicker from '../components/log/MarkerPicker.jsx';
import RangeBar from '../components/health/RangeBar.jsx';
import StatusPill from '../components/health/StatusPill.jsx';
import { Field, Input, Button } from '../components/ui/Field.jsx';

// The vitals you measure at home, offered first — this screen is for the
// 20-second entry, not for a full panel (that is Reports).
const QUICK = ['systolic', 'diastolic', 'pulse', 'weight', 'fastingGlucose', 'spo2'];

export default function LogPage() {
  const navigate = useNavigate();
  const data = useHealthData();
  const units = useSettingsStore((s) => s.units);
  const showToast = useUIStore((s) => s.showToast);
  const haptic = useHaptics();

  const [date, setDate] = useState(todayKey());
  const [values, setValues] = useState({});
  const [extraKeys, setExtraKeys] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const keys = useMemo(() => [...QUICK, ...extraKeys], [extraKeys]);

  const filled = keys.filter((key) => {
    const raw = values[key];
    return raw != null && raw !== '' && Number.isFinite(Number(raw));
  });

  async function save() {
    if (!filled.length || saving) return;
    setSaving(true);
    try {
      for (const key of filled) {
        const marker = getMarker(key);
        const typed = Number(values[key]);
        // The user typed in their display unit; storage is always canonical.
        await addReading({ profileId: data.profileId, markerKey: key, value: fromDisplay(typed, marker, units), date });
      }
      haptic('saved');
      playCue('saved');
      showToast(`Logged ${filled.length} reading${filled.length === 1 ? '' : 's'}`, { type: 'success' });
      setValues({});
      setExtraKeys([]);
      navigate('/home');
    } catch (error) {
      console.error(error);
      showToast('Could not save those readings.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="anim-fade-slide-up pb-6">
      <TopBar
        title="Log a reading"
        subtitle={
          data.profiles.length > 1
            ? `For ${data.profile.name || 'this profile'}`
            : 'Quick entry for what you measure at home'
        }
        right={
          <button
            onClick={() => navigate('/reports/new')}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 font-sans text-xs font-semibold"
            style={{ background: 'var(--color-ivory)', color: 'var(--color-text-primary)' }}
          >
            <FileText size={13} /> Full report
          </button>
        }
      />

      <div className="px-5 pt-4">
        <Field label="Date" htmlFor="log-date">
          <Input
            id="log-date"
            type="date"
            value={date}
            max={todayKey()}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>

        <div className="mt-5 flex flex-col gap-2.5">
          {keys.map((key) => (
            <ValueInput
              key={key}
              markerKey={key}
              value={values[key] ?? ''}
              units={units}
              sex={data.sex}
              targets={data.targets}
              lastRow={data.rowByKey[key]}
              onChange={(next) => setValues((v) => ({ ...v, [key]: next }))}
              onRemove={extraKeys.includes(key) ? () => setExtraKeys((k) => k.filter((x) => x !== key)) : undefined}
            />
          ))}
        </div>

        <button
          onClick={() => setPickerOpen(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-sans text-sm font-semibold"
          style={{
            background: 'transparent',
            border: '1px dashed var(--color-ivory)',
            color: 'var(--color-pulse)',
          }}
        >
          <Plus size={15} /> Add another marker
        </button>

        <Button
          full
          onClick={save}
          disabled={!filled.length || saving}
          className="mt-5 flex items-center justify-center gap-2"
        >
          <Check size={16} />
          {filled.length ? `Save ${filled.length} reading${filled.length === 1 ? '' : 's'}` : 'Enter a value to save'}
        </Button>
      </div>

      <MarkerPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(key) => setExtraKeys((k) => (k.includes(key) ? k : [...k, key]))}
        selected={extraKeys}
        exclude={QUICK}
        multi
      />
    </div>
  );
}

// One marker's input, which grades what you type as you type it. Seeing "in
// range" appear under a number is the whole point of entering it here.
function ValueInput({ markerKey, value, onChange, onRemove, units, sex, targets, lastRow }) {
  const base = getMarker(markerKey);
  if (!base) return null;
  const marker = effectiveMarker(base, targets);
  const unit = displayUnit(marker, units);

  const typed = value === '' ? null : Number(value);
  const stored = typed != null && Number.isFinite(typed) ? fromDisplay(typed, marker, units) : null;
  const status = stored != null ? classify(stored, marker, sex) : null;
  const range = formatRange(marker, sex);

  const previous = lastRow
    ? `Last: ${formatValue(toDisplay(lastRow.value, marker, units), marker)} ${unit}`
    : null;

  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {marker.name}
          </p>
          <p className="font-sans text-[11px]" style={{ color: 'var(--color-ash)' }}>
            {range ? `Usual: ${range} ${unit}` : previous || unit}
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="—"
            aria-label={marker.name}
            className="tnum w-24 rounded-xl px-3 py-2.5 text-right font-display text-lg font-bold outline-none"
            style={{ background: 'var(--color-ivory)', color: 'var(--color-text-primary)' }}
          />
          <span className="w-12 font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            {unit}
          </span>
          {onRemove && (
            <button onClick={onRemove} aria-label={`Remove ${marker.name}`} className="p-1">
              <X size={14} style={{ color: 'var(--color-ash)' }} />
            </button>
          )}
        </div>
      </div>

      {status && (
        <div className="mt-2.5 flex items-center gap-2.5">
          <div className="flex-1">
            <RangeBar value={stored} marker={marker} sex={sex} height={5} />
          </div>
          <StatusPill status={status} size="sm" />
        </div>
      )}
    </div>
  );
}
