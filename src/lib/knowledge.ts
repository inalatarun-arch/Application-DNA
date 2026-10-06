/**
 * Knowledge adapter
 * -----------------------------------------------------------------------------
 * Reads your EXISTING Knowledge Repository (the Dexie/IndexedDB database built in
 * Steps 1-5) WITHOUT needing to know its table names or fields:
 *   - it opens the database in "dynamic mode" (no schema supplied, read-only use),
 *   - scans every table that is not secret/system-like,
 *   - scores each row against the requirement text (keyword + identifier match),
 *   - returns the most relevant rows as numbered snippets (K1, K2...) that are
 *     injected into the Gemini prompt so answers are grounded in YOUR documentation.
 */
import Dexie from 'dexie';
import type { ContextRef, Project, Requirement, RequirementType } from '../db/deliveryDb';

const LS_SOURCE = 'eih.knowledge.dbName';
const OWN_DBS = new Set(['eih-delivery', 'eih-vault']);
const SKIP_TABLE = /(setting|secret|apikey|api_key|token|credential|vault|cache|log$|logs$|audit|session)/i;
const SKIP_FIELD = /(image|screenshot|blob|base64|recording|thumbnail|attachment|binary|password|secret|apikey)/i;

export interface Snippet extends ContextRef {
  text: string;
  score: number;
}

export interface GatherResult {
  snippets: Snippet[];
  tablesScanned: { name: string; rows: number }[];
  dbName: string | null;
  warning?: string;
}

export function getKnowledgeDbName(): string {
  try {
    return localStorage.getItem(LS_SOURCE) || '';
  } catch {
    return '';
  }
}
export function setKnowledgeDbName(name: string): void {
  try {
    localStorage.setItem(LS_SOURCE, name);
  } catch {
    /* ignore */
  }
}

/** Lists IndexedDB databases in this browser origin (excluding this module's own). */
export async function listKnowledgeCandidates(): Promise<string[]> {
  const anyIdb = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
  if (typeof anyIdb.databases !== 'function') return [];
  const dbs = await anyIdb.databases();
  return dbs.map((d) => d.name ?? '').filter((n) => n && !OWN_DBS.has(n));
}

async function openExisting(name: string): Promise<Dexie> {
  const db = new Dexie(name);
  await db.open(); // dynamic mode: schema is read from the existing database
  return db;
}

const STOP = new Set(
  'the and for with that this from will have has are was were not but can all any should must shall when then than into onto upon within about after before between also each per via its their there which what who whom whose while where been being able need needs using use used new existing system user users data'.split(
    ' ',
  ),
);

function tokens(text: string): { words: Set<string>; idents: Set<string> } {
  const words = new Set<string>();
  const idents = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9_]{2,}/g)) {
    const w = m[0];
    if (/^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(w)) idents.add(w.toLowerCase()); // AP_SUPPLIERS style
    const lw = w.toLowerCase();
    if (lw.length > 3 && !STOP.has(lw)) words.add(lw);
  }
  return { words, idents };
}

function flatten(value: unknown, depth = 0): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.startsWith('data:') ? '' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (depth > 3) return '';
  if (Array.isArray(value)) return value.map((v) => flatten(v, depth + 1)).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    if (typeof Blob !== 'undefined' && value instanceof Blob) return '';
    const parts: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SKIP_FIELD.test(k)) continue;
      const f = flatten(v, depth + 1);
      if (f) parts.push(`${k}: ${f}`);
    }
    return parts.join(' | ');
  }
  return '';
}

function labelOf(row: Record<string, unknown>): string {
  for (const k of ['name', 'title', 'screenName', 'label', 'endpoint', 'path', 'tableName', 'summary']) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80);
  }
  return 'record';
}

export interface GatherOptions {
  maxSnippets?: number;
  perTableCap?: number;
  snippetChars?: number;
  /** Extra text (e.g. other requirements) that should also drive relevance. */
  dbName?: string;
}

