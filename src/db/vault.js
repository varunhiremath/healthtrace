import { db } from './db.js';
import {
  cryptoAvailable,
  randomBytes,
  randomSalt,
  toBase64,
  fromBase64,
  deriveKeyFromPassphrase,
  deriveKeyFromSecret,
  generateDataKey,
  wrapDataKey,
  unwrapDataKey,
  seal,
  open,
  sealBytes,
  openBytes,
  PBKDF2_ITERATIONS,
} from '../utils/crypto.js';

// The lock.
//
// Three things live here: the key's lifecycle (create, unlock, lock), the rule
// for which fields are secret, and the WebAuthn plumbing that lets a fingerprint
// stand in for the passphrase.
//
// The data key is held in a module variable and NOWHERE else. Not in
// localStorage, not in a persisted store, not in a React tree. Locking drops
// it, and the only way back is to derive it again from something you know or
// something the phone's secure element will vouch for.

/**
 * Which fields are secrets, per table.
 *
 * The omissions are as deliberate as the inclusions. Ids, `profileId`, `date`,
 * `reportId` and `markerKey` stay in the clear because Dexie's indexes are
 * built on them — `[profileId+markerKey]` is the lookup every trend depends on,
 * and encrypting it would mean decrypting the entire database to draw one
 * chart.
 *
 * So the honest description, which the Settings screen repeats: someone with
 * this device's storage can see WHICH markers you track and on what dates, but
 * not a single value, name, note, lab or doctor — and not the original report.
 * If the mere fact that a particular marker is tracked would be sensitive, this
 * is the limit of what the lock hides.
 */
const SECRET_FIELDS = {
  profile: ['name', 'relation', 'dob', 'sex', 'heightCm', 'conditions', 'medications'],
  reports: ['title', 'lab', 'doctor', 'note'],
  readings: ['value', 'note'],
  targets: ['min', 'max'],
  // Attachments carry their filename and type in `sec` like everything else,
  // but the file itself takes the binary path below — it is the most sensitive
  // thing the app stores and also the only thing measured in megabytes.
  attachments: ['name', 'type'],
};

const TABLES = Object.keys(SECRET_FIELDS);

let dataKey = null;
const listeners = new Set();

export function onVaultChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce() {
  for (const listener of listeners) listener();
}

/* ------------------------------------------------------------------- state */

export function isUnlocked() {
  return dataKey !== null;
}

export async function readVault() {
  try {
    const rows = await db.vault.toArray();
    return rows[0] ?? null;
  } catch {
    // The table does not exist yet on a database that has not been upgraded.
    return null;
  }
}

export async function hasVault() {
  return (await readVault()) !== null;
}

export function lock() {
  dataKey = null;
  announce();
}

/* ------------------------------------------------------------- row sealing */

/**
 * Encrypt the secret fields of a row, leaving the structural ones alone.
 *
 * With no vault this is the identity function, so every write path can call it
 * unconditionally and there is no encrypted and unencrypted version of the app
 * to keep in step.
 */
export async function sealRow(table, row) {
  if (!dataKey || !row) return row;
  const fields = SECRET_FIELDS[table];
  if (!fields) return row;

  const secrets = {};
  const rest = { ...row };
  for (const field of fields) {
    if (field in rest) {
      secrets[field] = rest[field];
      delete rest[field];
    }
  }

  // The attached original: encrypted as raw bytes, and the Blob replaced by
  // them. `size` stays in the clear so the UI can say how big the file is
  // without opening it.
  if (table === 'attachments' && rest.blob) {
    const bytes = new Uint8Array(await rest.blob.arrayBuffer());
    rest.cipher = await sealBytes(bytes, dataKey);
    delete rest.blob;
  }

  return { ...rest, sec: await seal(secrets, dataKey) };
}

/**
 * Put a sealed row back together.
 *
 * A row with no `sec` passes straight through, which is what makes turning the
 * lock on a migration rather than a rewrite: rows written before it was on are
 * still readable, and get sealed as they are next saved.
 */
