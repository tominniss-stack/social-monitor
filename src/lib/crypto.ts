import crypto from 'crypto';

/**
 * Secret-at-rest encryption (D-19 / SEC-12) for per-account Meta tokens.
 *
 * AES-256-GCM with a random 12-byte IV per message. Ciphertext format:
 *   v1:<iv_b64>:<tag_b64>:<ct_b64>
 *
 * Key: `TOKEN_ENCRYPTION_KEY` — 32 bytes as 64 hex chars or 44-char base64.
 * Generate one with `openssl rand -hex 32`. The key is only required when a
 * token is actually encrypted/decrypted, so demo mode (no per-account tokens)
 * works without it.
 */

const VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class TokenEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenEncryptionError';
  }
}

function loadKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new TokenEncryptionError(
      'TOKEN_ENCRYPTION_KEY is not set but a PlatformAccount token needs encrypting/decrypting. ' +
        'Generate one with `openssl rand -hex 32` and add it to the environment.'
    );
  }

  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === KEY_BYTES) key = decoded;
  }

  if (!key || key.length !== KEY_BYTES) {
    throw new TokenEncryptionError(
      'TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters or base64 (`openssl rand -hex 32`).'
    );
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new TokenEncryptionError('Unrecognised ciphertext format (expected v1:<iv>:<tag>:<ct>).');
  }
  const key = loadKey();
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== 16) {
    throw new TokenEncryptionError('Malformed ciphertext (bad IV or auth tag length).');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    throw new TokenEncryptionError('Decryption failed (wrong key or tampered ciphertext).');
  }
}

/** True when a stored value looks like our ciphertext (vs. a legacy plaintext token). */
export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}:`) && value.split(':').length === 4;
}
