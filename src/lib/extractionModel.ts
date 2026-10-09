import type { Application, TechnicalComponent } from '@/db/types';
import { asRecord, asStringArray, safeTrim } from './safeValue';

/**
 * Shape of the edit plan produced by Application ingestion, plus the code that makes any model output safe to use:
 * normalisation (types, enums, missing fields), de-duplication and merging of several partial plans.
 * Pure and dependency-free, so it is tested without a browser.
 */
export interface UiElementAI {
  name: string;
  type: 'field' | 'input' | 'button' | 'link' | 'table' | 'other';
  description: string;
  action: string;
  required: boolean;
}

export interface ApplicationExtraction {
  application: Partial<Pick<Application, 'name' | 'vendor' | 'domain' | 'technicalStack' | 'criticalTier' | 'description' | 'businessOwner' | 'technicalOwner' | 'tags'>>;
  modules: Array<{ operation: 'create' | 'update'; matchName: string; name: string; description: string; owner: string }>;
  screens: Array<{
    operation: 'create' | 'update';
    matchName: string;
    name: string;
    moduleName: string;
    purpose: string;
    description: string;
    businessProcess: string;
    businessOwner: string;
    functionalOwner: string;
    navigationPath: string;
    fieldDescriptions: Array<{ field: string; description: string }>;
    uiElements: UiElementAI[];
    validationRules: string[];
    workflowSteps: string[];
    approvalLogic: string;
    exceptionHandling: string[];
    upstreamSystems: string[];
    downstreamSystems: string[];
    relatedScreenNames: string[];
    sourceFiles: string[];
  }>;
  functionalities: Array<{
    operation: 'create' | 'update';
    matchName: string;
    screenName: string;
    moduleName: string;
    name: string;
    description: string;
    businessPurpose: string;
    processFlow: string;
    userRoles: string[];
    triggers: string[];
    inputs: string[];
    outputs: string[];
    exceptions: { validation: string[]; error: string[]; business: string[]; system: string[] };
    relatedFunctionalityNames: string[];
    upstreamSystems: string[];
    downstreamSystems: string[];
  }>;
  technicalComponents: Array<{
    operation: 'create' | 'update';
    matchName: string;
    kind: TechnicalComponent['kind'];
    name: string;
    description: string;
    definition: string;
    functionalityNames: string[];
    screenNames: string[];
    dependsOnNames: string[];
    metadata: Record<string, string>;
    columns: TechnicalComponent['columns'];
  }>;
}

export type ModuleItem = ApplicationExtraction['modules'][number];
export type ScreenItem = ApplicationExtraction['screens'][number];
export type FunctionalityItem = ApplicationExtraction['functionalities'][number];
export type ComponentItem = ApplicationExtraction['technicalComponents'][number];

export const COMPONENT_KIND_LIST: TechnicalComponent['kind'][] = ['class', 'package', 'method', 'service', 'api', 'table', 'view', 'procedure', 'trigger', 'rest', 'soap', 'middleware', 'queue', 'server', 'cloud', 'job'];
export const UI_TYPE_LIST: UiElementAI['type'][] = ['field', 'input', 'button', 'link', 'table', 'other'];

const objects = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.map(asRecord) : []);

