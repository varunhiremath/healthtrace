import { describe, it, expect } from 'vitest';
import {
  randomBytes,
  randomSalt,
  toBase64,
  fromBase64,
  deriveKeyFromPassphrase,
  deriveKeyFromSecret,
  generateDataKey,
  sealBytes,
  openBytes,
  wrapDataKey,
  unwrapDataKey,
  seal,
  open,
  isSealed,
  passphraseStrength,
  cryptoAvailable,
} from './crypto.js';

// PBKDF2 at 600k iterations is deliberately slow, so the tests that exercise a
// passphrase use a low count. The iteration count is a stored parameter, which
// is exactly why it can be varied here without changing the code under test.
const FAST = 1000;

describe('availability', () => {
  it('finds WebCrypto', () => {
    expect(cryptoAvailable()).toBe(true);
  });
});

describe('encoding', () => {
  it('round-trips bytes through base64', () => {
    const bytes = randomBytes(32);
    expect([...fromBase64(toBase64(bytes))]).toEqual([...bytes]);
  });

  it('handles the whole byte range, not just ASCII', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 200, 254, 255]);
    expect([...fromBase64(toBase64(bytes))]).toEqual([...bytes]);
  });
});

describe('sealing a value', () => {
  it('round-trips anything JSON can hold', async () => {
    const key = await generateDataKey();
    for (const value of [1234.56, 'a note', null, { value: 250, note: 'bonus' }, [1, 2, 3]]) {
      expect(await open(await seal(value, key), key)).toEqual(value);
    }
  });

  it('produces different ciphertext every time, even for the same value', async () => {
    const key = await generateDataKey();
    const first = await seal(5000, key);
    const second = await seal(5000, key);
    // A reused IV in GCM is the one catastrophic mistake available here, and
    // identical output for identical input is how it would show up.
    expect(first).not.toBe(second);
    expect(await open(first, key)).toBe(5000);
    expect(await open(second, key)).toBe(5000);
  });

  it('refuses the wrong key rather than returning garbage', async () => {
    const sealed = await seal(5000, await generateDataKey());
    await expect(open(sealed, await generateDataKey())).rejects.toThrow();
  });

  it('detects a tampered ciphertext', async () => {
    const key = await generateDataKey();
    const sealed = await seal({ value: 100 }, key);
    const [version, iv, ct] = sealed.split('.');
    // Flip a character in the ciphertext. GCM authenticates, so this must fail
    // loudly rather than decrypt to a different number.
    const flipped = ct[0] === 'A' ? `B${ct.slice(1)}` : `A${ct.slice(1)}`;
    await expect(open(`${version}.${iv}.${flipped}`, key)).rejects.toThrow();
  });

  it('refuses a format from a future version', async () => {
    const key = await generateDataKey();
    const sealed = await seal(1, key);
    await expect(open(sealed.replace('v1.', 'v2.'), key)).rejects.toThrow(/newer version/);
  });

  it('recognises its own sealed values', async () => {
    const key = await generateDataKey();
    expect(isSealed(await seal(1, key))).toBe(true);
    expect(isSealed('5000')).toBe(false);
    expect(isSealed(5000)).toBe(false);
    expect(isSealed(null)).toBe(false);
  });
});

describe('sealing raw bytes', () => {
  it('round-trips a binary blob', async () => {
    const key = await generateDataKey();
    const original = new Uint8Array([0, 1, 37, 128, 200, 255, 3, 3, 3]);
    expect([...(await openBytes(await sealBytes(original, key), key))]).toEqual([...original]);
  });

  it('round-trips something the size of a scanned report', async () => {
    const key = await generateDataKey();
    const original = new Uint8Array(200000).map((_, i) => i % 256);
    const opened = await openBytes(await sealBytes(original, key), key);
    expect(opened.length).toBe(original.length);
    expect(opened[199999]).toBe(original[199999]);
  });

  it('prefixes a fresh IV rather than reusing one', async () => {
    const key = await generateDataKey();
    const bytes = new Uint8Array([1, 2, 3]);
    const first = await sealBytes(bytes, key);
    const second = await sealBytes(bytes, key);
    expect([...first.subarray(0, 12)]).not.toEqual([...second.subarray(0, 12)]);
  });

  it('refuses the wrong key', async () => {
    const sealed = await sealBytes(new Uint8Array([1, 2, 3]), await generateDataKey());
    await expect(openBytes(sealed, await generateDataKey())).rejects.toThrow();
  });
});

