import type { AppModule, Application, Functionality, Screen, TechnicalComponent } from '@/db/types';
import type { GraphSource } from './graphModel';
import { leadingId } from './catalogueModel';

/**
 * Turns the names a specification uses to point at things ("SCR-03.01.02 Document Upload", "APP-01 Supplier Request",
 * "CRM invitation") into the entities the platform holds, and reads integration components into plain records.
 * Everything here resolves what the documentation says; nothing here decides an order or invents a link.
 */

export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "SCR-01.01.01 Supplier Request" -> "supplier request". */
export function bareName(name: string): string {
  const id = leadingId(name);
  return norm(id ? name.trim().slice(id.length).replace(/^[\s:—–-]+/, '') : name);
}

/** The part of a name after its identifier: "FN-01 Create draft" -> "Create draft". */
export function titleOf(name: string): string {
  const id = leadingId(name);
  return (id ? name.trim().slice(id.length).replace(/^[\s:—–-]+/, '') : name.trim());
}

/**
 * What to call a function. Some records carry only the identifier ("FN-02.01.02-01"); the documented title then lives in the
 * first sentence of the description ("Update profile."), so it is appended rather than leaving the node nameless.
 */
export function displayName(f: { name: string; description?: string }): string {
  const name = f.name.trim();
  if (!leadingId(name) || titleOf(name)) return name;
  const first = (f.description ?? '').split(/(?<=[.!?])\s|\n/)[0]?.replace(/[.!?]+$/, '').trim() ?? '';
  return first ? `${name} ${first.charAt(0).toUpperCase()}${first.slice(1)}` : name;
}

/** Splits "A; B, C" lists the way specifications write them. Commas stay inside a phrase only when it has no semicolon. */
export function splitRefs(items: string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of items ?? []) {
    const parts = raw.includes(';') ? raw.split(';') : [raw];
    for (const p of parts) { const t = p.trim().replace(/\.$/, ''); if (t) out.push(t); }
  }
  return [...new Set(out)];
}

export interface Index {
  src: GraphSource;
  appById: Map<string, Application>;
  /** "APP-03" -> application, derived from the numbering of the application's own IDs. Undefined when it cannot be told. */
  appByCode: Map<string, Application>;
  codeOfApp: Map<string, string>;
  moduleById: Map<string, AppModule>;
  screenById: Map<string, Screen>;
  fnById: Map<string, Functionality>;
}

// Two digits at least: a bare "MOD-1" is not enough numbering to trust as an application code.
const APP_SEGMENT = /^[A-Za-z]{2,6}-(\d{2,3})(?=[.\-\s]|$)/;

/**
 * Specifications number every entity inside an application the same way (SCR-03.01.02, FN-03.01.02-01, INT-03-01 all
 * belong to "APP-03"). References such as "APP-03 Registration Wizard" can only be resolved through that code, because
 * the application's stored name does not carry it. An application whose numbering is missing or shared stays code-less.
 */
export function buildIndex(src: GraphSource): Index {
  const appById = new Map(src.applications.map((a) => [a.id, a]));
  const codeOfApp = new Map<string, string>();
  const claimed = new Map<string, string[]>();
  for (const app of src.applications) {
    const own = /^APP-(\d{1,3})\b/i.exec(app.name.trim());
    const votes = new Map<string, number>();
    if (own) votes.set(own[1], 100);
    const names = [
      ...src.modules.filter((m) => m.applicationId === app.id).map((m) => m.name),
      ...src.screens.filter((s) => s.applicationId === app.id).map((s) => s.name),
      ...src.functionalities.filter((f) => f.applicationId === app.id).map((f) => f.name),
      ...src.components.filter((c) => c.applicationId === app.id).map((c) => c.name),
    ];
    for (const n of names) { const m = APP_SEGMENT.exec(n.trim()); if (m) votes.set(m[1], (votes.get(m[1]) ?? 0) + 1); }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) { const code = `APP-${best[0].padStart(2, '0')}`; codeOfApp.set(app.id, code); claimed.set(code, [...(claimed.get(code) ?? []), app.id]); }
  }
  const appByCode = new Map<string, Application>();
  for (const [code, ids] of claimed) {
    if (ids.length === 1) appByCode.set(code, appById.get(ids[0])!);
    else for (const id of ids) codeOfApp.delete(id);
  }
  return {
    src, appById, appByCode, codeOfApp,
    moduleById: new Map(src.modules.map((m) => [m.id, m])),
    screenById: new Map(src.screens.map((s) => [s.id, s])),
    fnById: new Map(src.functionalities.map((f) => [f.id, f])),
  };
}

