import type { Application, CriticalTier } from '@/db/types';
import { asRecord, asStringArray, safeTrim } from './safeValue';

/**
 * Bulk import of many applications from one file. Pure and dependency-free (tested without a browser):
 *  - parsing and column mapping for spreadsheets / CSV, so structured inventories need no AI,
 *  - normalising anything the AI returns,
 *  - matching rows against the applications that already exist, so an import never creates duplicates.
 */

export interface InventoryModule {
  name: string;
  description: string;
}

export interface InventoryApp {
  name: string;
  vendor: string;
  domain: string;
  technicalStack: string[];
  criticalTier: CriticalTier | '';
  description: string;
  businessOwner: string;
  technicalOwner: string;
  tags: string[];
  modules: InventoryModule[];
}

export const normKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const emptyApp = (name: string): InventoryApp => ({
  name, vendor: '', domain: '', technicalStack: [], criticalTier: '', description: '', businessOwner: '', technicalOwner: '', tags: [], modules: [],
});

// ------------------------------------------------------------------ tier

/** "Tier 1", "1", "P1", "mission critical", "tier-2", "high" ... to the app's tier ids. '' when it cannot tell. */
export function parseTier(raw: unknown): CriticalTier | '' {
  const v = safeTrim(raw).toLowerCase();
  if (!v) return '';
  const digit = /(?<!\d)([1-4])(?!\d)/.exec(v);
  if (digit) return `tier-${digit[1]}` as CriticalTier;
  if (/mission|critical(?!.*non)|very high|crown/.test(v) && !/non[- ]?critical|business critical/.test(v)) return 'tier-1';
  if (/business critical|high/.test(v)) return 'tier-2';
  if (/operational|medium|moderate/.test(v)) return 'tier-3';
  if (/non[- ]?critical|low|minor/.test(v)) return 'tier-4';
  return '';
}

// ------------------------------------------------------------------ delimited text

/** Splits one delimited document into rows, honouring quotes, doubled quotes and newlines inside quotes. */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const d = delimiter ?? ([',', '\t', ';', '|'].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0]);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === d) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row.map((x) => x.trim()));
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row.map((x) => x.trim()));
  return rows;
}

// ------------------------------------------------------------------ column mapping

export type InventoryField = 'name' | 'vendor' | 'domain' | 'technicalStack' | 'criticalTier' | 'description' | 'businessOwner' | 'technicalOwner' | 'tags' | 'moduleName' | 'moduleDescription';

/** Header wording seen in real application inventories (CMDB exports, spreadsheets). First match wins. */
const SYNONYMS: Array<[InventoryField, RegExp]> = [
  ['moduleDescription', /^(sub ?)?(module|component|feature) (description|desc|purpose)$/],
  ['moduleName', /^(sub ?)?(module|component|feature|capability)( name)?s?$/],
  ['technicalOwner', /(technical|tech|it|engineering|support) (owner|lead|contact|manager|custodian)|^custodian$|^dev(elopment)? (team|lead)$/],
  ['businessOwner', /(business|product|process|functional|service|application|app|system) (owner|sponsor|lead|contact)|^(owner|sponsor)$/],
  ['criticalTier', /tier|criticality|critical(ity)? (level|rating|class)|^priority$|^rto class$|^service class$|^classification$/],
  ['technicalStack', /tech(nology)?( stack)?s?$|^stack$|^platform stack$|languages?|frameworks?|^tech used$|^built (with|on)$|^database$|^hosting$/],
  ['vendor', /^(platform|vendor|product|supplier|provider|publisher|manufacturer|software|package|technology platform)( name)?$|^vendor\/platform$|^platform \/ vendor$|^make$/],
  ['domain', /^(business )?(domain|function|area|capability|line of business|lob|department|category|portfolio|business unit|value stream)$/],
  ['description', /^(description|desc|summary|purpose|overview|about|notes?|details?|business purpose|what it does)$/],
  ['tags', /^(tags?|labels?|keywords?|compliance|regulatory|regulations?)$/],
  ['name', /^(application|app|system|service|software|product|solution)( name| title)?$|^name$|^title$|^application id name$|^ci name$|^asset name$/],
];

