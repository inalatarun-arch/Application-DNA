/**
 * Defensive cleaning of rows read from an imported backup file. A backup is untrusted input: this removes keys
 * that can poison object prototypes, rejects absurd nesting, and checks that every row is plain JSON data.
 */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 40;
export const MAX_BACKUP_BYTES = 150 * 1024 * 1024;

export class UnsafeImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeImportError';
  }
}

/** Returns a deep copy of a JSON value with forbidden keys removed. Throws on non-JSON values or excessive depth. */
export function cleanJson(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) throw new UnsafeImportError('The backup is nested too deeply to be valid.');
  if (value === null) return null;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'number') {
    if (!Number.isFinite(value as number)) throw new UnsafeImportError('The backup contains a number that is not valid.');
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => cleanJson(v, depth + 1));
  if (t === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      out[k] = cleanJson(v, depth + 1);
    }
    return out;
  }
  throw new UnsafeImportError('The backup contains a value that is not plain data.');
}

/** Cleans every row of a table and checks its primary key. */
export function cleanRows(table: string, rows: unknown[], primaryKey: string): Record<string, unknown>[] {
  return rows.map((row, i) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new UnsafeImportError(`Table "${table}", row ${i + 1}: not a record.`);
    }
    const clean = cleanJson(row) as Record<string, unknown>;
    const id = clean[primaryKey];
    if (typeof id !== 'string' || !id || id.length > 200) {
      throw new UnsafeImportError(`Table "${table}", row ${i + 1}: missing or invalid "${primaryKey}".`);
    }
    return clean;
  });
}