export type Ref =
  | { kind: 'screen'; screen: Screen }
  | { kind: 'function'; fn: Functionality }
  | { kind: 'module'; module: AppModule }
  | { kind: 'application'; app: Application; remainder: string }
  | { kind: 'external'; name: string };

const byBare = <T extends { name: string }>(list: T[], key: string): T | undefined => list.find((x) => bareName(x.name) === key);

/** Which entity a documentation reference points to. Unknown names are external systems or actors, never guessed into entities. */
export function resolveRef(text: string, idx: Index, ctxAppId?: string): Ref {
  const t = text.trim();
  const id = leadingId(t);
  if (id) {
    const screen = idx.src.screens.find((s) => leadingId(s.name) === id);
    if (screen) return { kind: 'screen', screen };
    const fn = idx.src.functionalities.find((f) => leadingId(f.name) === id);
    if (fn) return { kind: 'function', fn };
    const mod = idx.src.modules.find((m) => leadingId(m.name) === id);
    if (mod) return { kind: 'module', module: mod };
  }
  const code = /^(APP-\d{1,3})\b[\s:—–-]*(.*)$/i.exec(t);
  if (code) {
    const app = idx.appByCode.get(code[1].toUpperCase().replace(/APP-(\d+)/, (_, d: string) => `APP-${d.padStart(2, '0')}`));
    const rest = norm(code[2]);
    if (app) {
      if (!rest) return { kind: 'application', app, remainder: '' };
      const screen = byBare(idx.src.screens.filter((s) => s.applicationId === app.id), rest);
      if (screen) return { kind: 'screen', screen };
      const mod = byBare(idx.src.modules.filter((m) => m.applicationId === app.id), rest);
      if (mod) return { kind: 'module', module: mod };
      const fn = byBare(idx.src.functionalities.filter((f) => f.applicationId === app.id), rest);
      if (fn) return { kind: 'function', fn };
      return { kind: 'application', app, remainder: code[2].trim() };
    }
  }
  const key = norm(t);
  if (key) {
    const near = (list: Screen[]) => byBare(list.filter((s) => s.applicationId === ctxAppId), key) ?? byBare(list, key);
    const screen = near(idx.src.screens);
    if (screen) return { kind: 'screen', screen };
    const mod = byBare(idx.src.modules, key);
    if (mod) return { kind: 'module', module: mod };
    const fn = byBare(idx.src.functionalities, key);
    if (fn) return { kind: 'function', fn };
  }
  return { kind: 'external', name: t };
}

/** The application a free-text system name ("APP-02 Accounts Payable", "Supplier Self-Service") refers to, if any. */
export function resolveApp(text: string, idx: Index): Application | null {
  const t = text.trim();
  if (!t) return null;
  const ref = resolveRef(t, idx);
  if (ref.kind === 'application') return ref.app;
  const words = norm(t.replace(/^APP-\d+\b[\s:—–-]*/i, '')).split(' ').filter(Boolean);
  // Free text often trails off into description ("Accounts Payable inbound integration"), so shorter and shorter
  // beginnings are tried, never below two words, and only a single matching application counts.
  for (let n = words.length; n >= Math.min(2, words.length) && n > 0; n--) {
    const key = words.slice(0, n).join(' ');
    const hits = idx.src.applications.filter((a) => { const k = norm(a.name); return k === key || k.includes(key) || (key.length > 8 && key.includes(k)); });
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}

// ------------------------------------------------------------------ integrations

export type Mechanism = 'api' | 'event' | 'queue' | 'file' | 'callback' | 'unknown';

export interface Integration {
  id: string;
  component: TechnicalComponent;
  type: string;
  source: string;
  target: string;
  sourceApp: Application | null;
  targetApp: Application | null;
  direction: string;
  frequency: string;
  payload: string;
  authentication: string;
  errorHandling: string;
  owner: string;
  mechanism: Mechanism;
}

/** What kind of transfer it is, read from the documented type and frequency; never assumed to be real-time. */
export function mechanismOf(type: string, frequency: string): Mechanism {
  const t = `${type} ${frequency}`.toLowerCase();
  if (/sftp|flat file|\bfile\b|batch|csv|\bftp\b|cron|nightly|weekday|scheduled/.test(t)) return 'file';
  if (/queue|jms|kafka|\bmq\b|message bus|service bus/.test(t)) return 'queue';
  if (/callback|webhook/.test(t)) return 'callback';
  if (/event|publish|subscribe|async/.test(t)) return 'event';
  if (/rest|soap|\bapi\b|http|graphql|rpc/.test(t)) return 'api';
  return 'unknown';
}

const FACT_KEYS = ['integrationType', 'source', 'target', 'direction', 'frequency', 'payload', 'authentication', 'errorHandling', 'owner'] as const;

/** Reads "integrationType: X; source: Y; ..." runs out of free text. Values may contain semicolons, so keys mark the cut points. */
export function parseFacts(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = new RegExp(`\\b(${FACT_KEYS.join('|')}):\\s*`, 'g');
  const marks = [...text.matchAll(re)];
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index! : text.length;
    const value = text.slice(m.index! + m[0].length, end).trim().replace(/[;.]$/, '').trim();
    if (value && !out[m[1]]) out[m[1]] = value;
  });
  return out;
}

