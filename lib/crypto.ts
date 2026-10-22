import CryptoJS from 'crypto-js';

function getSecret(): string {
  const secret = process.env.CREDENTIAL_ENCRYPTION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('Missing CREDENTIAL_ENCRYPTION_SECRET (or NEXTAUTH_SECRET) environment variable');
  }
  return secret;
}

export function encryptSecret(plaintext: string): string {
  return CryptoJS.AES.encrypt(plaintext, getSecret()).toString();
}

export function decryptSecret(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, getSecret());
  const plaintext = bytes.toString(CryptoJS.enc.Utf8);
  if (!plaintext) {
    throw new Error('Failed to decrypt secret — encryption key may have changed');
  }
  return plaintext;
}

/** Last 4 visible characters, rest masked — safe to display in the UI. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) {
    return '••••';
  }
  return `••••••••${plaintext.slice(-4)}`;
}