export async function openRow(table, row) {
  if (!row || !row.sec) return row;
  if (!dataKey) throw new Error('HealthTrace is locked.');

  const { sec, cipher, ...rest } = row;
  const opened = { ...rest, ...(await open(sec, dataKey)) };

  if (table === 'attachments' && cipher) {
    const bytes = await openBytes(cipher, dataKey);
    opened.blob = new Blob([bytes], { type: opened.type || 'application/octet-stream' });
  }
  return opened;
}

export async function openRows(table, rows = []) {
  return Promise.all(rows.map((row) => openRow(table, row)));
}

/* ------------------------------------------------------------------ set-up */

/**
 * Turn the lock on: mint a data key, wrap it with the passphrase, and encrypt
 * everything already stored.
 *
 * The sealing happens before the transaction opens, and the whole write lands
 * in one. A half-encrypted database — some readings legible, some not, and no
 * key recorded — would be the worst outcome available, so either every row is
 * sealed and the vault row written, or nothing changed at all.
 */
export async function createVault(passphrase) {
  if (!cryptoAvailable()) throw new Error('This browser will not do encryption on an insecure page.');
  if (await hasVault()) throw new Error('HealthTrace is already locked.');
  if (!passphrase || passphrase.length < 8) throw new Error('Use at least 8 characters.');

  const salt = randomSalt();
  const key = await generateDataKey();
  const wrapped = await wrapDataKey(key, await deriveKeyFromPassphrase(passphrase, salt));

  // WebCrypto's promises settle outside Dexie's transaction zone, so awaiting
  // one inside a transaction lets it commit early. Seal first, write second.
  dataKey = key;
  const sealed = {};
  for (const table of TABLES) {
    const rows = await db[table].toArray();
    sealed[table] = await Promise.all(rows.map((row) => sealRow(table, row)));
  }

  try {
    await db.transaction('rw', db.profile, db.reports, db.readings, db.targets, db.attachments, db.vault, async () => {
      for (const table of TABLES) await db[table].bulkPut(sealed[table]);
      await db.vault.put({
        id: 1,
        version: 1,
        salt: toBase64(salt),
        iterations: PBKDF2_ITERATIONS,
        passphraseWrapped: wrapped,
        biometric: null,
        createdAt: Date.now(),
      });
    });
  } catch (error) {
    dataKey = null;
    throw error;
  }

  announce();
}

/**
 * Turn the lock off: decrypt everything back to plain rows and drop the vault.
 *
 * Requires the passphrase even when already unlocked — removing the protection
 * should cost the same proof as using it.
 */
export async function removeVault(passphrase) {
  const vault = await readVault();
  if (!vault) return;
  await keyFromPassphrase(vault, passphrase); // throws if wrong

  const opened = {};
  for (const table of TABLES) {
    const rows = await db[table].toArray();
    opened[table] = await Promise.all(rows.map((row) => openRow(table, row)));
  }

  await db.transaction('rw', db.profile, db.reports, db.readings, db.targets, db.attachments, db.vault, async () => {
    for (const table of TABLES) {
      await db[table].clear();
      await db[table].bulkPut(opened[table]);
    }
    await db.vault.clear();
  });

  // Drop the key too. Leaving it would mean the next reading written in this
  // session was sealed with a key no longer stored anywhere — unreadable after
  // the next reload, and silently so.
  dataKey = null;
  announce();
}

/* ------------------------------------------------------------------ unlock */

async function keyFromPassphrase(vault, passphrase) {
  const wrappingKey = await deriveKeyFromPassphrase(passphrase, fromBase64(vault.salt), vault.iterations);
  // Throws on a wrong passphrase: AES-GCM authenticates, so this is a real
  // check rather than a comparison we could be talked out of.
  return unwrapDataKey(vault.passphraseWrapped, wrappingKey);
}

export async function unlockWithPassphrase(passphrase) {
  const vault = await readVault();
  if (!vault) throw new Error('HealthTrace is not locked.');
  dataKey = await keyFromPassphrase(vault, passphrase);
  announce();
}

