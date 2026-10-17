import argon2 from 'argon2';

/** argon2id, kütüphanenin güncel önerilen parametreleriyle. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Kullanıcı bulunamadığında da aynı süre harcansın diye (kullanıcı varlığını zamanlamadan
 * sızdırmamak için) sahte bir hash ile doğrulama yapılır.
 */
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('upvine-timing-equalizer');
  await verifyPassword(await dummyHash, password);
}
