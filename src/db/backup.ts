import { db, DB_SCHEMA_VERSION } from './db';
import { getApiKey, setApiKey } from '@/services/apiKeyStore';
import { PROVIDER_IDS, type ProviderId } from '@/config/providers';
import { decryptSecrets, encryptSecrets, isEncryptedSecrets, type EncryptedSecrets } from '@/lib/backupCrypto';
import { MAX_BACKUP_BYTES, UnsafeImportError, cleanRows } from '@/lib/sanitizeImport';

export const BACKUP_FORMAT = 'eih-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  backupVersion: 1;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
  /** Present only when the user opted in at export time. Encrypted with a backup passphrase. */
  secretsEnc?: EncryptedSecrets;
  /** Plain-text keys. Only ever read from backups made by older versions; never written. */
  secrets?: { geminiApiKey?: string; anthropicApiKey?: string; openaiApiKey?: string };
}

const SECRET_FIELD = { gemini: 'geminiApiKey', anthropic: 'anthropicApiKey', openai: 'openaiApiKey' } as const satisfies Record<ProviderId, string>;

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export type TableCounts = Record<string, number>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export async function buildBackup(options: { includeApiKey: boolean; passphrase?: string }): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  await db.transaction('r', db.tables, async () => {
    for (const table of db.tables) tables[table.name] = await table.toArray();
  });

  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    backupVersion: 1,
    schemaVersion: DB_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };
  if (options.includeApiKey) {
    const secrets: Record<string, string> = {};
    for (const p of PROVIDER_IDS) {
      const key = getApiKey(p);
      if (key) secrets[SECRET_FIELD[p]] = key;
    }
    if (Object.keys(secrets).length) {
      if (!options.passphrase) throw new BackupError('Enter a passphrase to protect the API keys in the backup.');
      backup.secretsEnc = await encryptSecrets(secrets, options.passphrase);
    }
  }
  return backup;
}

export function countRows(backup: Pick<BackupFile, 'tables'>): TableCounts {
  return Object.fromEntries(Object.entries(backup.tables).map(([name, rows]) => [name, rows.length]));
}

/** Triggers a browser download of the backup. Returns the file name. */
export async function exportDatabaseToFile(options: { includeApiKey: boolean; passphrase?: string }): Promise<{ filename: string; counts: TableCounts }> {
  const backup = await buildBackup(options);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const stamp = backup.exportedAt.replace(/[:.]/g, '-').slice(0, 19);
  const filename = `eih-backup-${stamp}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { filename, counts: countRows(backup) };
}

/** Parses and validates a backup file without touching the database. */
export async function readBackupFile(file: File): Promise<BackupFile> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new BackupError(`This file is larger than ${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB, which is too big for a valid backup.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new BackupError('This file is not valid JSON.');
  }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) {
    throw new BackupError('This file is not an EIH backup (missing "eih-backup" format marker).');
  }
  if (typeof parsed.schemaVersion !== 'number' || !isRecord(parsed.tables)) {
    throw new BackupError('The backup is missing its schema version or table data.');
  }
  if (parsed.schemaVersion > DB_SCHEMA_VERSION) {
    throw new BackupError(
      `This backup uses schema v${parsed.schemaVersion}, but this app supports up to v${DB_SCHEMA_VERSION}. Update the app and try again.`,
    );
  }

  const tables: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    const rows = parsed.tables[table.name];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) throw new BackupError(`Table "${table.name}" in the backup is not a list.`);
    try {
      tables[table.name] = cleanRows(table.name, rows, table.schema.primKey.name);
    } catch (err) {
      if (err instanceof UnsafeImportError) throw new BackupError(err.message);
      throw err;
    }
  }

  let secrets: BackupFile['secrets'];
  if (isRecord(parsed.secrets)) {
    const found: NonNullable<BackupFile['secrets']> = {};
    for (const p of PROVIDER_IDS) {
      const v = parsed.secrets[SECRET_FIELD[p]];
      if (typeof v === 'string' && v) found[SECRET_FIELD[p]] = v;
    }
    if (Object.keys(found).length) secrets = found;
  }

  const secretsEnc = isEncryptedSecrets(parsed.secretsEnc) ? parsed.secretsEnc : undefined;

  return {
    format: BACKUP_FORMAT,
    backupVersion: 1,
    schemaVersion: parsed.schemaVersion,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    tables,
    secrets,
    secretsEnc,
  };
}

/** Replaces ALL local data with the backup, atomically. */
export async function restoreBackup(backup: BackupFile, options: { restoreApiKey: boolean; passphrase?: string }): Promise<TableCounts> {
  // Decrypt first so a wrong passphrase fails before any local data is replaced.
  let keys: Record<string, string> = {};
  if (options.restoreApiKey) {
    if (backup.secretsEnc) {
      if (!options.passphrase) throw new BackupError('Enter the backup passphrase to restore the API keys.');
      keys = await decryptSecrets(backup.secretsEnc, options.passphrase);
    } else if (backup.secrets) {
      keys = { ...backup.secrets };
    }
  }
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
      const rows = backup.tables[table.name];
      if (rows?.length) await table.bulkPut(rows);
    }
  });
  for (const p of PROVIDER_IDS) {
    const key = keys[SECRET_FIELD[p]];
    if (key) await setApiKey(key, p);
  }
  return countRows(backup);
}
