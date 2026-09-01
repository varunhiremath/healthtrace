import { describe, it, expect } from 'vitest';
import { buildBackup, validateBackup, BACKUP_KIND, BACKUP_VERSION, backupFilename } from './backup.js';

const goodDoc = () =>
  buildBackup({
    profiles: [
      { id: 7, name: 'Alex', relation: 'Me', dob: '1980-01-02', sex: 'male', heightCm: 175 },
      { id: 8, name: 'Dana', relation: 'Mum', dob: '1955-06-09', sex: 'female', heightCm: 160 },
    ],
    reports: [
      { id: 1, profileId: 7, date: '2026-06-20', title: 'Annual', lab: 'Central Lab', createdAt: 1 },
      { id: 2, profileId: 8, date: '2026-05-02', title: 'Checkup', lab: 'Central Lab', createdAt: 2 },
    ],
    readings: [
      { profileId: 7, markerKey: 'ldl', date: '2026-06-20', value: 118, reportId: 1, createdAt: 1 },
      { profileId: 7, markerKey: 'hdl', date: '2026-06-20', value: 44, reportId: 1, createdAt: 1 },
      { profileId: 8, markerKey: 'hba1c', date: '2026-05-02', value: 6.1, reportId: 2, createdAt: 2 },
    ],
    targets: [{ profileId: 7, markerKey: 'ldl', min: null, max: 70 }],
  });

// A backup taken before households existed: one unnamed person under `profile`,
// and nothing carrying a profileId.
const legacyDoc = () => ({
  kind: BACKUP_KIND,
  version: 1,
  exportedAt: '2026-08-31T00:00:00.000Z',
  profile: { name: 'Alex', dob: '1980-01-02', sex: 'male', heightCm: null },
  reports: [{ id: 1, date: '2025-11-04', title: 'Annual physical', lab: 'Central Lab', createdAt: 1 }],
  readings: [
    { markerKey: 'hba1c', date: '2025-11-04', value: 5.9, reportId: 1, createdAt: 1 },
    { markerKey: 'ldl', date: '2025-11-04', value: 89, reportId: 1, createdAt: 1 },
  ],
});

describe('buildBackup', () => {
  it('stamps the document so it can be recognised later', () => {
    const doc = buildBackup({});
    expect(doc.kind).toBe(BACKUP_KIND);
    expect(doc.version).toBe(BACKUP_VERSION);
    expect(typeof doc.exportedAt).toBe('string');
  });
});

describe('validateBackup — accepting good data', () => {
  it('round-trips a household export', () => {
    const result = validateBackup(goodDoc());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.data.profiles).toHaveLength(2);
    expect(result.data.readings).toHaveLength(3);
    expect(result.data.reports).toHaveLength(2);
    expect(result.data.targets).toHaveLength(1);
    expect(result.legacy).toBe(false);
  });

  it('keeps each row with the person it belongs to', () => {
    const { data } = validateBackup(goodDoc());
    expect(data.reports.find((r) => r.title === 'Annual').profileId).toBe(7);
    expect(data.reports.find((r) => r.title === 'Checkup').profileId).toBe(8);
    expect(data.readings.filter((r) => r.profileId === 7)).toHaveLength(2);
    expect(data.readings.filter((r) => r.profileId === 8)).toHaveLength(1);
    expect(data.profiles.find((p) => p.id === 8).relation).toBe('Mum');
  });

  it('accepts the document as a JSON string too', () => {
    expect(validateBackup(JSON.stringify(goodDoc())).ok).toBe(true);
  });
});

describe('validateBackup — v1 files still import', () => {
  it('lifts a single-person v1 backup into the household shape', () => {
    const result = validateBackup(legacyDoc());
    expect(result.ok).toBe(true);
    expect(result.legacy).toBe(true);
    expect(result.data.profiles).toHaveLength(1);
    expect(result.data.profiles[0].name).toBe('Alex');
    expect(result.data.readings).toHaveLength(2);
  });

  it('gives every v1 row to that one person', () => {
    const { data } = validateBackup(legacyDoc());
    const owner = data.profiles[0].id;
    expect(owner).toBeDefined();
    for (const row of [...data.reports, ...data.readings]) {
      expect(row.profileId).toBe(owner);
    }
  });

  it('still reads a v1 file with no profile block at all', () => {
    const doc = legacyDoc();
    delete doc.profile;
    const result = validateBackup(doc);
    expect(result.ok).toBe(true);
    expect(result.data.profiles).toHaveLength(0);
    // With nobody named, rows are left unowned for the importer to place.
    expect(result.data.readings[0].profileId).toBeNull();
  });
});

