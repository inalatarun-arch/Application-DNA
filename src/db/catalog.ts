/** Create / update / delete operations for the Application Knowledge Repository, including cascades. */
import { db, newId, nowIso } from './db';
import type { AppModule, Application, BaseEntity, CriticalTier, Functionality, Screen, TechnicalComponent, TechnicalComponentKind } from './types';

export const CRITICAL_TIERS: Array<{ id: CriticalTier; label: string; description: string }> = [
  { id: 'tier-1', label: 'Tier 1', description: 'Mission critical' },
  { id: 'tier-2', label: 'Tier 2', description: 'Business critical' },
  { id: 'tier-3', label: 'Tier 3', description: 'Business operational' },
  { id: 'tier-4', label: 'Tier 4', description: 'Non-critical' },
];

export const VENDOR_PRESETS = [
  'Salesforce',
  'Oracle E-Business Suite',
  'SAP',
  'ServiceNow',
  'Workday',
  'APECS',
  'Custom application',
];

export const DOMAIN_SUGGESTIONS = [
  'Finance',
  'Procurement',
  'Supply chain',
  'Human resources',
  'Sales & CRM',
  'IT service management',
  'Clinical operations',
  'Analytics & reporting',
];

function stamp(): BaseEntity {
  const t = nowIso();
  return { id: newId(), createdAt: t, updatedAt: t };
}

// ------------------------------------------------------------------ applications

export type ApplicationInput = Omit<Application, keyof BaseEntity>;

export function emptyApplicationInput(): ApplicationInput {
  return {
    name: '',
    vendor: '',
    domain: '',
    technicalStack: [],
    criticalTier: 'tier-3',
    description: '',
    businessOwner: '',
    technicalOwner: '',
    tags: [],
  };
}

function tidy(input: ApplicationInput): ApplicationInput {
  return {
    ...input,
    name: input.name.trim(),
    vendor: input.vendor.trim(),
    domain: input.domain.trim(),
    description: input.description.trim(),
    businessOwner: input.businessOwner.trim(),
    technicalOwner: input.technicalOwner.trim(),
    technicalStack: input.technicalStack.filter((s) => s.trim()),
    tags: input.tags.filter((s) => s.trim()),
  };
}

export async function applicationNameExists(name: string, exceptId?: string): Promise<boolean> {
  const n = await db.applications
    .where('name')
    .equalsIgnoreCase(name.trim())
    .filter((a) => a.id !== exceptId)
    .count();
  return n > 0;
}

export async function createApplication(input: ApplicationInput): Promise<Application> {
  const app: Application = { ...stamp(), ...tidy(input) };
  await db.applications.add(app);
  return app;
}

export async function updateApplication(id: string, input: ApplicationInput): Promise<void> {
  await db.applications.update(id, { ...tidy(input), updatedAt: nowIso() });
}

export interface ApplicationStats {
  modules: number;
  screens: number;
  functionalities: number;
}

export async function countApplicationContents(id: string): Promise<ApplicationStats> {
  const [modules, screens, functionalities] = await Promise.all([
    db.modules.where('applicationId').equals(id).count(),
    db.screens.where('applicationId').equals(id).count(),
    db.functionalities.where('applicationId').equals(id).count(),
  ]);
  return { modules, screens, functionalities };
}

export async function deleteApplication(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.applications, db.modules, db.screens, db.screenMedia, db.functionalities, db.technicalComponents, db.projects],
    async () => {
      const screenIds = await db.screens.where('applicationId').equals(id).primaryKeys();
      const functionalityIds = await db.functionalities.where('applicationId').equals(id).primaryKeys();
      const componentIds = await db.technicalComponents.where('applicationId').equals(id).primaryKeys();

      // Components in other applications may point at things being deleted here.
      await detachFromComponents(screenIds, functionalityIds);
      await detachComponentRefs(componentIds);
      await db.technicalComponents.bulkDelete(componentIds);

      await db.functionalities.where('applicationId').equals(id).delete();
      await db.screenMedia.where('applicationId').equals(id).delete();
      await db.screens.where('applicationId').equals(id).delete();
      await db.modules.where('applicationId').equals(id).delete();
      await db.projects
        .where('applicationIds')
        .equals(id)
        .modify((p) => {
          p.applicationIds = p.applicationIds.filter((x) => x !== id);
        });
      await db.applications.delete(id);
    },
  );
}

/** Removes deleted screens/functionalities from every technical component that referenced them. */
async function detachFromComponents(screenIds: string[], functionalityIds: string[]): Promise<void> {
  if (screenIds.length) {
    await db.technicalComponents
      .where('screenIds')
      .anyOf(screenIds)
      .modify((c) => {
        c.screenIds = (c.screenIds ?? []).filter((x) => !screenIds.includes(x));
      });
  }
  if (functionalityIds.length) {
    await db.technicalComponents
      .where('functionalityIds')
      .anyOf(functionalityIds)
      .modify((c) => {
        c.functionalityIds = (c.functionalityIds ?? []).filter((x) => !functionalityIds.includes(x));
      });
  }
}

/** Removes deleted components from the "depends on" lists of the remaining components. */
async function detachComponentRefs(componentIds: string[]): Promise<void> {
  if (componentIds.length === 0) return;
  await db.technicalComponents
    .filter((c) => (c.relatedComponentIds ?? []).some((r) => componentIds.includes(r)))
    .modify((c) => {
      c.relatedComponentIds = c.relatedComponentIds.filter((r) => !componentIds.includes(r));
    });
}