export function normalizeApplicationExtraction(value: unknown): ApplicationExtraction {
  const root = asRecord(value);
  const app = asRecord(root.application);
  const modules = objects(root.modules).map((item) => ({
    operation: item.operation === 'update' ? 'update' as const : 'create' as const,
    matchName: safeTrim(item.matchName), name: safeTrim(item.name), description: safeTrim(item.description), owner: safeTrim(item.owner),
  }));
  const screens = objects(root.screens).map((item) => ({
    operation: item.operation === 'update' ? 'update' as const : 'create' as const,
    matchName: safeTrim(item.matchName), name: safeTrim(item.name), moduleName: safeTrim(item.moduleName), purpose: safeTrim(item.purpose),
    description: safeTrim(item.description), businessProcess: safeTrim(item.businessProcess), businessOwner: safeTrim(item.businessOwner),
    functionalOwner: safeTrim(item.functionalOwner), navigationPath: safeTrim(item.navigationPath),
    fieldDescriptions: objects(item.fieldDescriptions).map((field) => ({ field: safeTrim(field.field), description: safeTrim(field.description) })).filter((field) => field.field),
    uiElements: objects(item.uiElements).map((ui) => ({
      name: safeTrim(ui.name), type: UI_TYPE_LIST.includes(ui.type as UiElementAI['type']) ? ui.type as UiElementAI['type'] : 'other',
      description: safeTrim(ui.description), action: safeTrim(ui.action), required: ui.required === true,
    })).filter((ui) => ui.name),
    validationRules: asStringArray(item.validationRules), workflowSteps: asStringArray(item.workflowSteps),
    approvalLogic: safeTrim(item.approvalLogic), exceptionHandling: asStringArray(item.exceptionHandling),
    upstreamSystems: asStringArray(item.upstreamSystems), downstreamSystems: asStringArray(item.downstreamSystems),
    relatedScreenNames: asStringArray(item.relatedScreenNames), sourceFiles: asStringArray(item.sourceFiles),
  }));
  const functionalities = objects(root.functionalities).map((item) => {
    const exceptions = asRecord(item.exceptions);
    return {
      operation: item.operation === 'update' ? 'update' as const : 'create' as const,
      matchName: safeTrim(item.matchName), screenName: safeTrim(item.screenName), moduleName: safeTrim(item.moduleName), name: safeTrim(item.name),
      description: safeTrim(item.description), businessPurpose: safeTrim(item.businessPurpose), processFlow: safeTrim(item.processFlow),
      userRoles: asStringArray(item.userRoles), triggers: asStringArray(item.triggers), inputs: asStringArray(item.inputs), outputs: asStringArray(item.outputs),
      exceptions: { validation: asStringArray(exceptions.validation), error: asStringArray(exceptions.error), business: asStringArray(exceptions.business), system: asStringArray(exceptions.system) },
      relatedFunctionalityNames: asStringArray(item.relatedFunctionalityNames), upstreamSystems: asStringArray(item.upstreamSystems), downstreamSystems: asStringArray(item.downstreamSystems),
    };
  });
  const technicalComponents = objects(root.technicalComponents).map((item) => {
    const metadata = asRecord(item.metadata);
    const columns = objects(item.columns).map((column) => ({
      name: safeTrim(column.name), dataType: safeTrim(column.dataType), nullable: column.nullable !== false,
      key: (column.key === 'PK' || column.key === 'FK' ? column.key : '') as '' | 'PK' | 'FK',
      references: safeTrim(column.references), description: safeTrim(column.description),
    })).filter((column) => column.name);
    return {
      operation: item.operation === 'update' ? 'update' as const : 'create' as const,
      matchName: safeTrim(item.matchName), kind: COMPONENT_KIND_LIST.includes(item.kind as TechnicalComponent['kind']) ? item.kind as TechnicalComponent['kind'] : 'service',
      name: safeTrim(item.name), description: safeTrim(item.description), definition: safeTrim(item.definition),
      functionalityNames: asStringArray(item.functionalityNames), screenNames: asStringArray(item.screenNames), dependsOnNames: asStringArray(item.dependsOnNames),
      metadata: Object.fromEntries(Object.entries(metadata).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, v as string])),
      columns,
    };
  });
  const criticalTier = app.criticalTier === 'tier-1' || app.criticalTier === 'tier-2' || app.criticalTier === 'tier-3' || app.criticalTier === 'tier-4' ? app.criticalTier : undefined;
  return {
    application: {
      name: safeTrim(app.name), vendor: safeTrim(app.vendor), domain: safeTrim(app.domain), description: safeTrim(app.description),
      businessOwner: safeTrim(app.businessOwner), technicalOwner: safeTrim(app.technicalOwner), technicalStack: asStringArray(app.technicalStack),
      tags: asStringArray(app.tags), ...(criticalTier ? { criticalTier } : {}),
    },
    modules: modules.filter((m) => m.name), screens: screens.filter((s) => s.name), functionalities: functionalities.filter((f) => f.name), technicalComponents: technicalComponents.filter((c) => c.name),
  };
}

// ---------------------------------------------------------------- merging

