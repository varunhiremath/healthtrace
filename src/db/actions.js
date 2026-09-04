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
  // Colour is not a secret, so the raw rows are enough to pick the next one —
  // no need to decrypt the household to add to it.
  const existing = await db.profile.toArray();
  return putRow('profile', {
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
  return patchRow('profile', profileId, patch);
}

// Removes a person and everything recorded about them. The household must keep
// at least one profile, so the last one cannot be deleted — the caller is
// expected to have checked, and this refuses rather than leaving the app with
// nobody to show.
export async function deleteProfile(profileId) {
  const remaining = await db.profile.count();
  if (remaining <= 1) {
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

import { db, DEFAULT_PROFILE, PROFILE_COLORS, nextProfileColor } from './db.js';
import { sealRow, openRow, openRows } from './vault.js';
import { todayKey } from '../utils/dates.js';

// With the lock on, every write here goes through sealRow and every read
// through openRow. Two rules that break silently if forgotten:
//
//   * SEAL OUTSIDE TRANSACTIONS. WebCrypto returns native promises that settle
//     outside Dexie's transaction zone, so awaiting one inside a transaction
//     lets it commit early, underneath the writes meant to be in it. Every path
//     below prepares and seals first, then opens a transaction containing only
//     Dexie calls.
//   * REPLACE ROWS, NEVER PATCH THEM. A Dexie `update` carrying a plaintext
//     field merges it in beside the sealed blob and leaves the secret on disk.
//     Anything secret is written with `put` and a whole row.

/** Replace a whole row, sealed. */
async function putRow(table, row) {
  return db[table].put(await sealRow(table, row));
}

/** Read-modify-write: open the row, apply the patch, put the whole thing back. */
async function patchRow(table, id, patch) {
  const current = await openRow(table, await db[table].get(id));
  if (!current) throw new Error('That no longer exists.');
  return putRow(table, { ...current, ...patch });
}

/* --------------------------------------------------------------- profiles */

// These three moved here from db.js when the lock arrived: they read and write
// rows, which now means sealing and opening them, and db.js cannot import the
// vault without a cycle.

export async function listProfiles() {
  const rows = await openRows('profile', await db.profile.toArray());
  return rows
    .map((row) => ({ ...DEFAULT_PROFILE, ...row }))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

// Resolve the person the app is currently showing. Falls back to the first
// profile when the remembered one has been deleted, and creates one on a fresh
// install so the rest of the app never has to handle "no profile at all".
export async function getProfile(profileId) {
  const rows = await listProfiles();
  if (rows.length) {
    return rows.find((row) => row.id === profileId) ?? rows[0];
  }
  const id = await putRow('profile', { ...DEFAULT_PROFILE, color: PROFILE_COLORS[0], createdAt: Date.now() });
  return { ...DEFAULT_PROFILE, id, color: PROFILE_COLORS[0] };
}

export async function saveProfile(profileId, patch) {
  const current = await getProfile(profileId);
  await patchRow('profile', current.id, patch);
  return { ...current, ...patch };
}

/* --------------------------------------------------------------- readings */

export async function addReading({ profileId, markerKey, value, date = todayKey(), reportId = null, note = '' }) {
  if (profileId == null) throw new Error('addReading needs a profileId.');
  return putRow('readings', {
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
  return patchRow('readings', id, patch);
}

export async function deleteReading(id) {
  return db.readings.delete(id);
}

/* ---------------------------------------------------------------- reports */

// Create a report and its readings together. Either the whole report lands or
// none of it does.
export async function addReport({ profileId, date = todayKey(), title = '', lab = '', doctor = '', note = '' }, readings = []) {
  if (profileId == null) throw new Error('addReport needs a profileId.');
  // The id is assigned here rather than by the database, so the report AND its
  // readings can be sealed before the transaction opens — keeping the "all or
  // nothing" promise that the encryption would otherwise break.
  const last = await db.reports.orderBy('id').last();
  const reportId = (last?.id ?? 0) + 1;

  const sealedReport = await sealRow('reports', {
    id: reportId,
    profileId,
    date,
    title,
    lab,
    doctor,
    note,
    createdAt: Date.now(),
  });
  const sealedReadings = await Promise.all(
    readings.map((r) =>
      sealRow('readings', {
        profileId,
        markerKey: r.markerKey,
        value: r.value,
        note: r.note ?? '',
        date,
        reportId,
        createdAt: Date.now(),
      })
    )
  );

  await db.transaction('rw', db.reports, db.readings, async () => {
    await db.reports.put(sealedReport);
    if (sealedReadings.length) await db.readings.bulkAdd(sealedReadings);
  });
  return reportId;
}

// Editing a report's date moves its readings with it — a reading's date must
// always match the report it belongs to, or trends would show it twice.
export async function updateReport(id, patch) {
  // Sealed before the transaction; `carried` touches only clear fields, so it
  // can stay a plain modify.
  const current = await openRow('reports', await db.reports.get(id));
  if (!current) return undefined;
  const sealed = await sealRow('reports', { ...current, ...patch });

  return db.transaction('rw', db.reports, db.readings, async () => {
    await db.reports.put(sealed);
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
  // `date` and `profileId` are structural and stay in the clear, so the report
  // does not have to be decrypted to be consulted.
  const report = await db.reports.get(reportId);
  const when = date ?? report?.date ?? todayKey();
  // The report owns its readings, so the person is taken from it rather than
  // passed in — the two can never disagree.
  const profileId = report?.profileId ?? null;

  const sealed = await Promise.all(
    readings.map((r) =>
      sealRow('readings', {
        profileId,
        markerKey: r.markerKey,
        value: r.value,
        note: r.note ?? '',
        date: when,
        reportId,
        createdAt: Date.now(),
      })
    )
  );

  return db.transaction('rw', db.reports, db.readings, async () => {
    await db.readings.where('reportId').equals(reportId).delete();
    if (sealed.length) await db.readings.bulkAdd(sealed);
  });
}

/* ---------------------------------------------------------------- targets */

export async function setTarget(profileId, markerKey, { min = null, max = null } = {}) {
  if (profileId == null) throw new Error('setTarget needs a profileId.');
  const existing = await db.targets.where('[profileId+markerKey]').equals([profileId, markerKey]).first();
  const row = { profileId, markerKey, min, max };
  if (existing) row.id = existing.id;
  return putRow('targets', row);
}

export async function clearTarget(profileId, markerKey) {
  return db.targets.where('[profileId+markerKey]').equals([profileId, markerKey]).delete();
}

/* ------------------------------------------------------------ attachments */

export async function addAttachment(reportId, file) {
  // sealRow turns `blob` into encrypted bytes when the lock is on. `size` stays
  // in the clear so the UI can say how big a file is without opening it.
  return putRow('attachments', {
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
  const replacing = mode === 'replace';

  // ---- resolve and seal, before any transaction opens --------------------
  //
  // Ids are assigned here rather than by the database. Sealing is async and
  // would commit a Dexie transaction early, so the whole import has to be
  // worked out up front — which also means the write itself stays atomic.

  // Only colours and ids are read here, and neither is a secret, so this needs
  // no key even before the household has been decrypted.
  const rawProfiles = await db.profile.toArray();
  let nextProfileId = rawProfiles.reduce((max, row) => Math.max(max, row.id ?? 0), 0) + 1;

  const profileMap = new Map();
  const newProfiles = [];

  if (intoProfileId != null) {
    // Everything in the file lands on one existing person.
    for (const profile of data.profiles ?? []) profileMap.set(profile.id, intoProfileId);
    profileMap.set(null, intoProfileId);
    profileMap.set(undefined, intoProfileId);
  } else {
    const taken = [...rawProfiles];
    for (const profile of data.profiles ?? []) {
      const { id, ...rest } = profile;
      const row = {
        ...DEFAULT_PROFILE,
        ...rest,
        id: nextProfileId++,
        color: rest.color ?? nextProfileColor(taken),
        createdAt: rest.createdAt ?? Date.now(),
      };
      taken.push(row);
      newProfiles.push(row);
      profileMap.set(id, row.id);
    }
  }

  // Anything the file did not attribute goes to the first person imported, or
  // to whoever is already here — never to nobody.
  const fallbackProfileId = intoProfileId ?? newProfiles[0]?.id ?? rawProfiles[0]?.id ?? null;
  const ownerOf = (id) => profileMap.get(id) ?? fallbackProfileId;

  const lastReport = await db.reports.orderBy('id').last();
  let nextReportId = (lastReport?.id ?? 0) + 1;

  const reportMap = new Map();
  const newReports = [];
  for (const report of data.reports) {
    const { id, profileId, ...rest } = report;
    const row = { ...rest, id: nextReportId++, profileId: ownerOf(profileId) };
    newReports.push(row);
    if (id != null) reportMap.set(id, row.id);
  }

  // The file's own row ids are dropped rather than carried over: they belong to
  // the database the backup came from and would collide with what is already
  // here.
  const newReadings = data.readings.map((reading) => {
    const { id, ...rest } = reading;
    return {
      ...rest,
      profileId: ownerOf(reading.profileId),
      reportId: reading.reportId != null ? (reportMap.get(reading.reportId) ?? null) : null,
    };
  });

  const newTargets = (data.targets ?? []).map((target) => {
    const { id, profileId, ...rest } = target;
    return { ...rest, profileId: ownerOf(profileId) };
  });

  const sealedProfiles = await Promise.all(newProfiles.map((row) => sealRow('profile', row)));
  const sealedReports = await Promise.all(newReports.map((row) => sealRow('reports', row)));
  const sealedReadings = await Promise.all(newReadings.map((row) => sealRow('readings', row)));
  const sealedTargets = await Promise.all(newTargets.map((row) => sealRow('targets', row)));

  // ---- one transaction, Dexie calls only ---------------------------------
  await db.transaction('rw', db.profile, db.reports, db.readings, db.targets, db.attachments, async () => {
    if (replacing) {
      const reportIds = await db.reports.toCollection().primaryKeys();
      if (reportIds.length) await db.attachments.where('reportId').anyOf(reportIds).delete();
      await Promise.all([db.reports.clear(), db.readings.clear(), db.targets.clear()]);
      // Profiles are only cleared when the file brings its own people to
      // replace them; otherwise the household stays and just loses its data.
      if (!intoProfileId && data.profiles?.length) await db.profile.clear();
    }

    if (sealedProfiles.length) await db.profile.bulkPut(sealedProfiles);
    if (sealedReports.length) await db.reports.bulkPut(sealedReports);
    if (sealedReadings.length) await db.readings.bulkAdd(sealedReadings);
    if (sealedTargets.length) await db.targets.bulkAdd(sealedTargets);
  });

  return {
    profiles: intoProfileId ? 0 : (data.profiles?.length ?? 0),
    reports: newReports.length,
    readings: newReadings.length,
  };
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
