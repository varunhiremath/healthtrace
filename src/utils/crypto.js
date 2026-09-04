// The cryptography, kept small and separate so it can be read in one sitting
// and tested on its own.
//
// The shape of it:
//
//   passphrase ──PBKDF2──┐
//                        ├──> a wrapping key ──> unwraps the DATA KEY ──> AES-GCM
//   fingerprint ──PRF────┘                            (random, 256-bit)
//
// The data key is random and is what actually encrypts your balances. It is
// never stored in the clear — only wrapped, once per unlock method. That is
// what lets you have both a passphrase and a fingerprint without encrypting
// everything twice, and what lets you change your passphrase without touching
// a single stored row.
//
// Everything here uses WebCrypto. No dependency, no hand-rolled primitive.

const SUBTLE = globalThis.crypto?.subtle;

// OWASP's floor for PBKDF2-HMAC-SHA256. It costs about half a second on a
// phone, which is the point: it is the only thing standing between a stolen
// database and somebody guessing a short passphrase offline.
export const PBKDF2_ITERATIONS = 600000;

const AES = { name: 'AES-GCM', length: 256 };
const IV_BYTES = 12;
const SALT_BYTES = 16;

export function randomBytes(length) {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export function randomSalt() {
  return randomBytes(SALT_BYTES);
}

/** Is real crypto available? False in an insecure context, where all of this is refused. */
export function cryptoAvailable() {
  return Boolean(SUBTLE);
}

/* ----------------------------------------------------------------- encoding */

// Sealed values are stored as one self-describing string: "v1.<iv>.<ciphertext>".
// A version prefix means a future change of algorithm can be detected rather
// than silently mis-decrypted.
const PREFIX = 'v1';

export function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text) {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/* --------------------------------------------------------------------- keys */

/**
 * Turn a passphrase into a key-wrapping key.
 *
 * Deliberately slow. The salt must be stored alongside the wrapped key and must
 * be different for every vault, or two people with the same passphrase would
 * produce the same key.
 */
export async function deriveKeyFromPassphrase(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  const material = await SUBTLE.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return SUBTLE.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    AES,
    false,
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
  );
}

/**
 * Turn the output of a WebAuthn PRF evaluation into a key-wrapping key.
 *
 * No stretching here, and none needed: unlike a passphrase this is 32 bytes of
 * high-entropy material that came out of the phone's secure element, and it
 * cannot be guessed from anything stored on disk.
 */
export async function deriveKeyFromSecret(secretBytes) {
  const material = await SUBTLE.importKey('raw', secretBytes, 'HKDF', false, ['deriveKey']);
  return SUBTLE.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('healthtrace-vault-v1') },
    material,
    AES,
    false,
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
  );
}

/** A fresh random data key. Extractable, because it has to be wrappable. */
export async function generateDataKey() {
  return SUBTLE.generateKey(AES, true, ['encrypt', 'decrypt']);
}

/** Wrap the data key with a key-wrapping key, for storage. */
export async function wrapDataKey(dataKey, wrappingKey) {
  const iv = randomBytes(IV_BYTES);
  const wrapped = await SUBTLE.wrapKey('raw', dataKey, wrappingKey, { name: 'AES-GCM', iv });
  return `${PREFIX}.${toBase64(iv)}.${toBase64(new Uint8Array(wrapped))}`;
}

/**
 * Unwrap the data key. Throws on a wrong passphrase — AES-GCM authenticates,
 * so a bad key fails to decrypt rather than producing garbage that would go on
 * to corrupt every row it touched.
 */
