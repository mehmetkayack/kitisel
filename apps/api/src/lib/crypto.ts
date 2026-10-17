import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** URL'de taşınabilir, tahmin edilemez token (varsayılan 32 bayt = 256 bit). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Token'lar veritabanında sadece SHA-256 hash olarak saklanır. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