describe('validateBackup — refusing bad data', () => {
  it('rejects files that are not backups', () => {
    expect(validateBackup('not json').errors[0]).toContain('not valid JSON');
    expect(validateBackup({ hello: 'world' }).errors[0]).toContain('not a HealthTrace backup');
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup([]).ok).toBe(false);
  });

  it('refuses a backup from a newer version rather than mangling it', () => {
    const doc = { ...goodDoc(), version: BACKUP_VERSION + 1 };
    const result = validateBackup(doc);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('newer version');
  });

  it('rejects a document missing its arrays', () => {
    const doc = { ...goodDoc(), readings: undefined };
    expect(validateBackup(doc).errors[0]).toContain('missing its reports or readings');
  });
});

describe('validateBackup — skipping bad rows without failing the import', () => {
  it('drops readings for markers it does not know', () => {
    const doc = goodDoc();
    doc.readings.push({ profileId: 7, markerKey: 'unobtainium', date: '2026-06-20', value: 5 });
    const result = validateBackup(doc);
    expect(result.ok).toBe(true);
    expect(result.data.readings).toHaveLength(3);
    expect(result.skipped[0]).toContain('unknown marker');
  });

  it('drops rows with bad dates and non-numeric values', () => {
    const doc = goodDoc();
    doc.readings.push({ profileId: 7, markerKey: 'ldl', date: '20/06/2026', value: 100 });
    doc.readings.push({ profileId: 7, markerKey: 'ldl', date: '2026-06-20', value: 'one hundred' });
    doc.reports.push({ id: 9, profileId: 7, date: 'whenever' });
    const result = validateBackup(doc);
    expect(result.data.readings).toHaveLength(3);
    expect(result.data.reports).toHaveLength(2);
    expect(result.skipped).toHaveLength(3);
  });

  it('re-homes a row pointing at a person who is not in the file', () => {
    const doc = goodDoc();
    doc.readings.push({ profileId: 999, markerKey: 'tsh', date: '2026-06-20', value: 2.1 });
    const { data } = validateBackup(doc);
    const orphan = data.readings.find((r) => r.markerKey === 'tsh');
    // Two people in the file, so there is no single obvious owner: left for the
    // importer to place rather than guessed at.
    expect(orphan.profileId).toBeNull();
  });

  it('drops a target for a marker that no longer exists', () => {
    const doc = goodDoc();
    doc.targets.push({ profileId: 7, markerKey: 'unobtainium', max: 5 });
    const result = validateBackup(doc);
    expect(result.data.targets).toHaveLength(1);
    expect(result.skipped.some((s) => s.includes('unobtainium'))).toBe(true);
  });

  it('unhooks a reading whose report did not survive validation', () => {
    const doc = goodDoc();
    doc.readings.push({ profileId: 7, markerKey: 'tsh', date: '2026-06-20', value: 2.1, reportId: 404 });
    const result = validateBackup(doc);
    const orphan = result.data.readings.find((r) => r.markerKey === 'tsh');
    expect(orphan.reportId).toBeNull();
  });

  it('reports an empty import as an error, not a success', () => {
    const doc = buildBackup({ profiles: [], reports: [], readings: [] });
    const result = validateBackup(doc);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('nothing importable');
  });

  it('sanitises a profile rather than trusting it', () => {
    const doc = goodDoc();
    doc.profiles = [{ id: 3, name: 42, dob: 'nope', sex: 'other', heightCm: 'tall' }];
    const profile = validateBackup(doc).data.profiles[0];
    expect(profile).toMatchObject({ name: '', dob: '', sex: null, heightCm: null, relation: '' });
  });
});

describe('backupFilename', () => {
  it('is dated and stable', () => {
    expect(backupFilename(new Date(2026, 7, 31))).toBe('healthtrace-2026-08-31.json');
  });
});