export async function unwrapDataKey(stored, wrappingKey) {
  const [version, ivText, ctText] = String(stored).split('.');
  if (version !== PREFIX) throw new Error('This vault was written by a newer version of HealthTrace.');
  return SUBTLE.unwrapKey(
    'raw',
    fromBase64(ctText),
    wrappingKey,
    { name: 'AES-GCM', iv: fromBase64(ivText) },
    AES,
    // Extractable, and it has to be: an unwrapped key gets WRAPPED AGAIN when
    // the passphrase is changed or a fingerprint is enrolled, and WebCrypto
    // refuses to wrap a key it cannot export. Marking it non-extractable looks
    // safer and merely breaks both of those the moment the app is used across
    // more than one session — while buying nothing, since any code that could
    // export it can already read the decrypted balances.
    true,
    ['encrypt', 'decrypt']
  );
}

/* ---------------------------------------------------------------- sealing */

/**
 * Encrypt a value (anything JSON can hold) with the data key.
 *
 * A fresh IV every time: reusing one with the same key in GCM is the single
 * catastrophic mistake available here.
 */
export async function seal(value, dataKey) {
  const iv = randomBytes(IV_BYTES);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await SUBTLE.encrypt({ name: 'AES-GCM', iv }, dataKey, plaintext);
  return `${PREFIX}.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

/** Decrypt a sealed value. Throws if the key is wrong or the data was altered. */
export async function open(sealed, dataKey) {
  const [version, ivText, ctText] = String(sealed).split('.');
  if (version !== PREFIX) throw new Error('This record was written by a newer version of HealthTrace.');
  const plaintext = await SUBTLE.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivText) },
    dataKey,
    fromBase64(ctText)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

/**
 * Seal raw bytes — the original PDF or photo of a lab report.
 *
 * A separate path from `seal` because these are megabytes, not fields: JSON is
 * not a container for binary, and base64-ing a 4 MB scan to push it through one
 * would cost a third again in size for nothing. The IV is prefixed to the
 * ciphertext instead of being carried in a string.
 */
export async function sealBytes(bytes, dataKey) {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = new Uint8Array(await SUBTLE.encrypt({ name: 'AES-GCM', iv }, dataKey, bytes));
  const out = new Uint8Array(IV_BYTES + ciphertext.length);
  out.set(iv, 0);
  out.set(ciphertext, IV_BYTES);
  return out;
}

export async function openBytes(sealedBytes, dataKey) {
  const bytes = sealedBytes instanceof Uint8Array ? sealedBytes : new Uint8Array(sealedBytes);
  const iv = bytes.subarray(0, IV_BYTES);
  const ciphertext = bytes.subarray(IV_BYTES);
  return new Uint8Array(await SUBTLE.decrypt({ name: 'AES-GCM', iv }, dataKey, ciphertext));
}

export function isSealed(value) {
  return typeof value === 'string' && value.startsWith(`${PREFIX}.`);
}

/* ------------------------------------------------------------- passphrases */

/**
 * How much guessing a passphrase would take, in rough terms.
 *
 * Not a strength meter with a green bar — those teach people that "Passw0rd!"
 * is strong. This estimates entropy from length and the variety of characters
 * used, and the UI turns it into a sentence about how long an offline attack
 * would take, which is the thing that actually matters when there is no server
 * to rate-limit anyone.
 */
export function passphraseStrength(passphrase = '') {
  const text = String(passphrase);
  if (!text) return { bits: 0, verdict: 'empty' };

  let alphabet = 0;
  if (/[a-z]/.test(text)) alphabet += 26;
  if (/[A-Z]/.test(text)) alphabet += 26;
  if (/[0-9]/.test(text)) alphabet += 10;
  if (/[^a-zA-Z0-9]/.test(text)) alphabet += 33;

  // Words are worth more than their characters suggest, but a passphrase of
  // common words is worth far less than raw character maths implies. Counting
  // by character with a modest alphabet is the conservative reading, which is
  // the right way to be wrong here.
  const bits = Math.round((text.length * Math.log2(alphabet || 1)) * 10) / 10;

  let verdict = 'weak';
  if (bits >= 90) verdict = 'strong';
  else if (bits >= 70) verdict = 'good';
  else if (bits >= 50) verdict = 'fair';

  return { bits, verdict };
}
