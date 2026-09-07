import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function encryptionKey() {
  const raw = process.env.KEY_ENCRYPTION_SECRET;
  if (!raw) throw new Error('KEY_ENCRYPTION_SECRET is not set');
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}

export function decryptSecret(packed) {
  const parts = String(packed).split('.');
  if (parts.length !== 3) throw new Error('Stored key is malformed');
  const [iv, tag, data] = parts;

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function last4(plaintext) {
  const s = String(plaintext);
  return s.length <= 4 ? s : s.slice(-4);
}