export async function gatherKnowledge(queryText: string, opts: GatherOptions = {}): Promise<GatherResult> {
  const dbName = opts.dbName ?? getKnowledgeDbName();
  const maxSnippets = opts.maxSnippets ?? 24;
  const perTableCap = opts.perTableCap ?? 8;
  const snippetChars = opts.snippetChars ?? 900;
  if (!dbName) {
    return {
      snippets: [],
      tablesScanned: [],
      dbName: null,
      warning: 'No Knowledge Repository database selected - the analysis will not be grounded in your documentation.',
    };
  }

  let db: Dexie;
  try {
    db = await openExisting(dbName);
  } catch (e) {
    return {
      snippets: [],
      tablesScanned: [],
      dbName,
      warning: `Could not open knowledge database "${dbName}": ${e instanceof Error ? e.message : 'unknown error'}`,
    };
  }

  try {
    const q = tokens(queryText);
    const scanned: { name: string; rows: number }[] = [];
    const scored: (Snippet & { table: string })[] = [];

    for (const table of db.tables) {
      if (SKIP_TABLE.test(table.name)) continue;
      let rows: Record<string, unknown>[] = [];
      try {
        rows = (await table.limit(3000).toArray()) as Record<string, unknown>[];
      } catch {
        continue;
      }
      scanned.push({ name: table.name, rows: rows.length });
      const local: (Snippet & { table: string })[] = [];
      for (const row of rows) {
        const flat = flatten(row);
        if (!flat) continue;
        const t = tokens(flat);
        let score = 0;
        q.words.forEach((w) => {
          if (t.words.has(w)) score += 1;
        });
        q.idents.forEach((i) => {
          if (flat.toLowerCase().includes(i)) score += 5;
        });
        if (score === 0) continue;
        local.push({
          id: '',
          source: table.name,
          label: labelOf(row),
          text: flat.length > snippetChars ? flat.slice(0, snippetChars) + ' ...' : flat,
          score,
          table: table.name,
        });
      }
      local.sort((a, b) => b.score - a.score);
      scored.push(...local.slice(0, perTableCap));
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, maxSnippets).map((s, i) => ({ ...s, id: `K${i + 1}` }));
    const result: GatherResult = { snippets: top, tablesScanned: scanned, dbName };
    if (top.length === 0)
      result.warning =
        scanned.length === 0
          ? `Database "${dbName}" has no readable tables.`
          : 'No records in the Knowledge Repository matched this text. The result will rely on general reasoning only.';
    return result;
  } finally {
    db.close();
  }
}

/** Renders snippets as the context block placed in the prompt. */
export function formatContext(snippets: Snippet[]): string {
  if (snippets.length === 0) return '(no matching records found in the Knowledge Repository)';
  return snippets.map((s) => `[${s.id}] (${s.source}) ${s.label}\n${s.text}`).join('\n\n');
}

/* ----------------- optional: import existing projects/requirements ----------------- */

function pickString(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export async function listExistingProjects(dbName: string): Promise<Pick<Project, 'name' | 'description' | 'applications'>[]> {
  const db = await openExisting(dbName);
  try {
    const table = db.tables.find((t) => /project/i.test(t.name) && !SKIP_TABLE.test(t.name));
    if (!table) return [];
    const rows = (await table.limit(500).toArray()) as Record<string, unknown>[];
    return rows
      .map((r) => ({
        name: pickString(r, ['name', 'title', 'projectName']),
        description: pickString(r, ['description', 'summary', 'details']),
        applications: Array.isArray(r.applications) ? (r.applications as unknown[]).map(String).join(', ') : pickString(r, ['applications', 'application']),
      }))
      .filter((p) => p.name);
  } finally {
    db.close();
  }
}

export async function listExistingRequirements(
  dbName: string,
): Promise<Pick<Requirement, 'title' | 'text' | 'type'>[]> {
  const db = await openExisting(dbName);
  try {
    const table = db.tables.find((t) => /requirement/i.test(t.name) && !SKIP_TABLE.test(t.name));
    if (!table) return [];
    const rows = (await table.limit(1000).toArray()) as Record<string, unknown>[];
    const types: RequirementType[] = ['Functional', 'Non-Functional', 'Reporting', 'Integration', 'Change Request'];
    return rows
      .map((r) => {
        const text = pickString(r, ['text', 'description', 'content', 'requirement', 'body', 'details']);
        const rawType = pickString(r, ['type', 'category', 'kind']);
        const type = types.find((t) => t.toLowerCase() === rawType.toLowerCase()) ?? 'Functional';
        return { title: pickString(r, ['title', 'name', 'summary']) || text.slice(0, 60), text, type };
      })
      .filter((r) => r.text);
  } finally {
    db.close();
  }
}
