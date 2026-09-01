// Your data belongs to you and lives only on this device — so it has to be
// possible to get all of it out, in a form that goes back in cleanly.
//
// Export is a plain JSON document. Import validates every row before it writes
// anything: a malformed backup must fail loudly and change nothing, never
// half-import and leave a mangled history.

import { MARKER_BY_KEY } from '../data/markers.js';
import { isDateKey } from './dates.js';

export const BACKUP_VERSION = 2;
export const BACKUP_KIND = 'healthtrace-backup';

export function buildBackup({ profiles = [], reports = [], readings = [], targets = [], settings = null } = {}) {
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profiles,
    settings,
    reports,
    readings,
    targets,
  };
}

/**
 * Validate a parsed backup document.
 * @returns {{ ok: boolean, errors: string[], data?: object, skipped: string[] }}
 */
export function validateBackup(input) {
  const errors = [];
  const skipped = [];

  let doc = input;
  if (typeof input === 'string') {
    try {
      doc = JSON.parse(input);
    } catch {
      return { ok: false, errors: ['That file is not valid JSON.'], skipped };
    }
  }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, errors: ['That file is not a HealthTrace backup.'], skipped };
  }
  if (doc.kind !== BACKUP_KIND) {
    return { ok: false, errors: ['That file is not a HealthTrace backup.'], skipped };
  }
  if (!Number.isInteger(doc.version) || doc.version < 1) {
    return { ok: false, errors: ['This backup has no usable version number.'], skipped };
  }
  if (doc.version > BACKUP_VERSION) {
    return {
      ok: false,
      errors: [`This backup was made by a newer version of HealthTrace (v${doc.version}). Update the app first.`],
      skipped,
    };
  }
  if (!Array.isArray(doc.reports) || !Array.isArray(doc.readings)) {
    return { ok: false, errors: ['This backup is missing its reports or readings.'], skipped };
  }

  // A v1 file predates households: it holds one unnamed person under `profile`.
  // Lift it into the v2 shape so there is one code path from here on, and so a
  // backup taken before this feature existed still restores cleanly.
  const rawProfiles = Array.isArray(doc.profiles)
    ? doc.profiles
    : doc.profile
      ? [{ ...doc.profile, id: doc.profile.id ?? LEGACY_PROFILE_ID }]
      : [];
  const legacy = !Array.isArray(doc.profiles);

  const profiles = [];
  const profileIds = new Set();
  rawProfiles.forEach((profile, index) => {
    const clean = validateProfile(profile);
    if (!clean) {
      skipped.push(`Profile ${index + 1}: not usable.`);
      return;
    }
    const id = profile?.id ?? index + 1;
    profiles.push({ ...clean, id });
    profileIds.add(id);
  });

  // In a v1 file nothing carries a profileId, so everything belongs to the one
  // person it described.
  const soleOwner = profiles.length === 1 ? profiles[0].id : null;
  const ownerFor = (value) => {
    if (legacy) return soleOwner;
    return profileIds.has(value) ? value : soleOwner;
  };

  const reports = [];
  const reportIds = new Set();
  doc.reports.forEach((report, index) => {
    if (!report || typeof report !== 'object') {
      skipped.push(`Report ${index + 1}: not an object.`);
      return;
    }
    if (!isDateKey(report.date)) {
      skipped.push(`Report ${index + 1}: "${report.date}" is not a valid date.`);
      return;
    }
    reports.push({
      id: report.id,
      profileId: ownerFor(report.profileId),
      date: report.date,
      title: typeof report.title === 'string' ? report.title : '',
      lab: typeof report.lab === 'string' ? report.lab : '',
      doctor: typeof report.doctor === 'string' ? report.doctor : '',
      note: typeof report.note === 'string' ? report.note : '',
      createdAt: Number.isFinite(report.createdAt) ? report.createdAt : Date.now(),
    });
    if (report.id != null) reportIds.add(report.id);
  });

  const readings = [];
  doc.readings.forEach((reading, index) => {
    if (!reading || typeof reading !== 'object') {
      skipped.push(`Reading ${index + 1}: not an object.`);
      return;
    }
    if (!MARKER_BY_KEY[reading.markerKey]) {
      skipped.push(`Reading ${index + 1}: unknown marker "${reading.markerKey}".`);
      return;
    }
    if (!isDateKey(reading.date)) {
      skipped.push(`Reading ${index + 1}: "${reading.date}" is not a valid date.`);
      return;
    }
    if (typeof reading.value !== 'number' || !Number.isFinite(reading.value)) {
      skipped.push(`Reading ${index + 1}: "${reading.value}" is not a number.`);
      return;
    }
    readings.push({
      profileId: ownerFor(reading.profileId),
      markerKey: reading.markerKey,
      date: reading.date,
      value: reading.value,
      // A reading pointing at a report that did not survive validation becomes
      // a standalone reading rather than a dangling reference.
      reportId: reportIds.has(reading.reportId) ? reading.reportId : null,
      note: typeof reading.note === 'string' ? reading.note : '',
      createdAt: Number.isFinite(reading.createdAt) ? reading.createdAt : Date.now(),
    });
  });

  const targets = [];
  for (const target of Array.isArray(doc.targets) ? doc.targets : []) {
    if (!target || typeof target !== 'object') continue;
    if (!MARKER_BY_KEY[target.markerKey]) {
      skipped.push(`Target for unknown marker "${target.markerKey}".`);
      continue;
    }
    const min = Number.isFinite(target.min) ? target.min : null;
    const max = Number.isFinite(target.max) ? target.max : null;
    if (min == null && max == null) continue;
    targets.push({ profileId: ownerFor(target.profileId), markerKey: target.markerKey, min, max });
  }

  if (!reports.length && !readings.length && !profiles.length) {
    errors.push('There was nothing importable in that backup.');
  }

  return {
    ok: errors.length === 0,
    errors,
    skipped,
    legacy,
    data: {
      profiles,
      settings: doc.settings && typeof doc.settings === 'object' ? doc.settings : null,
      reports,
      readings,
      targets,
    },
  };
}

// The id a v1 backup's single, unnamed person is given so the rows lifted out
// of it have something to point at.
const LEGACY_PROFILE_ID = 1;

function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const sex = profile.sex === 'male' || profile.sex === 'female' ? profile.sex : null;
  return {
    name: typeof profile.name === 'string' ? profile.name : '',
    relation: typeof profile.relation === 'string' ? profile.relation : '',
    dob: isDateKey(profile.dob) ? profile.dob : '',
    sex,
    heightCm: Number.isFinite(profile.heightCm) ? profile.heightCm : null,
    conditions: typeof profile.conditions === 'string' ? profile.conditions : '',
    medications: typeof profile.medications === 'string' ? profile.medications : '',
    color: typeof profile.color === 'string' ? profile.color : null,
    createdAt: Number.isFinite(profile.createdAt) ? profile.createdAt : Date.now(),
  };
}

export function backupFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `healthtrace-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}