export interface ColumnMapping {
  /** Column index to field, for the columns we recognised. */
  fields: Map<number, InventoryField>;
  /** Headers we could not place, shown so the user knows what was ignored. */
  unmapped: string[];
}

export function mapColumns(headers: string[]): ColumnMapping {
  const fields = new Map<number, InventoryField>();
  const used = new Set<InventoryField>();
  const clean = headers.map((h) => h.toLowerCase().replace(/[_*]/g, ' ').replace(/\s+/g, ' ').trim());
  for (const [field, re] of SYNONYMS) {
    if (used.has(field)) continue;
    const i = clean.findIndex((h, idx) => !fields.has(idx) && h && re.test(h));
    if (i >= 0) { fields.set(i, field); used.add(field); }
  }
  const unmapped = headers.filter((h, i) => h.trim() && !fields.has(i));
  return { fields, unmapped };
}

const splitList = (v: string): string[] => v.split(/[;,|\n]+/).map((s) => s.trim()).filter(Boolean);

export interface TableImport {
  apps: InventoryApp[];
  mapping: ColumnMapping;
  headers: string[];
  rowCount: number;
}

/**
 * Reads a table whose first row is the header. Returns null when no application-name column can be found, so the
 * caller can hand the file to the AI instead. Several rows with the same name become one application with several modules.
 */
export function tableToInventory(rows: string[][]): TableImport | null {
  // The header is the first row that has a recognisable name column (skips title rows above it).
  let at = -1;
  let mapping: ColumnMapping | null = null;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const m = mapColumns(rows[i]);
    if ([...m.fields.values()].includes('name') && (m.fields.size >= 2 || rows.length - i > 1)) { at = i; mapping = m; break; }
  }
  if (at < 0 || !mapping) return null;
  const headers = rows[at];
  const byName = new Map<string, InventoryApp>();
  let dataRows = 0;
  for (const r of rows.slice(at + 1)) {
    const get = (f: InventoryField) => { for (const [idx, field] of mapping.fields) if (field === f) return (r[idx] ?? '').trim(); return ''; };
    const name = get('name');
    if (!name) continue;
    dataRows++;
    const key = normKey(name);
    const app = byName.get(key) ?? emptyApp(name);
    byName.set(key, app);
    app.vendor ||= get('vendor');
    app.domain ||= get('domain');
    app.description ||= get('description');
    app.businessOwner ||= get('businessOwner');
    app.technicalOwner ||= get('technicalOwner');
    app.criticalTier = app.criticalTier || parseTier(get('criticalTier'));
    app.technicalStack = mergeUnique(app.technicalStack, splitList(get('technicalStack')));
    app.tags = mergeUnique(app.tags, splitList(get('tags')));
    const mod = get('moduleName');
    if (mod && !app.modules.some((m) => normKey(m.name) === normKey(mod))) app.modules.push({ name: mod, description: get('moduleDescription') });
  }
  if (!byName.size) return null;
  return { apps: [...byName.values()], mapping, headers, rowCount: dataRows };
}

// ------------------------------------------------------------------ normalising and merging

