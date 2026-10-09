import { db, newId, nowIso } from '@/db/db';
import type { Application, Functionality, Screen, TechnicalComponent } from '@/db/types';
import type { ApplicationExtraction } from '@/lib/extractionModel';
import { unionByKey, unionStrings } from '@/lib/extractionModel';
import { safeTrim } from '@/lib/safeValue';

const key = (v: unknown) => safeTrim(v).toLowerCase();

/** Only fields the plan actually filled in. An update must never blank what the repository already holds. */
function filled<T extends object>(patch: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null) out[k] = v;
  }
  return out as Partial<T>;
}

const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

export interface IngestionResult {
  modules: number;
  screens: number;
  functionalities: number;
  components: number;
  updatedModules: number;
  updatedScreens: number;
  updatedFunctionalities: number;
  updatedComponents: number;
}

/**
 * Writes an extraction plan to the repository in one transaction.
 * Whether an item is created or updated is decided by the repository (does a record with that name exist?),
 * not by the model's own label, so a plan can never create duplicates or "update" something that is not there.
 * Updates merge: text is replaced only when the plan has text, lists are united with what is already stored.
 */
export async function applyApplicationExtraction(
  app: Application,
  extraction: ApplicationExtraction,
  imageFiles: File[] = [],
): Promise<IngestionResult> {
  const now = nowIso();
  const counts = { createdModules: 0, updatedModules: 0, createdScreens: 0, updatedScreens: 0, createdFunctionalities: 0, updatedFunctionalities: 0, createdComponents: 0, updatedComponents: 0 };

  // Read image bytes before opening the transaction: awaiting a FileReader inside it would let IndexedDB auto-commit early.
  const imageData = new Map<string, string>();
  for (const item of extraction.screens ?? []) {
    for (const file of imageFiles.filter((f) => (item.sourceFiles ?? []).includes(f.name))) {
      if (!imageData.has(file.name)) imageData.set(file.name, await readDataUrl(file));
    }
  }

  await db.transaction('rw', [db.applications, db.modules, db.screens, db.screenMedia, db.functionalities, db.technicalComponents], async () => {
    const appPatch: Partial<Application> = filled({
      name: extraction.application.name, vendor: extraction.application.vendor, domain: extraction.application.domain,
      description: extraction.application.description, businessOwner: extraction.application.businessOwner,
      technicalOwner: extraction.application.technicalOwner, criticalTier: extraction.application.criticalTier,
    });
    if (extraction.application.technicalStack?.length) appPatch.technicalStack = unionStrings(app.technicalStack ?? [], extraction.application.technicalStack);
    if (extraction.application.tags?.length) appPatch.tags = unionStrings(app.tags ?? [], extraction.application.tags);
    if (Object.keys(appPatch).length) await db.applications.update(app.id, { ...appPatch, updatedAt: now });

    // ---- modules
    const modules = await db.modules.where('applicationId').equals(app.id).toArray();
    const moduleByName = new Map(modules.map((m) => [key(m.name), m]));
    for (const item of extraction.modules ?? []) {
      const name = safeTrim(item.name);
      if (!name) continue;
      const existing = moduleByName.get(key(item.matchName || name));
      if (existing) {
        const patch = filled({ name, description: item.description, owner: item.owner });
        await db.modules.update(existing.id, { ...patch, updatedAt: now });
        moduleByName.delete(key(existing.name));
        moduleByName.set(key(name), { ...existing, ...patch });
        counts.updatedModules++;
      } else {
        const created = { id: newId(), createdAt: now, updatedAt: now, applicationId: app.id, name, description: item.description ?? '', owner: item.owner ?? '' };
        await db.modules.add(created);
        moduleByName.set(key(name), created);
        counts.createdModules++;
      }
    }

    // ---- screens
    const screens = await db.screens.where('applicationId').equals(app.id).toArray();
    const screenByName = new Map(screens.map((s) => [key(s.name), s]));
    for (const item of extraction.screens ?? []) {
      const name = safeTrim(item.name);
      if (!name) continue;
      const mod = moduleByName.get(key(item.moduleName));
      const existing = screenByName.get(key(item.matchName || name));
      let screen: Screen;
      if (existing) {
        const patch: Partial<Screen> = filled({
          name, purpose: item.purpose, description: item.description, businessProcess: item.businessProcess, businessOwner: item.businessOwner,
          functionalOwner: item.functionalOwner, navigationPath: item.navigationPath, approvalLogic: item.approvalLogic,
        });
        if (mod) patch.moduleId = mod.id;
        patch.fieldDescriptions = unionByKey(existing.fieldDescriptions ?? [], item.fieldDescriptions ?? [], (x) => x.field);
        patch.uiElements = unionByKey(existing.uiElements ?? [], item.uiElements ?? [], (x) => x.name);
        patch.validationRules = unionStrings(existing.validationRules ?? [], item.validationRules ?? []);
        patch.workflowSteps = unionStrings(existing.workflowSteps ?? [], item.workflowSteps ?? []);
        patch.exceptionHandling = unionStrings(existing.exceptionHandling ?? [], item.exceptionHandling ?? []);
        patch.upstreamSystems = unionStrings(existing.upstreamSystems ?? [], item.upstreamSystems ?? []);
        patch.downstreamSystems = unionStrings(existing.downstreamSystems ?? [], item.downstreamSystems ?? []);
        await db.screens.update(existing.id, { ...patch, updatedAt: now });
        screen = { ...existing, ...patch, updatedAt: now };
        screenByName.delete(key(existing.name));
        screenByName.set(key(name), screen);
        counts.updatedScreens++;
      } else {
        screen = {
          id: newId(), createdAt: now, updatedAt: now, applicationId: app.id, moduleId: mod?.id, name,
          purpose: item.purpose ?? '', description: item.description ?? '', businessProcess: item.businessProcess ?? '',
          businessOwner: item.businessOwner ?? '', functionalOwner: item.functionalOwner ?? '', navigationPath: item.navigationPath ?? '',
          fieldDescriptions: item.fieldDescriptions ?? [], uiElements: item.uiElements ?? [], validationRules: item.validationRules ?? [],
          workflowSteps: item.workflowSteps ?? [], approvalLogic: item.approvalLogic ?? '', exceptionHandling: item.exceptionHandling ?? [],
          upstreamSystems: item.upstreamSystems ?? [], downstreamSystems: item.downstreamSystems ?? [], relatedScreenIds: [],
        };
        await db.screens.add(screen);
        screenByName.set(key(name), screen);
        counts.createdScreens++;
      }
      for (const file of imageFiles.filter((f) => (item.sourceFiles ?? []).includes(f.name))) {
        const dataUrl = imageData.get(file.name);
        if (!dataUrl) continue;
        const existingMedia = await db.screenMedia.where('screenId').equals(screen.id).filter((m) => m.name === file.name).first();
        if (!existingMedia) {
          await db.screenMedia.add({
            id: newId(), createdAt: now, updatedAt: now, screenId: screen.id, applicationId: app.id, kind: 'screenshot', name: file.name,
            caption: 'Attached source screenshot analysed by Gemini.', mimeType: file.type || 'image/*', sizeBytes: file.size, dataUrl,
          });
        }
      }
    }

    // ---- functionalities
    const allScreenByName = new Map((await db.screens.where('applicationId').equals(app.id).toArray()).map((s) => [key(s.name), s]));
    const functionalities = await db.functionalities.where('applicationId').equals(app.id).toArray();
    const fnByName = new Map(functionalities.map((f) => [key(f.name), f]));
    for (const item of extraction.functionalities ?? []) {
      const name = safeTrim(item.name);
      if (!name) continue;
      const screen = allScreenByName.get(key(item.screenName));
      const mod = moduleByName.get(key(item.moduleName));
      const existing = fnByName.get(key(item.matchName || name));
      if (existing) {
        const patch: Partial<Functionality> = filled({ name, description: item.description, businessPurpose: item.businessPurpose, processFlow: item.processFlow });
        if (screen) patch.screenId = screen.id;
        const moduleId = mod?.id ?? screen?.moduleId;
        if (moduleId) patch.moduleId = moduleId;
        patch.userRoles = unionStrings(existing.userRoles ?? [], item.userRoles ?? []);
        patch.triggers = unionStrings(existing.triggers ?? [], item.triggers ?? []);
        patch.inputs = unionStrings(existing.inputs ?? [], item.inputs ?? []);
        patch.outputs = unionStrings(existing.outputs ?? [], item.outputs ?? []);
        const ex = existing.exceptions ?? { validation: [], error: [], business: [], system: [] };
        patch.exceptions = {
          validation: unionStrings(ex.validation, item.exceptions?.validation ?? []), error: unionStrings(ex.error, item.exceptions?.error ?? []),
          business: unionStrings(ex.business, item.exceptions?.business ?? []), system: unionStrings(ex.system, item.exceptions?.system ?? []),
        };
        patch.upstreamSystems = unionStrings(existing.upstreamSystems ?? [], item.upstreamSystems ?? []);
        patch.downstreamSystems = unionStrings(existing.downstreamSystems ?? [], item.downstreamSystems ?? []);
        await db.functionalities.update(existing.id, { ...patch, updatedAt: now });
        fnByName.delete(key(existing.name));
        fnByName.set(key(name), { ...existing, ...patch, updatedAt: now });
        counts.updatedFunctionalities++;
      } else {
        const created: Functionality = {
          id: newId(), createdAt: now, updatedAt: now, applicationId: app.id, moduleId: mod?.id ?? screen?.moduleId, screenId: screen?.id, name,
          description: item.description ?? '', businessPurpose: item.businessPurpose ?? '', processFlow: item.processFlow ?? '',
          userRoles: item.userRoles ?? [], triggers: item.triggers ?? [], inputs: item.inputs ?? [], outputs: item.outputs ?? [],
          exceptions: item.exceptions ?? { validation: [], error: [], business: [], system: [] }, relatedFunctionalityIds: [],
          upstreamSystems: item.upstreamSystems ?? [], downstreamSystems: item.downstreamSystems ?? [],
        };
        await db.functionalities.add(created);
        fnByName.set(key(name), created);
        counts.createdFunctionalities++;
      }
    }

    // ---- technical components
    const components = await db.technicalComponents.where('applicationId').equals(app.id).toArray();
    const componentByName = new Map(components.map((c) => [key(c.name), c]));
    // Create first so "depends on" links between components of the same plan resolve in either order.
    const plannedComponents: Array<{ item: ApplicationExtraction['technicalComponents'][number]; id: string }> = [];
    for (const item of extraction.technicalComponents ?? []) {
      const name = safeTrim(item.name);
      if (!name) continue;
      const existing = componentByName.get(key(item.matchName || name));
      if (existing) {
        plannedComponents.push({ item, id: existing.id });
        counts.updatedComponents++;
      } else {
        const created: TechnicalComponent = {
          id: newId(), createdAt: now, updatedAt: now, applicationId: app.id, kind: item.kind, name, description: item.description ?? '',
          definition: item.definition ?? '', functionalityIds: [], screenIds: [], relatedComponentIds: [], metadata: item.metadata ?? {}, columns: item.columns ?? [],
        };
        await db.technicalComponents.add(created);
        componentByName.set(key(name), created);
        plannedComponents.push({ item, id: created.id });
        counts.createdComponents++;
      }
    }
    const idsFor = (names: string[] | undefined, map: Map<string, { id: string }>) => (names ?? []).map((n) => map.get(key(n))?.id).filter((x): x is string => !!x);
    const currentScreenByName = new Map((await db.screens.where('applicationId').equals(app.id).toArray()).map((s) => [key(s.name), s]));
    for (const { item, id } of plannedComponents) {
      const existing = (await db.technicalComponents.get(id)) as TechnicalComponent;
      const patch: Partial<TechnicalComponent> = filled({ name: item.name, kind: item.kind, description: item.description, definition: item.definition });
      patch.functionalityIds = unionStrings(existing.functionalityIds ?? [], idsFor(item.functionalityNames, fnByName));
      patch.screenIds = unionStrings(existing.screenIds ?? [], idsFor(item.screenNames, currentScreenByName));
      patch.relatedComponentIds = unionStrings(existing.relatedComponentIds ?? [], idsFor(item.dependsOnNames, componentByName).filter((x) => x !== id));
      patch.metadata = { ...(existing.metadata ?? {}), ...(item.metadata ?? {}) };
      patch.columns = unionByKey(existing.columns ?? [], item.columns ?? [], (x) => x.name);
      await db.technicalComponents.update(id, { ...patch, updatedAt: now });
    }

    // ---- cross links between screens and between functionalities
    const currentFns = await db.functionalities.where('applicationId').equals(app.id).toArray();
    const currentFnByName = new Map(currentFns.map((f) => [key(f.name), f]));
    for (const item of extraction.screens ?? []) {
      const screen = currentScreenByName.get(key(item.name));
      if (!screen) continue;
      const related = idsFor(item.relatedScreenNames, currentScreenByName).filter((x) => x !== screen.id);
      if (related.length) await db.screens.update(screen.id, { relatedScreenIds: unionStrings(screen.relatedScreenIds ?? [], related), updatedAt: now });
    }
    for (const item of extraction.functionalities ?? []) {
      const fn = currentFnByName.get(key(item.name));
      if (!fn) continue;
      const related = idsFor(item.relatedFunctionalityNames, currentFnByName).filter((x) => x !== fn.id);
      if (related.length) await db.functionalities.update(fn.id, { relatedFunctionalityIds: unionStrings(fn.relatedFunctionalityIds ?? [], related), updatedAt: now });
    }
  });

  return {
    modules: counts.createdModules + counts.updatedModules,
    screens: counts.createdScreens + counts.updatedScreens,
    functionalities: counts.createdFunctionalities + counts.updatedFunctionalities,
    components: counts.createdComponents + counts.updatedComponents,
    updatedModules: counts.updatedModules,
    updatedScreens: counts.updatedScreens,
    updatedFunctionalities: counts.updatedFunctionalities,
    updatedComponents: counts.updatedComponents,
  };
}
