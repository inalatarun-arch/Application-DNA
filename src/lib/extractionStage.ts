import { parseJsonLoose } from './jsonRepair';
import { asRecord, safeTrim } from './safeValue';
import {
  normalizeApplicationExtraction,
  type ApplicationExtraction,
  type ComponentItem,
  type FunctionalityItem,
  type ModuleItem,
  type ScreenItem,
} from './extractionModel';

/**
 * Review stage for Application ingestion: the model's plan is held as a list of items the user can include,
 * exclude, edit or send back to the model for changes before anything is written to the repository.
 */
export type StageType = 'module' | 'screen' | 'functionality' | 'component';
export type StageItem = ModuleItem | ScreenItem | FunctionalityItem | ComponentItem;

export interface StagedItem {
  ref: string;
  type: StageType;
  include: boolean;
  item: StageItem;
}

const PREFIX: Record<StageType, string> = { module: 'M', screen: 'S', functionality: 'F', component: 'C' };
const COLLECTION = { module: 'modules', screen: 'screens', functionality: 'functionalities', component: 'technicalComponents' } as const;

export const TYPE_LABEL: Record<StageType, string> = { module: 'Module', screen: 'Screen', functionality: 'Functionality', component: 'Component' };
export const normName = (s: string) => safeTrim(s).toLowerCase();

export function stageExtraction(ex: ApplicationExtraction): StagedItem[] {
  const out: StagedItem[] = [];
  const add = (type: StageType, items: StageItem[]) => items.forEach((item, i) => out.push({ ref: `${PREFIX[type]}${i + 1}`, type, include: true, item }));
  add('module', ex.modules);
  add('screen', ex.screens);
  add('functionality', ex.functionalities);
  add('component', ex.technicalComponents);
  return out;
}

/** Builds the plan to apply from the items the user kept. Keeps the application-level fields as given. */
export function toExtraction(base: ApplicationExtraction, staged: StagedItem[]): ApplicationExtraction {
  const pick = <T extends StageItem>(type: StageType) => staged.filter((s) => s.type === type && s.include).map((s) => s.item as T);
  return {
    application: base.application,
    modules: pick<ModuleItem>('module'),
    screens: pick<ScreenItem>('screen'),
    functionalities: pick<FunctionalityItem>('functionality'),
    technicalComponents: pick<ComponentItem>('component'),
  };
}

export interface ExistingNames {
  module: Set<string>;
  screen: Set<string>;
  functionality: Set<string>;
  component: Set<string>;
}

/** What applying the item will do. The repository decides, not the model's own "operation" label. */
export function resolveAction(s: StagedItem, existing: ExistingNames): 'create' | 'update' {
  const item = s.item as { name: string; matchName: string };
  return existing[s.type].has(normName(item.matchName || item.name)) ? 'update' : 'create';
}

/** Short summary line for a staged item, shown in the list. */
export function summarize(s: StagedItem): string {
  const i = s.item as Record<string, unknown>;
  const n = (k: string) => (Array.isArray(i[k]) ? (i[k] as unknown[]).length : 0);
  switch (s.type) {
    case 'module':
      return safeTrim(i.description) || 'No description';
    case 'screen':
      return [`${n('uiElements')} controls`, `${n('validationRules')} rules`, `${n('workflowSteps')} steps`].join(', ');
    case 'functionality':
      return [`${n('userRoles')} roles`, `${n('inputs')} inputs`, `${n('outputs')} outputs`].join(', ');
    case 'component':
      return `${String(i.kind)}${n('columns') ? `, ${n('columns')} columns` : ''}`;
  }
}

/** Compact listing sent to the model when asking for changes: ref, name and the facts a reviewer would refer to. */
export function stagedForPrompt(staged: StagedItem[], maxChars = 600): string {
  return staged
    .map((s) => {
      const i = s.item as Record<string, unknown>;
      const text = JSON.stringify(i, (_k, v) => (v === '' || (Array.isArray(v) && v.length === 0) ? undefined : v));
      return `${s.ref}${s.include ? '' : ' (excluded)'} ${s.type} ${text.length > maxChars ? `${text.slice(0, maxChars)}...` : text}`;
    })
    .join('\n');
}

