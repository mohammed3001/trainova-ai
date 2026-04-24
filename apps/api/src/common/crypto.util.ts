import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

/**
 * Symmetric envelope encryption for sensitive blobs (model API keys,
 * webhook secrets, OAuth refresh tokens, etc.) stored at rest in Postgres.
 *
 * Algorithm: AES-256-GCM. Layout of the persisted bytea column is
 *   [12-byte IV | 16-byte auth tag | ciphertext]
 * — concatenated so the value is fully self-describing and can be
 * decrypted with no out-of-band metadata.
 *
 * The wrapping key is derived once per process from `APP_ENCRYPTION_KEY`
 * (a base64-encoded value of any length). We run it through scrypt with
 * a fixed salt so the same env value always produces the same 32-byte
 * derived key, which lets us roll the env value across deploys without
 * needing a separate rotation step.
 */

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'APP_ENCRYPTION_KEY is required to encrypt/decrypt secrets. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  // scrypt is deliberately slow but only runs once per process (cached).
  cachedKey = scryptSync(raw, 'trainova:model-vault:v1', 32);
  return cachedKey;
}

export function encryptSecret(plaintext: string): Buffer {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decryptSecret(envelope: Buffer): string {
  if (envelope.length < 12 + 16 + 1) {
    throw new Error('encrypted envelope is too short');
  }
  const key = getKey();
  const iv = envelope.subarray(0, 12);
  const tag = envelope.subarray(12, 28);
  const ct = envelope.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/**
 * Returns a public-safe preview of a secret — first 4 chars + ellipsis +
 * last 4 chars, with the middle entirely redacted. Used by UI surfaces
 * that need to confirm "yes a key is on file" without revealing it.
 */
export function previewSecret(plaintext: string): string {
  const trimmed = plaintext.trim();
  if (trimmed.length <= 8) return '••••';
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}
