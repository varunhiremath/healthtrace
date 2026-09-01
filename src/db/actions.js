// Every write to the database goes through this file.
//
// The rule that matters here: DELETES MUST LEAVE NOTHING BEHIND. Deleting a
// report deletes its readings and its attachment in one transaction, so a
// half-deleted report can never exist. Deleting a PERSON deletes their reports,
// readings, targets and attachments the same way. Derived markers (BMI, eGFR,
// non-HDL) need no cleanup at all because they are computed at read time and
// never stored — remove the readings and the derived values simply stop
// existing.
//
// Every row that belongs to somebody carries `profileId`. Nothing in this file
// writes a row without one, because a reading that belongs to no one would show
// up in nobody's history and be impossible to find again.

/* --------------------------------------------------------------- profiles */

export async function addProfile({ name = '', relation = '', dob = '', sex = null, heightCm = null } = {}) {
  const existing = await listProfiles();
  return db.profile.add({
    ...DEFAULT_PROFILE,
    name,
    relation,
    dob,
    sex,
    heightCm,
    color: nextProfileColor(existing),
    createdAt: Date.now(),
  });
}

export async function updateProfile(profileId, patch) {
  return db.profile.update(profileId, patch);
}

// Removes a person and everything recorded about them. The household must keep
// at least one profile, so the last one cannot be deleted — the caller is
// expected to have checked, and this refuses rather than leaving the app with
// nobody to show.
export async function deleteProfile(profileId) {
  const profiles = await listProfiles();
  if (profiles.length <= 1) {
    throw new Error('The last profile cannot be deleted.');
  }
  return db.transaction('rw', db.profile, db.reports, db.readings, db.targets, db.attachments, async () => {
    const reportIds = await db.reports.where('profileId').equals(profileId).primaryKeys();
    if (reportIds.length) await db.attachments.where('reportId').anyOf(reportIds).delete();
    await db.readings.where('profileId').equals(profileId).delete();
    await db.reports.where('profileId').equals(profileId).delete();
    await db.targets.where('profileId').equals(profileId).delete();
    await db.profile.delete(profileId);
  });
}

import { db, DEFAULT_PROFILE, nextProfileColor, listProfiles } from './db.js';
import { todayKey } from '../utils/dates.js';

/* --------------------------------------------------------------- readings */

export async function addReading({ profileId, markerKey, value, date = todayKey(), reportId = null, note = '' }) {
  if (profileId == null) throw new Error('addReading needs a profileId.');
  return db.readings.add({
    profileId,
    markerKey,
    value,
    date,
    reportId,
    note,
    createdAt: Date.now(),
  });
}

export async function updateReading(id, patch) {
  return db.readings.update(id, patch);
}

export async function deleteReading(id) {
  return db.readings.delete(id);
}

/* ---------------------------------------------------------------- reports */

// Create a report and its readings together. Either the whole report lands or
// none of it does.
export async function addReport({ profileId, date = todayKey(), title = '', lab = '', doctor = '', note = '' }, readings = []) {
  if (profileId == null) throw new Error('addReport needs a profileId.');
  return db.transaction('rw', db.reports, db.readings, async () => {
    const reportId = await db.reports.add({
      profileId,
      date,
      title,
      lab,
      doctor,
      note,
      createdAt: Date.now(),
    });
    if (readings.length) {
      await db.readings.bulkAdd(
        readings.map((r) => ({
          profileId,
          markerKey: r.markerKey,
          value: r.value,
          note: r.note ?? '',
          date,
          reportId,
          createdAt: Date.now(),
        }))
      );
    }
    return reportId;
  });
}

// Editing a report's date moves its readings with it — a reading's date must
// always match the report it belongs to, or trends would show it twice.
export async function updateReport(id, patch) {
  return db.transaction('rw', db.reports, db.readings, async () => {
    await db.reports.update(id, patch);
    // A reading's date and owner must always match the report it came from, or
    // it would show on the wrong day, or in the wrong person's history.
    const carried = {};
    if (patch.date) carried.date = patch.date;
    if (patch.profileId != null) carried.profileId = patch.profileId;
    if (Object.keys(carried).length) {
      await db.readings.where('reportId').equals(id).modify(carried);
    }
  });
}

// Deletes the report, every reading taken from it, and its stored original.
export async function deleteReport(id) {
  return db.transaction('rw', db.reports, db.readings, db.attachments, async () => {
    await db.readings.where('reportId').equals(id).delete();
    await db.attachments.where('reportId').equals(id).delete();
    await db.reports.delete(id);
  });
}

// Replace the readings of an existing report wholesale (used by the editor).
export async function replaceReportReadings(reportId, readings, date) {
  return db.transaction('rw', db.reports, db.readings, async () => {
    const report = await db.reports.get(reportId);
    const when = date ?? report?.date ?? todayKey();
    // The report owns its readings, so the person is taken from it rather than
    // passed in — the two can never disagree.
    const profileId = report?.profileId ?? null;
    await db.readings.where('reportId').equals(reportId).delete();
    if (readings.length) {
      await db.readings.bulkAdd(
        readings.map((r) => ({
          profileId,
          markerKey: r.markerKey,
          value: r.value,
          note: r.note ?? '',
          date: when,
          reportId,
          createdAt: Date.now(),
        }))
      );
    }
  });
}

