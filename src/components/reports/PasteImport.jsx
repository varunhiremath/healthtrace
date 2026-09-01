import { useMemo, useState } from 'react';
import { ClipboardPaste, Check, AlertCircle, FileUp, Image as ImageIcon, Loader2 } from 'lucide-react';
import { parseReport, parseReportDate, parseReportName } from '../../utils/parseReport.js';
import { getMarker } from '../../data/markers.js';
import { formatValue } from '../../utils/ranges.js';
import { matchProfileByName } from '../../utils/parseReport.js';
import { extractPdfText, describePdfLimit } from '../../utils/pdfText.js';
import Modal from '../ui/Modal.jsx';
import Avatar from '../profile/Avatar.jsx';
import StatusPill from '../health/StatusPill.jsx';

// Open a lab report — as a PDF, or as pasted text — and this reads the numbers
// out of it.
//
// A PDF is turned into text first and dropped into the same box, deliberately
// visible: you can see exactly what was read out of the file, correct it, and
// watch the same review list build from it. There is no separate hidden path
// for files.
//
// It never writes anything by itself. Everything it found is shown with the
// exact line it came from, pre-ticked or not depending on how sure it is, and
// you confirm before a single value reaches the database. A low-confidence hit
// is shown too — hidden guesses would be worse than visible ones.
export default function PasteImport({
  isOpen, onClose, onApply, onAttach, dayFirstDates = true, sex, profiles = [], activeProfile,
}) {
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState(null);
  const [reading, setReading] = useState(null); // { name, page, pages }
  const [fileNote, setFileNote] = useState(null); // { tone, message, file }

  const parsed = useMemo(() => (text.trim() ? parseReport(text, { sex }) : null), [text, sex]);
  const foundDate = useMemo(
    () => (text.trim() ? parseReportDate(text, { dayFirst: dayFirstDates }) : null),
    [text, dayFirstDates]
  );
  const foundName = useMemo(() => (text.trim() ? parseReportName(text) : null), [text]);
  // Who this report looks like it belongs to, when that is not who is on screen.
  const suggested = useMemo(
    () => (foundName ? matchProfileByName(foundName, profiles) : null),
    [foundName, profiles]
  );
  const mismatched = suggested && activeProfile && suggested.id !== activeProfile.id;

  // Confident hits start ticked; anything doubtful starts unticked so it has to
  // be looked at rather than waved through.
  const selection = useMemo(() => {
    if (chosen) return chosen;
    const next = {};
    for (const hit of parsed?.hits ?? []) next[hit.markerKey] = hit.confidence >= 0.7;
    return next;
  }, [parsed, chosen]);

  const toggle = (key) => setChosen({ ...selection, [key]: !selection[key] });
  const selectedHits = (parsed?.hits ?? []).filter((hit) => selection[hit.markerKey]);

  function reset() {
    setText('');
    setChosen(null);
    setReading(null);
    setFileNote(null);
  }

  // A PDF becomes text; a photo cannot, and says so instead of failing quietly.
  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // let the same file be picked again after a retry
    if (!file) return;

    setChosen(null);
    setFileNote(null);

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      // Reading numbers off a photograph needs OCR, which this app does not do:
      // it would misread a lab table often enough to be dangerous. The picture
      // is still worth keeping with the report, so offer exactly that.
      setFileNote({
        tone: 'info',
        file,
        message: `HealthTrace can’t read values out of a photo — that needs OCR, and on a lab table it misreads often enough to be unsafe. You can attach “${file.name}” to this report and type the values in.`,
      });
      return;
    }

    const tooBig = describePdfLimit(file);
    if (tooBig) {
      setFileNote({ tone: 'error', message: tooBig });
      return;
    }

    setReading({ name: file.name, page: 0, pages: 0 });
    try {
      const buffer = await file.arrayBuffer();
      const result = await extractPdfText(buffer, (page, pages) =>
        setReading({ name: file.name, page, pages })
      );

      if (result.empty) {
        setFileNote({
          tone: 'info',
          file,
          message: `“${file.name}” has no text in it — it is a scan or photo of a page rather than a digital report. You can attach it and type the values in.`,
        });
        return;
      }

      setText(result.text);
      setFileNote({
        tone: 'ok',
        file,
        message: `Read ${result.pages} page${result.pages === 1 ? '' : 's'} of “${file.name}”.${
          result.truncated ? ' Only the first pages were read.' : ''
        }`,
      });
    } catch (error) {
      console.error('Could not read that PDF:', error);
      setFileNote({
        tone: 'error',
        message: `Could not read “${file.name}”. If it opens in a PDF viewer, try selecting the text there and pasting it below.`,
      });
    } finally {
      setReading(null);
    }
  }

  function apply() {
    onApply({
      readings: selectedHits.map((hit) => ({ markerKey: hit.markerKey, value: hit.value })),
      date: foundDate,
      suggestedProfileId: suggested?.id ?? null,
      foundName,
      // The source document travels with the readings it produced.
      file: fileNote?.file ?? null,
    });
    reset();
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add a lab report"
      subtitle="Nothing leaves your device — the file is read right here"
    >
      {/* Open a PDF, or paste the text. Both end up in the same box. */}
      <label
        className="mb-3 flex cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3"
        style={{ background: 'var(--color-pulse-soft)', border: '1px dashed var(--color-pulse)' }}
      >
        {reading ? (
          <Loader2 size={18} className="anim-spin flex-shrink-0" style={{ color: 'var(--color-pulse)' }} />
        ) : (
          <FileUp size={18} className="flex-shrink-0" style={{ color: 'var(--color-pulse)' }} />
        )}
        <span className="min-w-0">
          <span className="block font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {reading ? `Reading ${reading.name}…` : 'Open a PDF'}
          </span>
          <span className="block font-sans text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            {reading
              ? reading.pages
                ? `Page ${reading.page} of ${reading.pages}`
                : 'Opening…'
              : 'Or take a photo to attach it to the report'}
          </span>
        </span>
        <input
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          aria-label="Open a lab report PDF"
          disabled={Boolean(reading)}
          onChange={onFile}
        />
      </label>

      {fileNote && (
        <div
          className="mb-3 flex items-start gap-2 rounded-xl px-3.5 py-2.5"
          style={{
            background:
              fileNote.tone === 'error'
                ? 'var(--status-high-soft)'
                : fileNote.tone === 'ok'
                  ? 'var(--status-optimal-soft)'
                  : 'var(--color-ivory)',
          }}
        >
          {fileNote.tone === 'error' ? (
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--status-high)' }} />
          ) : fileNote.tone === 'ok' ? (
            <Check size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--status-optimal)' }} />
          ) : (
            <ImageIcon size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-ash)' }} />
          )}
          <div className="min-w-0">
            <p className="font-sans text-xs leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
              {fileNote.message}
            </p>
            {fileNote.file && onAttach && fileNote.tone !== 'ok' && (
              <button
                onClick={() => {
                  onAttach(fileNote.file);
                  setFileNote({ ...fileNote, tone: 'ok', file: null, message: `“${fileNote.file.name}” will be attached to this report.` });
                }}
                className="mt-1.5 rounded-lg px-2.5 py-1.5 font-sans text-[11px] font-semibold"
                style={{ background: 'var(--color-pulse)', color: '#ffffff' }}
              >
                Attach it to this report
              </button>
            )}
          </div>
        </div>
      )}

      <textarea
        autoFocus
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setChosen(null);
        }}
        rows={6}
        placeholder={'Or paste the text of a report here.\n\nTotal Cholesterol   186 mg/dL\nHDL Cholesterol      44 mg/dL\nHbA1c               5.8 %'}
        className="w-full resize-y rounded-xl px-3.5 py-3 font-mono text-xs leading-relaxed outline-none"
        style={{ background: 'var(--color-ivory)', color: 'var(--color-text-primary)' }}
      />

      {parsed && (
        <div className="mt-4">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="font-sans text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
              Found {parsed.hits.length} marker{parsed.hits.length === 1 ? '' : 's'}
            </p>
            {foundDate && (
              <span className="font-sans text-[11px]" style={{ color: 'var(--color-pulse)' }}>
                Dated {foundDate}
              </span>
            )}
          </div>

          {/* Whose report this is. Only shown when the header names somebody the
              household knows, and loudest when that is not who is on screen. */}
          {suggested && (
            <div
              className="mb-3 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
              style={{
                background: mismatched ? 'var(--status-borderline-soft)' : 'var(--color-ivory)',
              }}
            >
              <Avatar profile={suggested} size={30} />
              <p className="font-sans text-xs leading-snug" style={{ color: 'var(--color-text-primary)' }}>
                {mismatched ? (
                  <>
                    This report names <strong>{foundName}</strong> — it will be filed under{' '}
                    <strong>{suggested.name}</strong>, not {activeProfile?.name || 'the current profile'}.
                  </>
                ) : (
                  <>
                    Report header names <strong>{foundName}</strong>.
                  </>
                )}
              </p>
            </div>
          )}
          {foundName && !suggested && (
            <div className="mb-3 rounded-xl px-3.5 py-2.5" style={{ background: 'var(--color-ivory)' }}>
              <p className="font-sans text-xs leading-snug" style={{ color: 'var(--color-text-primary)' }}>
                This report names <strong>{foundName}</strong>, who is not in your family list. It will
                be saved under {activeProfile?.name || 'the current profile'} unless you change that below.
              </p>
            </div>
          )}

          {parsed.hits.length === 0 && (
            <div
              className="flex items-start gap-2 rounded-xl px-3.5 py-3"
              style={{ background: 'var(--status-borderline-soft)' }}
            >
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--status-borderline)' }} />
              <p className="font-sans text-xs leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
                No markers recognised. Lab PDFs sometimes copy as a jumble — try pasting a few lines at
                a time, or add the values by hand below.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {parsed.hits.map((hit) => (
              <HitRow key={hit.markerKey} hit={hit} checked={Boolean(selection[hit.markerKey])} onToggle={() => toggle(hit.markerKey)} />
            ))}
          </div>

          {parsed.unmatchedLines.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer font-sans text-[11px]" style={{ color: 'var(--color-ash)' }}>
                {parsed.unmatchedLines.length} line{parsed.unmatchedLines.length === 1 ? '' : 's'} had numbers
                but no marker HealthTrace knows
              </summary>
              <div className="mt-2 flex flex-col gap-1">
                {parsed.unmatchedLines.slice(0, 12).map((line, index) => (
                  <p key={index} className="truncate font-mono text-[10px]" style={{ color: 'var(--color-ash)' }}>
                    {line}
                  </p>
                ))}
              </div>
            </details>
          )}

          <button
            onClick={apply}
            disabled={!selectedHits.length}
            className="mt-4 mb-2 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-sans text-sm font-semibold disabled:opacity-40"
            style={{ background: 'var(--color-pulse)', color: '#ffffff' }}
          >
            <Check size={16} />
            Add {selectedHits.length} reading{selectedHits.length === 1 ? '' : 's'}
          </button>
        </div>
      )}

      {!parsed && (
        <div className="mt-4 flex items-start gap-2 rounded-xl px-3.5 py-3" style={{ background: 'var(--color-pulse-soft)' }}>
          <ClipboardPaste size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-pulse)' }} />
          <p className="font-sans text-xs leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
            HealthTrace recognises the marker names labs normally print, in the units they print them
            in, and shows you every value it read before saving anything. A PDF is turned into text
            you can see and correct — nothing is uploaded to be understood.
          </p>
        </div>
      )}
    </Modal>
  );
}

