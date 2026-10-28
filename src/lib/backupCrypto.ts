/**
 * Passphrase encryption for the optional API-key section of a backup file.
 * AES-256-GCM, key = PBKDF2-SHA256(passphrase, random salt, 600k iterations). Nothing readable is written.
 */

const ITERATIONS = 600_000;
const AAD = new TextEncoder().encode('eih-backup-secrets-v1');
export const MIN_BACKUP_PASSPHRASE = 8;

export interface EncryptedSecrets {
  v: 1;
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(str: string): Uint8Array {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptSecrets(secrets: Record<string, string>, passphrase: string): Promise<EncryptedSecrets> {
  if (passphrase.length < MIN_BACKUP_PASSPHRASE) throw new Error(`Use a backup passphrase of at least ${MIN_BACKUP_PASSPHRASE} characters.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: AAD },
    key,
    new TextEncoder().encode(JSON.stringify(secrets)),
  );
  return { v: 1, iter: ITERATIONS, salt: b64encode(salt), iv: b64encode(iv), ct: b64encode(new Uint8Array(ct)) };
}

export function isEncryptedSecrets(v: unknown): v is EncryptedSecrets {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.v === 1 && typeof o.iter === 'number' && typeof o.salt === 'string' && typeof o.iv === 'string' && typeof o.ct === 'string';
}

export async function decryptSecrets(blob: EncryptedSecrets, passphrase: string): Promise<Record<string, string>> {
  // Cap the iteration count so a hostile file cannot freeze the tab.
  if (blob.iter < 100_000 || blob.iter > 2_000_000) throw new Error('This backup uses unsupported encryption settings.');
  try {
    const key = await deriveKey(passphrase, b64decode(blob.salt), blob.iter);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64decode(blob.iv) as BufferSource, additionalData: AAD },
      key,
      b64decode(blob.ct) as BufferSource,
    );
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plain));
    const out: Record<string, string> = {};
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    throw new Error('Wrong backup passphrase, or the key section of the file is damaged.');
  }
}