const norm = (s: string) => s.trim().toLowerCase();
export const unionStrings = (a: string[], b: string[]) => {
  const seen = new Set<string>();
  return [...a, ...b].filter((x) => {
    const k = norm(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
export const unionByKey = <T,>(a: T[], b: T[], key: (x: T) => string) => {
  const seen = new Set<string>();
  return [...a, ...b].filter((x) => {
    const k = norm(key(x));
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const longer = (a: string, b: string) => (b.length > a.length ? b : a);

/** Merges two items describing the same thing. Text keeps the fuller version; lists are united. */
function mergeItem<T extends object>(a: T, b: T): T {
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [k, bv] of Object.entries(b as Record<string, unknown>)) {
    const av = out[k];
    if (k === 'operation') out[k] = av === 'update' || bv === 'update' ? 'update' : 'create';
    else if (typeof av === 'string' && typeof bv === 'string') out[k] = longer(av, bv);
    else if (Array.isArray(av) && Array.isArray(bv)) {
      if (k === 'uiElements') out[k] = unionByKey(av as UiElementAI[], bv as UiElementAI[], (x) => x.name);
      else if (k === 'columns') out[k] = unionByKey(av as ComponentItem['columns'], bv as ComponentItem['columns'], (x) => x.name);
      else if (k === 'fieldDescriptions') out[k] = unionByKey(av as ScreenItem['fieldDescriptions'], bv as ScreenItem['fieldDescriptions'], (x) => x.field);
      else out[k] = unionStrings(av as string[], bv as string[]);
    } else if (av && bv && typeof av === 'object' && typeof bv === 'object') {
      if (k === 'exceptions') {
        const x = av as FunctionalityItem['exceptions'];
        const y = bv as FunctionalityItem['exceptions'];
        out[k] = { validation: unionStrings(x.validation, y.validation), error: unionStrings(x.error, y.error), business: unionStrings(x.business, y.business), system: unionStrings(x.system, y.system) };
      } else out[k] = { ...(av as object), ...(bv as object) };
    } else if (bv !== undefined && !av) out[k] = bv;
  }
  return out as T;
}

function mergeList<T extends { name: string }>(lists: T[][]): T[] {
  const byName = new Map<string, T>();
  for (const list of lists) {
    for (const item of list) {
      const k = norm(item.name);
      byName.set(k, byName.has(k) ? mergeItem(byName.get(k)!, item) : item);
    }
  }
  return [...byName.values()];
}

/** Combines several plans (for example one per batch of files) into one, merging items that share a name. */
export function mergeExtractions(plans: ApplicationExtraction[]): ApplicationExtraction {
  const app: ApplicationExtraction['application'] = {};
  for (const p of plans) {
    for (const [k, v] of Object.entries(p.application)) {
      const cur = (app as Record<string, unknown>)[k];
      if (Array.isArray(v)) (app as Record<string, unknown>)[k] = unionStrings((cur as string[]) ?? [], v as string[]);
      else if (typeof v === 'string' && v) (app as Record<string, unknown>)[k] = typeof cur === 'string' ? longer(cur, v) : v;
      else if (v && !cur) (app as Record<string, unknown>)[k] = v;
    }
  }
  return {
    application: app,
    modules: mergeList(plans.map((p) => p.modules)),
    screens: mergeList(plans.map((p) => p.screens)),
    functionalities: mergeList(plans.map((p) => p.functionalities)),
    technicalComponents: mergeList(plans.map((p) => p.technicalComponents)),
  };
}

export function countExtraction(e: ApplicationExtraction) {
  return { modules: e.modules.length, screens: e.screens.length, functionalities: e.functionalities.length, components: e.technicalComponents.length };
}

// ---------------------------------------------------------------- response schema

const S = { type: 'STRING' } as const;
const SA = { type: 'ARRAY', items: S } as const;
const OP = { type: 'STRING', enum: ['create', 'update'] } as const;
const strProps = (names: string[]) => Object.fromEntries(names.map((n) => [n, S]));

/** Gemini responseSchema for the full plan. Enums keep operation, UI types and component kinds valid at the source. */
export const EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    application: {
      type: 'OBJECT',
      properties: { ...strProps(['name', 'vendor', 'domain', 'description', 'businessOwner', 'technicalOwner']), technicalStack: SA, tags: SA, criticalTier: { type: 'STRING', enum: ['tier-1', 'tier-2', 'tier-3', 'tier-4'] } },
    },
    modules: { type: 'ARRAY', items: { type: 'OBJECT', properties: { operation: OP, ...strProps(['matchName', 'name', 'description', 'owner']) }, required: ['operation', 'name'] } },
    screens: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          operation: OP,
          ...strProps(['matchName', 'name', 'moduleName', 'purpose', 'description', 'businessProcess', 'businessOwner', 'functionalOwner', 'navigationPath', 'approvalLogic']),
          fieldDescriptions: { type: 'ARRAY', items: { type: 'OBJECT', properties: strProps(['field', 'description']), required: ['field'] } },
          uiElements: {
            type: 'ARRAY',
            items: { type: 'OBJECT', properties: { name: S, type: { type: 'STRING', enum: UI_TYPE_LIST }, description: S, action: S, required: { type: 'BOOLEAN' } }, required: ['name', 'type'] },
          },
          validationRules: SA, workflowSteps: SA, exceptionHandling: SA, upstreamSystems: SA, downstreamSystems: SA, relatedScreenNames: SA, sourceFiles: SA,
        },
        required: ['operation', 'name'],
      },
    },
    functionalities: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          operation: OP,
          ...strProps(['matchName', 'screenName', 'moduleName', 'name', 'description', 'businessPurpose', 'processFlow']),
          userRoles: SA, triggers: SA, inputs: SA, outputs: SA, relatedFunctionalityNames: SA, upstreamSystems: SA, downstreamSystems: SA,
          exceptions: { type: 'OBJECT', properties: { validation: SA, error: SA, business: SA, system: SA } },
        },
        required: ['operation', 'name'],
      },
    },
    technicalComponents: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          operation: OP, ...strProps(['matchName', 'name', 'description', 'definition']),
          kind: { type: 'STRING', enum: COMPONENT_KIND_LIST },
          functionalityNames: SA, screenNames: SA, dependsOnNames: SA,
          columns: {
            type: 'ARRAY',
            items: { type: 'OBJECT', properties: { name: S, dataType: S, nullable: { type: 'BOOLEAN' }, key: { type: 'STRING', enum: ['', 'PK', 'FK'] }, references: S, description: S }, required: ['name'] },
          },
        },
        required: ['operation', 'name', 'kind'],
      },
    },
  },
  required: ['application', 'modules', 'screens', 'functionalities', 'technicalComponents'],
} as const;