export async function changePassphrase(currentPassphrase, nextPassphrase) {
  const vault = await readVault();
  if (!vault) throw new Error('HealthTrace is not locked.');
  if (!nextPassphrase || nextPassphrase.length < 8) throw new Error('Use at least 8 characters.');

  const key = await keyFromPassphrase(vault, currentPassphrase);
  const salt = randomSalt();
  const wrapped = await wrapDataKey(key, await deriveKeyFromPassphrase(nextPassphrase, salt));

  // Only the wrapping changes. Not one stored reading is rewritten, which is
  // the whole reason the data key is a separate random key in the first place.
  await db.vault.update(vault.id, {
    salt: toBase64(salt),
    iterations: PBKDF2_ITERATIONS,
    passphraseWrapped: wrapped,
  });
  dataKey = key;
  announce();
}

/* --------------------------------------------------------------- biometric */

export function biometricPossible() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.PublicKeyCredential) &&
    Boolean(navigator.credentials) &&
    window.isSecureContext
  );
}

export async function platformAuthenticatorAvailable() {
  if (!biometricPossible()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Ask the authenticator to evaluate its PRF for our salt.
 *
 * This is what makes a fingerprint a KEY rather than a checkpoint: the bytes
 * that come back are derived inside the secure element from a secret that never
 * leaves it, so nothing on disk can be used to work them out — which is exactly
 * what a passphrase-derived key cannot promise.
 */
async function evaluatePrf(credentialId, prfSalt) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: credentialId ? [{ type: 'public-key', id: credentialId }] : [],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  const result = assertion?.getClientExtensionResults?.()?.prf?.results?.first;
  if (!result) {
    throw new Error('This device unlocked, but would not give HealthTrace a key to decrypt with.');
  }
  return new Uint8Array(result);
}

export async function enableBiometric() {
  if (!dataKey) throw new Error('Unlock HealthTrace first.');
  if (!biometricPossible()) throw new Error('This browser cannot use your fingerprint.');

  const vault = await readVault();
  if (!vault) throw new Error('HealthTrace is not locked.');

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'HealthTrace' },
      user: { id: randomBytes(16), name: 'healthtrace', displayName: 'HealthTrace' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      extensions: { prf: {} },
    },
  });

  // Not every platform authenticator supports PRF. Without it we could still
  // check a fingerprint — but not derive a key from it, and a fingerprint that
  // merely gates a screen while the data stays decryptable is the false comfort
  // this feature exists to avoid. So: refuse, and say why.
  if (!credential?.getClientExtensionResults?.()?.prf?.enabled) {
    throw new Error(
      'This device can check your fingerprint but cannot turn it into an encryption key, so it would only be a screen guard. Passphrase only here.'
    );
  }

  const credentialId = new Uint8Array(credential.rawId);
  const prfSalt = randomBytes(32);
  const secret = await evaluatePrf(credentialId, prfSalt);
  const wrapped = await wrapDataKey(dataKey, await deriveKeyFromSecret(secret));

  await db.vault.update(vault.id, {
    biometric: {
      credentialId: toBase64(credentialId),
      prfSalt: toBase64(prfSalt),
      wrapped,
      addedAt: Date.now(),
    },
  });
  announce();
}

export async function unlockWithBiometric() {
  const vault = await readVault();
  if (!vault?.biometric) throw new Error('No fingerprint is registered on this device.');

  const secret = await evaluatePrf(fromBase64(vault.biometric.credentialId), fromBase64(vault.biometric.prfSalt));
  dataKey = await unwrapDataKey(vault.biometric.wrapped, await deriveKeyFromSecret(secret));
  announce();
}

export async function disableBiometric() {
  const vault = await readVault();
  if (!vault) return;
  await db.vault.update(vault.id, { biometric: null });
  announce();
}

export async function biometricEnrolled() {
  const vault = await readVault();
  return Boolean(vault?.biometric);
}