/** Source and target named in a title or sentence ("A to B", "A → B", "from A to B"). Used only when no structured facts exist. */
export function endpointsFrom(text: string): { source: string; target: string } | null {
  const t = text.trim();
  const arrow = /^(.+?)\s*(?:→|->|=>)\s*(.+)$/.exec(t);
  const from = /\bfrom\s+(.+?)\s+to\s+(.+?)(?:[:;]|\.\s|\.$|$)/i.exec(t);
  const plain = /^(.+?)\s+to\s+(.+)$/i.exec(t);
  const m = arrow ?? from ?? plain;
  if (!m) return null;
  const clean = (x: string) => x.trim().replace(/^[\s:—–-]+|[\s.:;]+$/g, '');
  const source = clean(m[1]);
  const target = clean(m[2]);
  return source && target ? { source, target } : null;
}

/**
 * Integration components as plain records. Facts come from the component's metadata; records imported before metadata was
 * captured keep them as "key: value" text in the definition or description, and some only name the two ends in their title.
 * A record with no ID of its own whose two applications are already connected by an identified integration only restates it and is dropped.
 */
export function integrationsOf(idx: Index): Integration[] {
  const list = idx.src.components.filter((c) => c.kind === 'integration').map((c): Integration => {
    const facts = { ...parseFacts(c.description ?? ''), ...parseFacts(c.definition ?? ''), ...(c.metadata ?? {}) };
    const id = leadingId(c.name) || c.name;
    const titled = endpointsFrom(c.name.replace(leadingId(c.name), '')) ?? endpointsFrom(c.description ?? '');
    const source = facts.source ?? titled?.source ?? '';
    const target = facts.target ?? titled?.target ?? '';
    const type = facts.integrationType ?? '';
    return {
      id, component: c, type, source, target, sourceApp: resolveApp(source, idx), targetApp: resolveApp(target, idx),
      direction: facts.direction ?? '', frequency: facts.frequency ?? '', payload: facts.payload ?? '', authentication: facts.authentication ?? '',
      errorHandling: facts.errorHandling ?? '', owner: facts.owner ?? '', mechanism: mechanismOf(type, facts.frequency ?? ''),
    };
  });
  const pair = (i: Integration) => (i.sourceApp && i.targetApp ? `${i.sourceApp.id}>${i.targetApp.id}` : '');
  const identified = list.filter((i) => leadingId(i.component.name));
  return list.filter((i) => {
    if (leadingId(i.component.name) || !pair(i)) return true;
    return identified.filter((o) => pair(o) === pair(i)).length === 0;
  });
}

export interface HandoffLookup {
  /** Integrations whose documented source is `from` and target is `to`. */
  matches: Integration[];
  /** Integrations documented only in the opposite direction. */
  reverse: Integration[];
}

export function findIntegrations(all: Integration[], from: Application, to: Application): HandoffLookup {
  return {
    matches: all.filter((i) => i.sourceApp?.id === from.id && i.targetApp?.id === to.id),
    reverse: all.filter((i) => i.sourceApp?.id === to.id && i.targetApp?.id === from.id),
  };
}

export const MECHANISM_LABEL: Record<Mechanism, string> = { api: 'API call', event: 'event', queue: 'queue', file: 'file / batch', callback: 'callback', unknown: 'mechanism not stated' };
