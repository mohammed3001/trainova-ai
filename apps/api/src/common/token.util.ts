import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque token generation + verification helpers.
 *
 * We never persist raw tokens. Only SHA-256 digests land in the DB so even a
 * read of the tokens table leaks nothing usable (same pattern the project
 * already applies to refresh-token hashes).
 */

export interface IssuedToken {
  raw: string;
  hash: string;
}

export function issueOpaqueToken(bytes = 32): IssuedToken {
  const raw = randomBytes(bytes).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