// ------------------------------------------------------------------ modules

export async function createModule(applicationId: string, name: string, description = ''): Promise<AppModule> {
  const mod: AppModule = { ...stamp(), applicationId, name: name.trim(), description: description.trim(), owner: '' };
  await db.modules.add(mod);
  return mod;
}

export async function deleteModule(id: string): Promise<void> {
  await db.transaction('rw', [db.modules, db.screens, db.screenMedia, db.functionalities, db.technicalComponents], async () => {
    const screenIds = await db.screens.where('moduleId').equals(id).primaryKeys();
    if (screenIds.length) {
      const functionalityIds = await db.functionalities.where('screenId').anyOf(screenIds).primaryKeys();
      await detachFromComponents(screenIds, functionalityIds);
      await db.functionalities.bulkDelete(functionalityIds);
      await db.screenMedia.where('screenId').anyOf(screenIds).delete();
      await db.screens.bulkDelete(screenIds);
    }
    await db.modules.delete(id);
  });
}

// ------------------------------------------------------------------ screens

export async function createScreen(applicationId: string, moduleId: string | undefined, name: string, purpose = ''): Promise<Screen> {
  const screen: Screen = {
    ...stamp(),
    applicationId,
    moduleId,
    name: name.trim(),
    purpose: purpose.trim(),
    description: '',
    businessProcess: '',
    businessOwner: '',
    functionalOwner: '',
    navigationPath: '',
    fieldDescriptions: [],
    validationRules: [],
    workflowSteps: [],
    approvalLogic: '',
    exceptionHandling: [],
    upstreamSystems: [],
    downstreamSystems: [],
    relatedScreenIds: [],
  };
  await db.screens.add(screen);
  return screen;
}

export async function deleteScreen(id: string): Promise<void> {
  await db.transaction('rw', [db.screens, db.screenMedia, db.functionalities, db.technicalComponents], async () => {
    const functionalityIds = await db.functionalities.where('screenId').equals(id).primaryKeys();
    await detachFromComponents([id], functionalityIds);
    await db.functionalities.bulkDelete(functionalityIds);
    await db.screenMedia.where('screenId').equals(id).delete();
    await db.screens.delete(id);
  });
}

// ------------------------------------------------------------------ functionalities

export async function createFunctionality(
  screen: Pick<Screen, 'id' | 'applicationId' | 'moduleId'>,
  name: string,
  description = '',
): Promise<Functionality> {
  const fn: Functionality = {
    ...stamp(),
    applicationId: screen.applicationId,
    moduleId: screen.moduleId,
    screenId: screen.id,
    name: name.trim(),
    description: description.trim(),
    businessPurpose: '',
    processFlow: '',
    userRoles: [],
    triggers: [],
    inputs: [],
    outputs: [],
    exceptions: { validation: [], error: [], business: [], system: [] },
    relatedFunctionalityIds: [],
    upstreamSystems: [],
    downstreamSystems: [],
  };
  await db.functionalities.add(fn);
  return fn;
}

export async function deleteFunctionality(id: string): Promise<void> {
  await db.transaction('rw', [db.functionalities, db.technicalComponents], async () => {
    await detachFromComponents([], [id]);
    await db.functionalities.delete(id);
  });
}

// ------------------------------------------------------------------ technical components

export async function createTechnicalComponent(
  applicationId: string,
  kind: TechnicalComponentKind,
  name: string,
  description = '',
): Promise<TechnicalComponent> {
  const component: TechnicalComponent = {
    ...stamp(),
    applicationId,
    kind,
    name: name.trim(),
    description: description.trim(),
    definition: '',
    functionalityIds: [],
    screenIds: [],
    relatedComponentIds: [],
    metadata: {},
    columns: [],
  };
  await db.technicalComponents.add(component);
  return component;
}

export async function deleteTechnicalComponent(id: string): Promise<void> {
  await db.transaction('rw', db.technicalComponents, async () => {
    await detachComponentRefs([id]);
    await db.technicalComponents.delete(id);
  });
}

export type LinkTarget = 'screen' | 'functionality';

/** Tags a component as powering a screen or functionality (idempotent). */
export async function linkComponent(componentId: string, target: LinkTarget, targetId: string): Promise<void> {
  await db.transaction('rw', db.technicalComponents, async () => {
    const c = await db.technicalComponents.get(componentId);
    if (!c) return;
    const list = (target === 'screen' ? c.screenIds : c.functionalityIds) ?? [];
    if (list.includes(targetId)) return;
    const next = [...list, targetId];
    const patch = target === 'screen' ? { screenIds: next } : { functionalityIds: next };
    await db.technicalComponents.update(componentId, { ...patch, updatedAt: nowIso() });
  });
}

export async function unlinkComponent(componentId: string, target: LinkTarget, targetId: string): Promise<void> {
  await db.transaction('rw', db.technicalComponents, async () => {
    const c = await db.technicalComponents.get(componentId);
    if (!c) return;
    const next = ((target === 'screen' ? c.screenIds : c.functionalityIds) ?? []).filter((x) => x !== targetId);
    const patch = target === 'screen' ? { screenIds: next } : { functionalityIds: next };
    await db.technicalComponents.update(componentId, { ...patch, updatedAt: nowIso() });
  });
}
