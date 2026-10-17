import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Kimlik bilgisi şifreleme (Bölüm 10): AES-256-GCM, ana anahtar `ENCRYPTION_KEY` (base64, 32 bayt).
 * Anahtar sürümü kayıtla saklanır; rotasyonda eski sürümün anahtarı da verilerek çözülebilir.
 */
export interface EncryptedRecord {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

export class CredentialKeyError extends Error {
  override name = 'CredentialKeyError';
}

function keyFrom(base64: string | undefined): Buffer {
  if (!base64) throw new CredentialKeyError('ENCRYPTION_KEY tanımlı değil');
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32) throw new CredentialKeyError('ENCRYPTION_KEY 32 bayt olmalı');
  return key;
}

export function encryptJson(value: unknown, keyBase64: string | undefined, keyVersion: number): EncryptedRecord {
  const key = keyFrom(keyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion };
}

/** `keys`: sürüm → base64 anahtar. Kurcalanmış veri veya yanlış anahtar hata fırlatır. */
export function decryptJson<T>(record: EncryptedRecord, keys: Record<number, string | undefined>): T {
  const key = keyFrom(keys[record.keyVersion]);
  const decipher = createDecipheriv('aes-256-gcm', key, record.iv);
  decipher.setAuthTag(record.authTag);
  const plain = Buffer.concat([decipher.update(record.ciphertext), decipher.final()]).toString('utf8');
  return JSON.parse(plain) as T;
}