export function mergeUnique(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  return [...a, ...b].filter((x) => { const k = normKey(x); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

/** Turns one loosely-typed record (from the AI or anywhere else) into a safe InventoryApp, or null without a name. */
export function normalizeApp(raw: unknown): InventoryApp | null {
  const r = asRecord(raw);
  const name = safeTrim(r.name).replace(/\s+/g, ' ');
  if (!name) return null;
  const mods = Array.isArray(r.modules) ? r.modules : [];
  const modules: InventoryModule[] = [];
  for (const m of mods) {
    const rec = typeof m === 'string' ? { name: m } : asRecord(m);
    const mn = safeTrim(rec.name);
    if (mn && !modules.some((x) => normKey(x.name) === normKey(mn))) modules.push({ name: mn, description: safeTrim(rec.description) });
  }
  const stack = Array.isArray(r.technicalStack) ? asStringArray(r.technicalStack) : splitList(safeTrim(r.technicalStack));
  const tags = Array.isArray(r.tags) ? asStringArray(r.tags) : splitList(safeTrim(r.tags));
  return {
    name, vendor: safeTrim(r.vendor), domain: safeTrim(r.domain), technicalStack: mergeUnique([], stack), criticalTier: parseTier(r.criticalTier),
    description: safeTrim(r.description), businessOwner: safeTrim(r.businessOwner), technicalOwner: safeTrim(r.technicalOwner), tags: mergeUnique([], tags), modules,
  };
}

export function normalizeInventory(raw: unknown): InventoryApp[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(asRecord(raw).applications) ? (asRecord(raw).applications as unknown[]) : [];
  return mergeInventories([list.map(normalizeApp).filter((a): a is InventoryApp => !!a)]);
}

const longer = (a: string, b: string) => (b.length > a.length ? b : a);

/** Combines several lists (several files or batches) into one, merging entries that name the same application. */
export function mergeInventories(lists: InventoryApp[][]): InventoryApp[] {
  const byName = new Map<string, InventoryApp>();
  for (const list of lists) {
    for (const a of list) {
      const key = normKey(a.name);
      const cur = byName.get(key);
      if (!cur) { byName.set(key, { ...a, technicalStack: [...a.technicalStack], tags: [...a.tags], modules: a.modules.map((m) => ({ ...m })) }); continue; }
      cur.vendor ||= a.vendor;
      cur.domain ||= a.domain;
      cur.businessOwner ||= a.businessOwner;
      cur.technicalOwner ||= a.technicalOwner;
      cur.criticalTier = cur.criticalTier || a.criticalTier;
      cur.description = longer(cur.description, a.description);
      cur.technicalStack = mergeUnique(cur.technicalStack, a.technicalStack);
      cur.tags = mergeUnique(cur.tags, a.tags);
      for (const m of a.modules) if (!cur.modules.some((x) => normKey(x.name) === normKey(m.name))) cur.modules.push({ ...m });
    }
  }
  return [...byName.values()];
}

// ------------------------------------------------------------------ matching against what already exists

export interface StagedApp {
  /** Stable key for the review table. */
  key: string;
  selected: boolean;
  app: InventoryApp;
  /** Set when an application with this name already exists; the import then fills its gaps instead of creating a copy. */
  existingId?: string;
  existingName?: string;
}

/** Existing applications are matched on name ignoring case, punctuation and spacing ("SAP ERP" = "sap-erp"). */
export function stageInventory(apps: InventoryApp[], existing: Pick<Application, 'id' | 'name'>[]): StagedApp[] {
  const byKey = new Map(existing.map((e) => [normKey(e.name), e]));
  return apps.map((app, i) => {
    const hit = byKey.get(normKey(app.name));
    return { key: `${i}-${normKey(app.name)}`, selected: true, app, existingId: hit?.id, existingName: hit?.name };
  });
}

/** What an update may change: only fields the existing record leaves blank, plus new list items. Manual edits are never overwritten. */
export function fillBlanks(existing: Application, incoming: InventoryApp): Partial<Application> {
  const patch: Partial<Application> = {};
  const fill = <K extends 'vendor' | 'domain' | 'description' | 'businessOwner' | 'technicalOwner'>(k: K) => {
    if (!safeTrim(existing[k]) && incoming[k]) patch[k] = incoming[k];
  };
  (['vendor', 'domain', 'description', 'businessOwner', 'technicalOwner'] as const).forEach(fill);
  const stack = mergeUnique(existing.technicalStack ?? [], incoming.technicalStack);
  if (stack.length !== (existing.technicalStack ?? []).length) patch.technicalStack = stack;
  const tags = mergeUnique(existing.tags ?? [], incoming.tags);
  if (tags.length !== (existing.tags ?? []).length) patch.tags = tags;
  return patch;
}

/** Tier used when the file gives none. Matches the manual form's default. */
export const DEFAULT_TIER: CriticalTier = 'tier-3';
/** Domain used when the file gives none, so the Domain filter stays tidy. */
export const DEFAULT_DOMAIN = 'Unclassified';