/* ---------------------------------------------------------------- targets */

export async function setTarget(profileId, markerKey, { min = null, max = null } = {}) {
  if (profileId == null) throw new Error('setTarget needs a profileId.');
  const existing = await db.targets.where('[profileId+markerKey]').equals([profileId, markerKey]).first();
  if (existing) return db.targets.update(existing.id, { min, max });
  return db.targets.add({ profileId, markerKey, min, max });
}

export async function clearTarget(profileId, markerKey) {
  return db.targets.where('[profileId+markerKey]').equals([profileId, markerKey]).delete();
}

/* ------------------------------------------------------------ attachments */

export async function addAttachment(reportId, file) {
  return db.attachments.add({
    reportId,
    name: file.name,
    type: file.type,
    size: file.size,
    blob: file,
    createdAt: Date.now(),
  });
}

export async function deleteAttachment(id) {
  return db.attachments.delete(id);
}

/* ------------------------------------------------------------ bulk import */

// Import a validated backup. `mode` is 'merge' (keep what is there) or
// 'replace' (wipe first). Runs as one transaction either way, so a failure
// part-way leaves the existing data untouched.
//
// A backup carries whole people. Old ids cannot be reused — they may collide
// with rows already here — so profiles, reports and readings are all re-keyed
// together and the links between them rebuilt as we go.
//
// `intoProfileId` handles the single-person case: a v1 file, or a v2 file the
// user chose to file under somebody who already exists.
export async function importBackup(data, { mode = 'merge', intoProfileId = null } = {}) {
  return db.transaction('rw', db.profile, db.reports, db.readings, db.targets, db.attachments, async () => {
    if (mode === 'replace') {
      const reportIds = await db.reports.toCollection().primaryKeys();
      if (reportIds.length) await db.attachments.where('reportId').anyOf(reportIds).delete();
      await Promise.all([db.reports.clear(), db.readings.clear(), db.targets.clear()]);
      // Profiles are only cleared when the file brings its own people to
      // replace them; otherwise the household stays and just loses its data.
      if (!intoProfileId && data.profiles?.length) await db.profile.clear();
    }

    const profileMap = new Map();
    if (intoProfileId != null) {
      // Everything in the file lands on one existing person.
      for (const profile of data.profiles ?? []) profileMap.set(profile.id, intoProfileId);
      profileMap.set(null, intoProfileId);
      profileMap.set(undefined, intoProfileId);
    } else {
      const existing = await listProfiles();
      for (const profile of data.profiles ?? []) {
        const { id, ...rest } = profile;
        const newId = await db.profile.add({
          ...DEFAULT_PROFILE,
          ...rest,
          color: rest.color ?? nextProfileColor([...existing, ...(await listProfiles())]),
          createdAt: rest.createdAt ?? Date.now(),
        });
        profileMap.set(id, newId);
      }
    }

    // Anything the file did not attribute goes to the first person imported, or
    // to whoever is already here — never to nobody.
    const fallbackProfileId =
      intoProfileId ?? profileMap.values().next().value ?? (await listProfiles())[0]?.id ?? null;
    const ownerOf = (id) => profileMap.get(id) ?? fallbackProfileId;

    const reportMap = new Map();
    for (const report of data.reports) {
      const { id, profileId, ...rest } = report;
      const newId = await db.reports.add({ ...rest, profileId: ownerOf(profileId) });
      if (id != null) reportMap.set(id, newId);
    }

    const readings = data.readings.map((reading) => ({
      ...reading,
      profileId: ownerOf(reading.profileId),
      reportId: reading.reportId != null ? (reportMap.get(reading.reportId) ?? null) : null,
    }));
    if (readings.length) await db.readings.bulkAdd(readings);

    for (const target of data.targets ?? []) {
      const { id, profileId, ...rest } = target;
      await db.targets.add({ ...rest, profileId: ownerOf(profileId) });
    }

    return {
      profiles: intoProfileId ? 0 : (data.profiles?.length ?? 0),
      reports: data.reports.length,
      readings: readings.length,
    };
  });
}

// Wipe everything, for everybody. Used only from Settings, behind a
// confirmation that names how much is about to go.
export async function eraseAllData() {
  return db.transaction('rw', db.profile, db.reports, db.readings, db.targets, db.attachments, async () => {
    await Promise.all([
      db.profile.clear(),
      db.reports.clear(),
      db.readings.clear(),
      db.targets.clear(),
      db.attachments.clear(),
    ]);
  });
}

// Erase one person's readings and reports but keep the person. Useful when a
// bad import needs undoing without losing who they are.
export async function eraseProfileData(profileId) {
  return db.transaction('rw', db.reports, db.readings, db.targets, db.attachments, async () => {
    const reportIds = await db.reports.where('profileId').equals(profileId).primaryKeys();
    if (reportIds.length) await db.attachments.where('reportId').anyOf(reportIds).delete();
    await db.readings.where('profileId').equals(profileId).delete();
    await db.reports.where('profileId').equals(profileId).delete();
    await db.targets.where('profileId').equals(profileId).delete();
  });
}
