import { decryptSecret, encryptSecret, maskSecret } from '@/lib/crypto';

/**
 * 'sk-test' encrypted under 'secret-a'. Decrypting with 'secret-b' gives, in
 * turn: empty output, a thrown "Malformed UTF-8 data", and the string "1".
 */
const CIPHER = {
  wrongKeyEmpty: 'U2FsdGVkX1/iNPh7LqZAqfLKrmHYXqKacByjXSRzFuY=',
  wrongKeyMalformed: 'U2FsdGVkX1/Cz2Ec4GYtE/jNGDKyGchVhN4yNzNiAnc=',
  wrongKeyGarbage: 'U2FsdGVkX1+P6bGV11B6wpFHZNlHVX3/oaOonfJHXZc=',
};

const ENV_KEYS = ['CREDENTIAL_ENCRYPTION_SECRET', 'NEXTAUTH_SECRET'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('FR-AIM-3: API keys are stored encrypted', () => {
  test('FR-AIM-3: encrypt → decrypt round-trips and the ciphertext hides the key', () => {
    process.env.CREDENTIAL_ENCRYPTION_SECRET = 'credential-secret';
    const key = 'sk-test-1234567890abcdef';

    const cipher = encryptSecret(key);

    expect(cipher).not.toContain(key);
    expect(decryptSecret(cipher)).toBe(key);
  });

  test('FR-AIM-3: the same key encrypts differently each time (random salt)', () => {
    process.env.CREDENTIAL_ENCRYPTION_SECRET = 'credential-secret';
    expect(encryptSecret('sk-test')).not.toBe(encryptSecret('sk-test'));
  });

  test('CREDENTIAL_ENCRYPTION_SECRET takes precedence over NEXTAUTH_SECRET', () => {
    process.env.CREDENTIAL_ENCRYPTION_SECRET = 'secret-a';
    process.env.NEXTAUTH_SECRET = 'secret-b';
    expect(decryptSecret(CIPHER.wrongKeyEmpty)).toBe('sk-test');
  });

  test('NEXTAUTH_SECRET is used when no dedicated secret is set', () => {
    process.env.NEXTAUTH_SECRET = 'nextauth-secret';
    expect(decryptSecret(encryptSecret('sk-test'))).toBe('sk-test');
  });

  test('a missing secret is a hard error, not a silent plaintext fallback', () => {
    expect(() => encryptSecret('sk-test')).toThrow(/Missing CREDENTIAL_ENCRYPTION_SECRET/);
    expect(() => decryptSecret('anything')).toThrow(/Missing CREDENTIAL_ENCRYPTION_SECRET/);
  });

  test('decrypting with a changed secret fails with the explanatory error', () => {
    process.env.CREDENTIAL_ENCRYPTION_SECRET = 'secret-b';
    expect(() => decryptSecret(CIPHER.wrongKeyEmpty)).toThrow(
      'Failed to decrypt secret — encryption key may have changed'
    );
  });

  describe('characterization: wrong-key decryption is not always detected', () => {
    // RISK DC-17: AES with a wrong passphrase usually yields empty UTF-8
    // (caught above), but ~6% of ciphertexts throw crypto-js's raw
    // "Malformed UTF-8 data" and ~0.4% decode to a non-empty garbage string
    // that is returned as if it were the API key (measured over 5,000 runs).
    // Fixed ciphertexts keep these tests deterministic.
    beforeEach(() => {
      process.env.CREDENTIAL_ENCRYPTION_SECRET = 'secret-b';
    });

    test('DC-17: some ciphertexts throw the raw crypto-js error instead', () => {
      expect(() => decryptSecret(CIPHER.wrongKeyMalformed)).toThrow('Malformed UTF-8 data');
    });

    test('DC-17: some ciphertexts silently decrypt to garbage', () => {
      expect(decryptSecret(CIPHER.wrongKeyGarbage)).toBe('1');
    });
  });
});

describe('FR-AIM-3: only a masked hint is ever shown', () => {
  test('FR-AIM-3: shows the last 4 characters behind 8 bullets', () => {
    expect(maskSecret('sk-test-abcd1234')).toBe('••••••••1234');
  });

  test.each(['', 'a', 'abcd'])('FR-AIM-3: a key of 4 or fewer characters (%j) is fully masked', key => {
    expect(maskSecret(key)).toBe('••••');
  });

  test('a 5-character key reveals only its last 4', () => {
    expect(maskSecret('abcde')).toBe('••••••••bcde');
  });
});
