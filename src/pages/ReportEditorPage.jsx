import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardPaste, Plus, X, Trash2, Paperclip, FileText } from 'lucide-react';
import { db } from '../db/db.js';
import { addReport, updateReport, replaceReportReadings, deleteReport, addAttachment, deleteAttachment } from '../db/actions.js';
import { getMarker } from '../data/markers.js';
import { todayKey } from '../utils/dates.js';
import { classify, formatValue, effectiveMarker } from '../utils/ranges.js';
import { displayUnit, fromDisplay, toDisplay } from '../utils/units.js';
import { useHealthData, useReportReadings, useProfiles, useAttachments } from '../hooks/useHealth.js';
import { useHaptics } from '../hooks/useHaptics.js';
import { playCue } from '../utils/sound.js';
import useSettingsStore from '../store/settingsStore.js';
import useUIStore from '../store/uiStore.js';
import TopBar from '../components/layout/TopBar.jsx';
import MarkerPicker from '../components/log/MarkerPicker.jsx';
import PasteImport from '../components/reports/PasteImport.jsx';
import StatusPill from '../components/health/StatusPill.jsx';
import Avatar from '../components/profile/Avatar.jsx';
import { Field, Input, Button } from '../components/ui/Field.jsx';

// One screen for both "new report" and "edit report" — the same form either
// way, so there is no second, subtly different code path to keep in step.
export default function ReportEditorPage() {
  const { id } = useParams();
  const reportId = id ? Number(id) : null;
  const editing = reportId != null;

  const navigate = useNavigate();
  const data = useHealthData();
  const { profiles } = useProfiles();
  const existing = useReportReadings(reportId);
  const units = useSettingsStore((s) => s.units);
  const dayFirstDates = useSettingsStore((s) => s.dayFirstDates);
  const showToast = useUIStore((s) => s.showToast);
  const confirm = useUIStore((s) => s.confirm);
  const haptic = useHaptics();

  const [meta, setMeta] = useState({ date: todayKey(), title: '', lab: '', doctor: '', note: '' });
  // Which family member this report belongs to. Defaults to whoever is on
  // screen, and the paste importer can move it when the header names somebody
  // else.
  const [ownerId, setOwnerId] = useState(null);
  const [rows, setRows] = useState([]); // [{ markerKey, value }] — value is a display-unit string
  const [pickerOpen, setPickerOpen] = useState(false);
  // Files chosen before the report exists have nowhere to live yet, so they
  // wait here and are written once the report has an id.
  const [pendingFiles, setPendingFiles] = useState([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [loaded, setLoaded] = useState(!editing);
  const [saving, setSaving] = useState(false);

  // Load an existing report once, then leave the form alone so live-query
  // updates can never overwrite what is being typed.
  useEffect(() => {
    if (!editing || loaded || existing.loading) return;
    let cancelled = false;
    db.reports.get(reportId).then((report) => {
      if (cancelled || !report) return;
      setMeta({
        date: report.date,
        title: report.title ?? '',
        lab: report.lab ?? '',
        doctor: report.doctor ?? '',
        note: report.note ?? '',
      });
      setOwnerId(report.profileId ?? null);
      setRows(
        existing.readings.map((reading) => ({
          markerKey: reading.markerKey,
          value: String(formatValue(toDisplay(reading.value, reading.marker, units), reading.marker)),
        }))
      );
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [editing, loaded, existing, reportId, units]);

  function setRow(markerKey, value) {
    setRows((current) => current.map((row) => (row.markerKey === markerKey ? { ...row, value } : row)));
  }

  function addRow(markerKey, value = '') {
    setRows((current) =>
      current.some((row) => row.markerKey === markerKey)
        ? current.map((row) => (row.markerKey === markerKey && value !== '' ? { ...row, value } : row))
        : [...current, { markerKey, value: String(value) }]
    );
  }

  function removeRow(markerKey) {
    setRows((current) => current.filter((row) => row.markerKey !== markerKey));
  }

  function attachFile(file) {
    setPendingFiles((current) =>
      current.some((f) => f.name === file.name && f.size === file.size) ? current : [...current, file]
    );
  }

  function applyPaste({ readings, date, suggestedProfileId, foundName, file }) {
    if (file) attachFile(file);
    for (const reading of readings) {
      const marker = getMarker(reading.markerKey);
      // The parser works in canonical units; the form shows display units.
      addRow(reading.markerKey, formatValue(toDisplay(reading.value, marker, units), marker));
    }
    if (date) setMeta((m) => ({ ...m, date }));
    // A name in the report header outranks whoever happens to be on screen —
    // but it is shown in the picker below, never applied silently.
    if (suggestedProfileId != null && suggestedProfileId !== owner?.id) {
      setOwnerId(suggestedProfileId);
      const who = profiles.find((p) => p.id === suggestedProfileId);
      showToast(
        `Added ${readings.length} reading${readings.length === 1 ? '' : 's'} — filed under ${who?.name ?? foundName}`,
        { type: 'success' }
      );
      return;
    }
    showToast(`Added ${readings.length} reading${readings.length === 1 ? '' : 's'} from your paste`, { type: 'success' });
  }

  const filled = rows.filter((row) => row.value !== '' && Number.isFinite(Number(row.value)));
  const owner = profiles.find((p) => p.id === (ownerId ?? data.profileId)) ?? data.profile;

  async function save() {
    if (!filled.length || saving) return;
    setSaving(true);
    try {
      const readings = filled.map((row) => {
        const marker = getMarker(row.markerKey);
        return { markerKey: row.markerKey, value: fromDisplay(Number(row.value), marker, units) };
      });

      const profileId = owner?.id ?? data.profileId;
      if (editing) {
        await updateReport(reportId, { ...meta, profileId });
        await replaceReportReadings(reportId, readings, meta.date);
        for (const file of pendingFiles) await addAttachment(reportId, file);
        setPendingFiles([]);
        showToast('Report updated', { type: 'success' });
      } else {
        const newId = await addReport({ ...meta, profileId }, readings);
        for (const file of pendingFiles) await addAttachment(newId, file);
        showToast(
          `Report saved for ${owner?.name || 'this profile'} with ${readings.length} marker${readings.length === 1 ? '' : 's'}`,
          { type: 'success' }
        );
      }
      haptic('saved');
      playCue('saved');
      navigate('/reports', { replace: true });
    } catch (error) {
      console.error(error);
      showToast('Could not save that report.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete this report?',
      message: 'Every reading taken from it is deleted too, and any trend line built on those readings loses these points. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await deleteReport(reportId);
    showToast('Report deleted');
    navigate('/reports', { replace: true });
  }

  return (
    <div className="anim-fade-slide-up pb-6">
      <TopBar
        title={editing ? 'Edit report' : 'New report'}
        subtitle={
          profiles.length > 1
            ? `For ${owner?.name || 'this profile'}`
            : editing
              ? 'Changes apply to every trend this report feeds'
              : 'A checkup, a blood panel, a visit'
        }
        back={
          <button onClick={() => navigate(-1)} aria-label="Back" className="mr-1 p-1">
            <ArrowLeft size={20} style={{ color: 'var(--color-text-primary)' }} />
          </button>
        }
        right={
          editing ? (
            <button onClick={remove} aria-label="Delete report" className="p-2">
              <Trash2 size={17} style={{ color: 'var(--status-high)' }} />
            </button>
          ) : null
        }
      />

      <div className="px-5 pt-4">
        <button
          onClick={() => setPasteOpen(true)}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left"
          style={{ background: 'var(--color-pulse)', color: '#ffffff' }}
        >
          <ClipboardPaste size={18} />
          <div>
            <p className="font-sans text-sm font-semibold">Open a PDF or paste your report</p>
            <p className="font-sans text-[11px]" style={{ color: 'rgba(255,255,255,0.85)' }}>
              Reads the markers out of it for you
            </p>
          </div>
        </button>

        {/* Whose report this is. Always visible in a household, so a panel can
            never be filed against the wrong person by accident. */}
        {profiles.length > 1 && (
          <div className="mb-4">
            <span className="font-sans text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
              Whose report
            </span>
            <div className="no-scrollbar -mx-5 mt-1.5 flex gap-2 overflow-x-auto px-5">
              {profiles.map((person) => {
                const picked = person.id === owner?.id;
                return (
                  <button
                    key={person.id}
                    onClick={() => setOwnerId(person.id)}
                    className="flex flex-shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3"
                    style={{
                      background: picked ? 'var(--color-pulse-soft)' : 'var(--color-chalk)',
                      border: `1px solid ${picked ? 'var(--color-pulse)' : 'var(--color-ivory)'}`,
                    }}
                  >
                    <Avatar profile={person} size={24} />
                    <span
                      className="font-sans text-xs font-semibold"
                      style={{ color: picked ? 'var(--color-pulse)' : 'var(--color-text-secondary)' }}
                    >
                      {person.name || 'Unnamed'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3.5">
          <Field label="Date of the report" htmlFor="report-date">
            <Input
              id="report-date"
              type="date"
              value={meta.date}
              max={todayKey()}
              onChange={(e) => setMeta((m) => ({ ...m, date: e.target.value }))}
            />
          </Field>

          <div className="flex gap-3">
            <div className="flex-1">
              <Field label="Title" htmlFor="report-title">
                <Input
                  id="report-title"
                  value={meta.title}
                  placeholder="Annual checkup"
                  onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Lab" htmlFor="report-lab">
                <Input
                  id="report-lab"
                  value={meta.lab}
                  placeholder="Which lab"
                  onChange={(e) => setMeta((m) => ({ ...m, lab: e.target.value }))}
                />
              </Field>
            </div>
          </div>

          <Field label="Note" hint="Fasting? Feeling unwell? Anything that explains a number later." htmlFor="report-note">
            <Input
              id="report-note"
              value={meta.note}
              placeholder="Optional"
              onChange={(e) => setMeta((m) => ({ ...m, note: e.target.value }))}
            />
          </Field>
        </div>

        <h2 className="mb-2.5 mt-6 font-sans text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
          Markers ({rows.length})
        </h2>

        {rows.length === 0 && (
          <p className="mb-3 font-sans text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Paste your report above, or add markers one at a time.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <ReportRow
              key={row.markerKey}
              markerKey={row.markerKey}
              value={row.value}
              units={units}
              sex={data.sex}
              targets={data.targets}
              onChange={(next) => setRow(row.markerKey, next)}
              onRemove={() => removeRow(row.markerKey)}
            />
          ))}
        </div>

        <button
          onClick={() => setPickerOpen(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-sans text-sm font-semibold"
          style={{ background: 'transparent', border: '1px dashed var(--color-ivory)', color: 'var(--color-pulse)' }}
        >
          <Plus size={15} /> Add a marker
        </button>

        <AttachmentsSection
          reportId={editing ? reportId : null}
          pendingFiles={pendingFiles}
          onAdd={attachFile}
          onRemovePending={(name) => setPendingFiles((f) => f.filter((x) => x.name !== name))}
        />

        <Button full onClick={save} disabled={!filled.length || saving} className="mt-5">
          {filled.length
            ? `${editing ? 'Save changes' : 'Save report'} · ${filled.length} marker${filled.length === 1 ? '' : 's'}`
            : 'Add at least one value'}
        </Button>
      </div>

      <MarkerPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(key) => addRow(key)}
        selected={rows.map((row) => row.markerKey)}
        multi
      />
      <PasteImport
        isOpen={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onApply={applyPaste}
        onAttach={attachFile}
        dayFirstDates={dayFirstDates}
        sex={owner?.sex ?? data.sex}
        profiles={profiles}
        activeProfile={owner}
      />
    </div>
  );
}

function ReportRow({ markerKey, value, onChange, onRemove, units, sex, targets }) {
  const base = getMarker(markerKey);
  if (!base) return null;
  const marker = effectiveMarker(base, targets);
  const unit = displayUnit(marker, units);
  const typed = value === '' ? null : Number(value);
  const stored = typed != null && Number.isFinite(typed) ? fromDisplay(typed, marker, units) : null;
  const status = stored != null ? classify(stored, marker, sex) : null;

  return (
    <div
      className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
      style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
    >
      <p className="min-w-0 flex-1 truncate font-sans text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
        {marker.name}
      </p>
      {status && <StatusPill status={status} size="sm" />}
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        aria-label={marker.name}
        className="tnum w-20 rounded-lg px-2.5 py-2 text-right font-display text-base font-bold outline-none"
        style={{ background: 'var(--color-ivory)', color: 'var(--color-text-primary)' }}
      />
      <span className="w-11 flex-shrink-0 font-sans text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
        {unit}
      </span>
      <button onClick={onRemove} aria-label={`Remove ${marker.name}`} className="p-1">
        <X size={14} style={{ color: 'var(--color-ash)' }} />
      </button>
    </div>
  );
}

// The original document, kept beside the numbers it produced. Files chosen for
// a report that does not exist yet are held in memory until it does — the
// alternative is writing an attachment with no report to belong to.
function AttachmentsSection({ reportId, pendingFiles, onAdd, onRemovePending }) {
  const saved = useAttachments(reportId) ?? [];
  const total = saved.length + pendingFiles.length;

  return (
    <section className="mt-6">
      <h2 className="mb-1 font-sans text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
        Attachments {total > 0 && `(${total})`}
      </h2>
      <p className="mb-2.5 font-sans text-[11px]" style={{ color: 'var(--color-ash)' }}>
        Keep the original PDF or a photo of the report with its numbers. Stored on this device only,
        and left out of backup files because they are large.
      </p>

      <div className="flex flex-col gap-1.5">
        {saved.map((file) => (
          <AttachmentRow key={file.id} name={file.name} size={file.size} onRemove={() => deleteAttachment(file.id)} />
        ))}
        {pendingFiles.map((file) => (
          <AttachmentRow
            key={file.name}
            name={file.name}
            size={file.size}
            pending
            onRemove={() => onRemovePending(file.name)}
          />
        ))}
      </div>

      <label
        className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-2xl py-3 font-sans text-sm font-semibold"
        style={{ background: 'transparent', border: '1px dashed var(--color-ivory)', color: 'var(--color-pulse)' }}
      >
        <Paperclip size={15} /> Attach a PDF or photo
        <input
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          aria-label="Attach a file to this report"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onAdd(file);
          }}
        />
      </label>
    </section>
  );
}

function AttachmentRow({ name, size, pending, onRemove }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
      style={{ background: 'var(--color-chalk)', border: '1px solid var(--color-ivory)' }}
    >
      <FileText size={15} className="flex-shrink-0" style={{ color: 'var(--color-ash)' }} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-sans text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {name}
        </p>
        <p className="font-sans text-[10px]" style={{ color: 'var(--color-ash)' }}>
          {(size / 1024).toFixed(0)} KB{pending ? ' · saves with the report' : ''}
        </p>
      </div>
      <button onClick={onRemove} aria-label={`Remove ${name}`} className="p-1">
        <X size={14} style={{ color: 'var(--color-ash)' }} />
      </button>
    </div>
  );
}