function HitRow({ hit, checked, onToggle }) {
  const marker = getMarker(hit.markerKey);
  const unsure = hit.confidence < 0.7;

  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left"
      style={{
        background: checked ? 'var(--color-pulse-soft)' : 'var(--color-ivory)',
        border: `1px solid ${checked ? 'var(--color-pulse)' : 'transparent'}`,
      }}
    >
      <span
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md"
        style={{
          background: checked ? 'var(--color-pulse)' : 'transparent',
          border: checked ? 'none' : '1.5px solid var(--color-ash)',
        }}
      >
        {checked && <Check size={12} color="#ffffff" strokeWidth={3} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <p className="truncate font-sans text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {marker.name}
          </p>
          <span className="tnum font-display text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {formatValue(hit.value, marker)}
          </span>
          <span className="font-sans text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
            {marker.unit}
          </span>
        </div>
        <p className="truncate font-mono text-[10px]" style={{ color: 'var(--color-ash)' }}>
          {hit.line}
        </p>
        {hit.converted && (
          <p className="font-sans text-[10px]" style={{ color: 'var(--color-pulse)' }}>
            converted from {hit.unit}
          </p>
        )}
        {unsure && (
          <p className="font-sans text-[10px] font-semibold" style={{ color: 'var(--status-borderline)' }}>
            Not sure about this one — check it
          </p>
        )}
      </div>

      <StatusPill status={hit.status} size="sm" />
    </button>
  );
}
