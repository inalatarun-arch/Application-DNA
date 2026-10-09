import { db, DB_SCHEMA_VERSION } from './db';
import { getApiKey, setApiKey } from '@/services/apiKeyStore';
import { PROVIDER_IDS, type ProviderId } from '@/config/providers';

export const BACKUP_FORMAT = 'eih-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  backupVersion: 1;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
  /** Present only when the user opted in at export time. */
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

export async function buildBackup(options: { includeApiKey: boolean }): Promise<BackupFile> {
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
    const secrets: NonNullable<BackupFile['secrets']> = {};
    for (const p of PROVIDER_IDS) {
      const key = getApiKey(p);
      if (key) secrets[SECRET_FIELD[p]] = key;
    }
    if (Object.keys(secrets).length) backup.secrets = secrets;
  }
  return backup;
}

export function countRows(backup: Pick<BackupFile, 'tables'>): TableCounts {
  return Object.fromEntries(Object.entries(backup.tables).map(([name, rows]) => [name, rows.length]));
}

/** Triggers a browser download of the backup. Returns the file name. */
export async function exportDatabaseToFile(options: { includeApiKey: boolean }): Promise<{ filename: string; counts: TableCounts }> {
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
    const pk = table.schema.primKey.name;
    rows.forEach((row, i) => {
      if (!isRecord(row) || typeof row[pk] !== 'string' || !row[pk]) {
        throw new BackupError(`Table "${table.name}", row ${i + 1}: missing "${pk}".`);
      }
    });
    tables[table.name] = rows;
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

  return {
    format: BACKUP_FORMAT,
    backupVersion: 1,
    schemaVersion: parsed.schemaVersion,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    tables,
    secrets,
  };
}

/** Replaces ALL local data with the backup, atomically. */
export async function restoreBackup(backup: BackupFile, options: { restoreApiKey: boolean }): Promise<TableCounts> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
      const rows = backup.tables[table.name];
      if (rows?.length) await table.bulkPut(rows);
    }
  });
  if (options.restoreApiKey && backup.secrets) {
    for (const p of PROVIDER_IDS) {
      const key = backup.secrets[SECRET_FIELD[p]];
      if (key) await setApiKey(key, p);
    }
  }
  return countRows(backup);
}
