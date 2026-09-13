/**
 * Password hashing for StudyHub.
 *
 * Uses PBKDF2-HMAC-SHA256 via WebCrypto (available in the Workers runtime).
 * No third-party dependencies. Passwords are never stored or logged in plaintext.
 *
 * Stored format (single TEXT column):
 *   pbkdf2$sha256$<iterations>$<saltBase64>$<hashBase64>
 */

const ITERATIONS = 100_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;
const ALGO = 'PBKDF2';
const DIGEST = 'SHA-256';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Constant-time comparison so verification does not leak via timing. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: ALGO },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: ALGO, salt: salt as unknown as BufferSource, iterations, hash: DIGEST },
    keyMaterial,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

/** Hash a plaintext password into the storable format string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return ['pbkdf2', 'sha256', String(ITERATIONS), toBase64(salt), toBase64(hash)].join('$');
}

/** Verify a plaintext password against a stored hash string. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 5) return false;
    const [, digest, iterationsRaw, saltB64, hashB64] = parts;
    if (digest !== 'sha256') return false;
    const iterations = parseInt(iterationsRaw, 10);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;

    const salt = fromBase64(saltB64);
    const expected = fromBase64(hashB64);
    const actual = await derive(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