describe('wrapping the data key', () => {
  it('unwraps with the right passphrase and decrypts what it encrypted', async () => {
    const salt = randomSalt();
    const dataKey = await generateDataKey();
    const sealed = await seal(42000, dataKey);

    const wrapped = await wrapDataKey(dataKey, await deriveKeyFromPassphrase('correct horse battery', salt, FAST));

    // A fresh unlock: derive again from the passphrase, unwrap, read.
    const reopened = await unwrapDataKey(wrapped, await deriveKeyFromPassphrase('correct horse battery', salt, FAST));
    expect(await open(sealed, reopened)).toBe(42000);
  });

  it('refuses the wrong passphrase', async () => {
    const salt = randomSalt();
    const wrapped = await wrapDataKey(await generateDataKey(), await deriveKeyFromPassphrase('right', salt, FAST));
    await expect(unwrapDataKey(wrapped, await deriveKeyFromPassphrase('wrong', salt, FAST))).rejects.toThrow();
  });

  it('refuses the right passphrase with the wrong salt', async () => {
    const wrapped = await wrapDataKey(await generateDataKey(), await deriveKeyFromPassphrase('same', randomSalt(), FAST));
    await expect(
      unwrapDataKey(wrapped, await deriveKeyFromPassphrase('same', randomSalt(), FAST))
    ).rejects.toThrow();
  });

  it('lets two different secrets unwrap the same data key', async () => {
    // This is what makes a fingerprint and a passphrase both work without
    // encrypting the data twice — and what lets the passphrase change without
    // rewriting a single stored row.
    const dataKey = await generateDataKey();
    const sealed = await seal({ value: 1200 }, dataKey);

    const salt = randomSalt();
    const byPassphrase = await wrapDataKey(dataKey, await deriveKeyFromPassphrase('a passphrase', salt, FAST));
    const prfOutput = randomBytes(32);
    const byBiometric = await wrapDataKey(dataKey, await deriveKeyFromSecret(prfOutput));

    const viaPassphrase = await unwrapDataKey(byPassphrase, await deriveKeyFromPassphrase('a passphrase', salt, FAST));
    const viaBiometric = await unwrapDataKey(byBiometric, await deriveKeyFromSecret(prfOutput));

    expect(await open(sealed, viaPassphrase)).toEqual({ value: 1200 });
    expect(await open(sealed, viaBiometric)).toEqual({ value: 1200 });
  });

  it('can re-wrap a key it unwrapped', async () => {
    // Changing the passphrase and enrolling a fingerprint both wrap a key that
    // came back from an unwrap. If the unwrapped key is not extractable this
    // throws — and it only ever throws in the SECOND session, once the key has
    // stopped being the freshly generated one, which is exactly the kind of bug
    // that ships.
    const salt = randomSalt();
    const original = await generateDataKey();
    const sealed = await seal(777, original);
    const wrapped = await wrapDataKey(original, await deriveKeyFromPassphrase('first', salt, FAST));

    const unwrapped = await unwrapDataKey(wrapped, await deriveKeyFromPassphrase('first', salt, FAST));

    const nextSalt = randomSalt();
    const rewrapped = await wrapDataKey(unwrapped, await deriveKeyFromPassphrase('second', nextSalt, FAST));
    const finalKey = await unwrapDataKey(rewrapped, await deriveKeyFromPassphrase('second', nextSalt, FAST));

    // Same data key throughout, so data sealed before the change still opens.
    expect(await open(sealed, finalKey)).toBe(777);
  });

  it('derives the same key from the same secret material every time', async () => {
    const secret = randomBytes(32);
    const dataKey = await generateDataKey();
    const wrapped = await wrapDataKey(dataKey, await deriveKeyFromSecret(secret));
    const unwrapped = await unwrapDataKey(wrapped, await deriveKeyFromSecret(secret));
    const sealed = await seal('ok', unwrapped);
    expect(await open(sealed, dataKey)).toBe('ok');
  });
});

describe('passphraseStrength', () => {
  it('rates a short passphrase weak and a long one strong', () => {
    expect(passphraseStrength('').verdict).toBe('empty');
    expect(passphraseStrength('money').verdict).toBe('weak');
    expect(passphraseStrength('correct horse battery staple').verdict).toBe('strong');
  });

  it('scores length above character salad', () => {
    // The lesson people get wrong: "P@ssw0rd!" is not strong.
    const salad = passphraseStrength('P@ssw0rd!');
    const long = passphraseStrength('three brown dogs walked here');
    expect(long.bits).toBeGreaterThan(salad.bits);
  });

  it('grows with length', () => {
    expect(passphraseStrength('abcdefghij').bits).toBeGreaterThan(passphraseStrength('abcde').bits);
  });
});
