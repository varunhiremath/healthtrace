// CSV export, for spreadsheets and for handing a doctor a table they can read.
// Import accepts the same shape it exports, so a round trip is lossless.

import { MARKER_BY_KEY, getMarker } from '../data/markers.js';
import { classify } from './ranges.js';
import { isDateKey } from './dates.js';

export const CSV_HEADERS = ['date', 'marker', 'name', 'value', 'unit', 'status', 'note'];

// Wrap a field only when it needs it, and double any embedded quotes. A value
// starting with =, +, - or @ is prefixed with a quote so a spreadsheet treats
// it as text rather than a formula.
export function escapeCsv(value) {
  const text = value == null ? '' : String(value);
  const risky = /^[=+\-@\t\r]/.test(text);
  const body = risky ? `'${text}` : text;
  if (/[",\n\r]/.test(body)) return `"${body.replace(/"/g, '""')}"`;
  return body;
}

export function toCsv(readings = [], { sex } = {}) {
  const lines = [CSV_HEADERS.join(',')];
  const sorted = [...readings].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const reading of sorted) {
    const marker = getMarker(reading.markerKey);
    if (!marker) continue;
    lines.push(
      [
        reading.date,
        reading.markerKey,
        marker.name,
        reading.value,
        marker.unit,
        classify(reading.value, marker, sex),
        reading.note ?? '',
      ]
        .map(escapeCsv)
        .join(',')
    );
  }
  return lines.join('\n');
}

// A small, correct CSV reader: quoted fields, embedded commas, doubled quotes,
// and CRLF line endings.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const source = String(text ?? '');

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/**
 * Read a CSV back into readings. Same contract as the JSON importer: every row
 * is validated, bad rows are reported rather than guessed at.
 * @returns {{ readings: Array, skipped: string[] }}
 */
export function fromCsv(text) {
  const rows = parseCsv(text);
  const skipped = [];
  if (!rows.length) return { readings: [], skipped: ['That file had no rows.'] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const dateAt = header.indexOf('date');
  const markerAt = header.indexOf('marker');
  const valueAt = header.indexOf('value');
  const noteAt = header.indexOf('note');
  if (dateAt === -1 || markerAt === -1 || valueAt === -1) {
    return { readings: [], skipped: ['That CSV needs at least date, marker and value columns.'] };
  }

  const readings = [];
  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const date = (cells[dateAt] ?? '').trim();
    const markerKey = (cells[markerAt] ?? '').trim();
    const raw = (cells[valueAt] ?? '').trim();
    if (!isDateKey(date)) {
      skipped.push(`Line ${line}: "${date}" is not a YYYY-MM-DD date.`);
      return;
    }
    if (!MARKER_BY_KEY[markerKey]) {
      skipped.push(`Line ${line}: unknown marker "${markerKey}".`);
      return;
    }
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value)) {
      skipped.push(`Line ${line}: "${raw}" is not a number.`);
      return;
    }
    readings.push({
      date,
      markerKey,
      value,
      note: noteAt === -1 ? '' : (cells[noteAt] ?? '').trim(),
      reportId: null,
      createdAt: Date.now(),
    });
  });

  return { readings, skipped };
}