// ---------------------------------------------------------------- AI revisions

export interface Revision {
  patches: Array<{ ref: string; fields: Record<string, unknown> }>;
  remove: string[];
  add: Array<{ type: StageType; item: Record<string, unknown> }>;
  note: string;
}

const asObject = (v: unknown): Record<string, unknown> => {
  if (typeof v === 'string' && v.trim()) {
    try {
      return asRecord(parseJsonLoose(v).value);
    } catch {
      return {};
    }
  }
  return asRecord(v);
};

/** Reads the model's answer (strings holding JSON or real objects) into a Revision. */
export function parseRevision(raw: unknown): Revision {
  const r = asRecord(raw);
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const types: StageType[] = ['module', 'screen', 'functionality', 'component'];
  return {
    patches: list(r.patches)
      .map((p) => ({ ref: safeTrim(asRecord(p).ref), fields: asObject(asRecord(p).fieldsJson ?? asRecord(p).fields) }))
      .filter((p) => p.ref && Object.keys(p.fields).length),
    remove: list(r.remove).map((x) => safeTrim(x)).filter(Boolean),
    add: list(r.add)
      .map((a) => ({ type: safeTrim(asRecord(a).type) as StageType, item: asObject(asRecord(a).itemJson ?? asRecord(a).item) }))
      .filter((a) => types.includes(a.type) && Object.keys(a.item).length),
    note: safeTrim(r.note),
  };
}

function clean(type: StageType, raw: Record<string, unknown>): StageItem | undefined {
  const key = COLLECTION[type];
  const normalised = normalizeApplicationExtraction({ [key]: [raw] });
  return (normalised[key] as StageItem[])[0];
}

/** Applies a revision to the staged list. Unknown refs are ignored; every edited item is re-normalised. */
export function applyRevision(staged: StagedItem[], rev: Revision): { staged: StagedItem[]; changed: string[]; ignored: string[] } {
  const changed: string[] = [];
  const ignored: string[] = [];
  let next = staged.map((s) => ({ ...s }));
  for (const p of rev.patches) {
    const idx = next.findIndex((s) => s.ref === p.ref);
    if (idx < 0) {
      ignored.push(p.ref);
      continue;
    }
    // The item's own name stays unless the patch renames it; "operation" is decided by the repository, not the patch.
    const { operation: _op, ...fields } = p.fields;
    const merged = clean(next[idx].type, { ...(next[idx].item as object), ...fields });
    if (merged) {
      next[idx] = { ...next[idx], item: merged };
      changed.push(p.ref);
    } else ignored.push(p.ref);
  }
  for (const ref of rev.remove) {
    const idx = next.findIndex((s) => s.ref === ref);
    if (idx < 0) ignored.push(ref);
    else {
      next[idx] = { ...next[idx], include: false };
      changed.push(ref);
    }
  }
  for (const a of rev.add) {
    const item = clean(a.type, a.item);
    if (!item) continue;
    const used = next.filter((s) => s.type === a.type).map((s) => Number(s.ref.slice(1)) || 0);
    const ref = `${PREFIX[a.type]}${Math.max(0, ...used) + 1}`;
    next = [...next, { ref, type: a.type, include: true, item }];
    changed.push(ref);
  }
  return { staged: next, changed, ignored };
}

export const REVISION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    patches: { type: 'ARRAY', items: { type: 'OBJECT', properties: { ref: { type: 'STRING' }, fieldsJson: { type: 'STRING' } }, required: ['ref', 'fieldsJson'] } },
    remove: { type: 'ARRAY', items: { type: 'STRING' } },
    add: { type: 'ARRAY', items: { type: 'OBJECT', properties: { type: { type: 'STRING', enum: ['module', 'screen', 'functionality', 'component'] }, itemJson: { type: 'STRING' } }, required: ['type', 'itemJson'] } },
    note: { type: 'STRING' },
  },
  required: ['patches', 'remove', 'add'],
} as const;
