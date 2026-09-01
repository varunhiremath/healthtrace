// Turning a marker into something you can send to your family.
//
// Sharing is the one place this app deliberately sends health data OUTWARD, so
// two rules apply. Every share is explicit and per-item — nothing is ever
// shared in bulk or in the background. And the recipient gets the CONTEXT with
// the number: a bare "LDL 141" means nothing to a relative, while "LDL 141
// mg/dL — above range, usual range under 100" is readable by anyone.
//
// Pure: builds the words, and nothing else. Drawing and the Web Share call live
// in the component, so what gets said can be tested without a browser.

import { getMarker } from '../data/markers.js';
import { formatValue, formatRange, statusMeta, classify } from './ranges.js';
import { displayUnit, toDisplay } from './units.js';
import { formatDate } from './dates.js';

/**
 * The lines that make up a shared marker card.
 *
 * `includeName` is off by default: the number is the point, and a name turns a
 * lab value into an identifiable health record the moment it leaves the device.
 */
export function buildMarkerShare({ row, sex, units = {}, profileName = '', includeName = false } = {}) {
  if (!row) return null;
  const marker = row.marker ?? getMarker(row.markerKey);
  if (!marker) return null;

  const unit = displayUnit(marker, units);
  const shown = toDisplay(row.value, marker, units);
  const status = row.status ?? classify(row.value, marker, sex);
  const range = formatRange(marker, sex);

  const who = includeName && profileName ? profileName.trim() : '';
  const delta = row.delta ? describeDelta(row.delta, marker) : null;

  const lines = [
    `${marker.name}: ${formatValue(shown, marker)} ${unit}`,
    `${statusMeta(status).label}${range ? ` (usual range ${range} ${unit})` : ''}`,
  ];
  if (delta) lines.push(delta);
  if (row.date) lines.push(`Measured ${formatDate(row.date)}`);

  return {
    who,
    title: marker.name,
    value: formatValue(shown, marker),
    unit,
    status,
    statusLabel: statusMeta(status).label,
    rangeLabel: range ? `Usual range ${range} ${unit}` : 'No general reference range',
    dateLabel: row.date ? formatDate(row.date) : '',
    deltaLabel: delta ?? '',
    // What goes in the message body, and in the text-only fallback.
    text: [who ? `${who} — ${lines[0]}` : lines[0], ...lines.slice(1)].join('\n'),
  };
}

function describeDelta(delta, marker) {
  if (!delta || !Number.isFinite(delta.change) || delta.change === 0) return null;
  const sign = delta.change > 0 ? '+' : '';
  const direction =
    delta.direction === 'better' ? ' — moving the right way' : delta.direction === 'worse' ? ' — moving the wrong way' : '';
  return `${sign}${formatValue(delta.change, marker)} ${marker.unit} since the previous reading${direction}`;
}

/**
 * A whole-panel summary: how many markers are in range, and what is not.
 * Capped, because a message listing forty markers is not a message anyone reads.
 */
export function buildSnapshotShare({ rows = [], profileName = '', includeName = false, limit = 6 } = {}) {
  const scorable = rows.filter((row) => row.status !== 'unknown');
  if (!scorable.length) return null;

  const inRange = scorable.filter((row) => row.status === 'optimal');
  const flagged = scorable.filter((row) => row.status !== 'optimal');
  const who = includeName && profileName ? profileName.trim() : '';

  const header = `${who ? `${who}: ` : ''}${inRange.length} of ${scorable.length} markers in range`;
  const body = flagged.slice(0, limit).map((row) => {
    const marker = row.marker ?? getMarker(row.markerKey);
    return `• ${marker.name}: ${formatValue(row.value, marker)} ${marker.unit} (${statusMeta(row.status).label.toLowerCase()})`;
  });
  const more = flagged.length > limit ? [`…and ${flagged.length - limit} more`] : [];

  return {
    who,
    inRange: inRange.length,
    total: scorable.length,
    flagged: flagged.length,
    text: [header, ...(body.length ? ['', 'Outside range:'] : []), ...body, ...more].join('\n'),
  };
}

/**
 * How this device can share, given what its browser supports.
 *
 * Android Chrome can share an image file straight into WhatsApp; desktop
 * browsers usually cannot, and some can share text but not files. Deciding this
 * from an injected navigator keeps it testable, and keeps the component from
 * guessing.
 */
export function pickShareStrategy(nav, file) {
  if (!nav) return 'download';
  const canShare = typeof nav.share === 'function';
  if (canShare && file && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    return 'file';
  }
  if (canShare) return 'text';
  if (nav.clipboard && typeof nav.clipboard.writeText === 'function') return 'clipboard';
  return 'download';
}
