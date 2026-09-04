import Dexie from 'dexie';

// One database, on this device, and nowhere else. There is no account, no
// server and no sync — so this file is the whole storage story.
export const db = new Dexie('HealthTraceDB');

// Schema versions are append-only: add a new db.version(n) block for a change,
// never edit one that has already shipped, or an existing install will fail its
// upgrade and take the user's history with it.
//
// Only fields that are QUERIED get indexed. Everything else (a report's lab
// name, a reading's note) lives on the row unindexed.
db.version(1).stores({
  // Single row. Name, date of birth, sex and height — the inputs eGFR and BMI
  // need, and nothing more.
  profile: '++id',

  // A checkup event: one visit, one date, many readings.
  reports: '++id, date, createdAt',

  // The actual data. Indexed by marker (trends), date (history), report
  // (detail screen), and the pair (de-duplicating an import).
  readings: '++id, markerKey, date, reportId, [markerKey+date]',

  // Doctor-set targets that override a marker's population reference range.
  targets: '++id, &markerKey',

  // The original PDF or photo of a report, kept as a Blob so the source
  // document stays with the numbers. Excluded from JSON backups — blobs are
  // heavy and the numbers are what matter.
  attachments: '++id, reportId',
});

// v2: households. `profile` becomes a table of PEOPLE rather than a single row,
// and every report, reading and target belongs to one of them.
//
// The upgrade hands all existing data to the profile that already exists, so an
// install from v1 opens on exactly the history it had, now owned by a person.
// Nothing is deleted and nothing is re-keyed.
db.version(2)
  .stores({
    profile: '++id, name, createdAt',
    reports: '++id, profileId, date, createdAt, [profileId+date]',
    // [profileId+markerKey] is the index every trend query uses; the old
    // [markerKey+date] pair was never queried and is dropped.
    readings: '++id, profileId, markerKey, date, reportId, [profileId+markerKey]',
    // markerKey loses its unique constraint: two people may each set a target
    // for the same marker. The pair is what has to be unique now.
    targets: '++id, profileId, markerKey, [profileId+markerKey]',
    attachments: '++id, reportId',
  })
  .upgrade(async (tx) => {
    const existing = await tx.table('profile').toArray();
    if (!existing.length) return;
    const ownerId = existing[0].id;
    await tx.table('profile').update(ownerId, { createdAt: Date.now() });
    for (const table of ['reports', 'readings', 'targets']) {
      await tx.table(table).toCollection().modify({ profileId: ownerId });
    }
  });

// v3: the lock. One row, or none — a salt and the WRAPPED data key, never the
// key itself and never the passphrase. Purely additive, so an existing install
// upgrades without a byte of its health history being touched, and anyone who
// never turns the lock on simply has an empty table.
//
// Dexie carries unchanged stores forward, so only the new one is named here.
db.version(3).stores({
  vault: '++id',
});

// When a newer tab or build wants to upgrade the schema, close this older
// connection and reload, so the upgrade isn't blocked and left stuck.
if (typeof window !== 'undefined') {
  db.on('versionchange', () => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    window.location.reload();
  });
  db.on('blocked', () => {
    console.warn('HealthTraceDB upgrade is blocked by another open tab.');
  });
}

export const DEFAULT_PROFILE = {
  name: '',
  relation: '',
  dob: '',
  sex: null,
  heightCm: null,
  conditions: '',
  medications: '',
  color: null,
};

// Avatar colours, assigned in order as people are added so a household of five
// is five distinguishable circles rather than five identical ones.
export const PROFILE_COLORS = [
  '#4F46E5', // indigo
  '#0D9488', // teal
  '#D97706', // amber
  '#DB2777', // pink
  '#7C3AED', // violet
  '#0891B2', // cyan
  '#B45309', // bronze
  '#4338CA', // deep indigo
];

export function nextProfileColor(existing = []) {
  const used = new Set(existing.map((p) => p.color).filter(Boolean));
  return PROFILE_COLORS.find((color) => !used.has(color)) ?? PROFILE_COLORS[existing.length % PROFILE_COLORS.length];
}

// The initials shown in a profile's circle. Falls back to a person icon at the
// call site when there is no name yet.
export function initialsOf(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// listProfiles / getProfile / saveProfile now live in db/actions.js. They read
// and write rows, and with the lock on that means sealing and opening them —
// which db.js cannot do without importing the vault, which imports db.js.
