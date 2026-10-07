import { db, newId, nowIso } from '@/db/db';
import type { Application, Functionality, Screen, TechnicalComponent } from '@/db/types';
import type { ApplicationExtraction } from './applicationAI';
import { safeTrim } from '@/lib/safeValue';

const key = (v: unknown) => safeTrim(v).toLowerCase();

export async function applyApplicationExtraction(
  app: Application,
  extraction: ApplicationExtraction,
  imageFiles: File[] = [],
): Promise<{ modules: number; screens: number; functionalities: number; components: number; updatedModules: number; updatedScreens: number }> {
  const now = nowIso();
  let createdModules = 0;
  let updatedModules = 0;
  let createdScreens = 0;
  let updatedScreens = 0;
  let createdFunctionalities = 0;
  let createdComponents = 0;

  await db.transaction('rw', [db.applications, db.modules, db.screens, db.screenMedia, db.functionalities, db.technicalComponents], async () => {
    const appPatch: Partial<Application> = {};
    for (const field of ['name','vendor','domain','description','businessOwner','technicalOwner'] as const) {
      const value = extraction.application[field];
      if (typeof value === 'string' && value.trim()) appPatch[field] = value.trim();
    }
    if (Array.isArray(extraction.application.technicalStack) && extraction.application.technicalStack.length) appPatch.technicalStack = extraction.application.technicalStack;
    if (Array.isArray(extraction.application.tags) && extraction.application.tags.length) appPatch.tags = extraction.application.tags;
    if (extraction.application.criticalTier) appPatch.criticalTier = extraction.application.criticalTier;
    if (Object.keys(appPatch).length) await db.applications.update(app.id, { ...appPatch, updatedAt: now });

    const modules = await db.modules.where('applicationId').equals(app.id).toArray();
    const moduleByName = new Map(modules.map((m) => [key(m.name), m]));
    for (const item of extraction.modules ?? []) {
      if (!safeTrim(item.name)) continue;
      const existing = moduleByName.get(key(safeTrim(item.matchName) || safeTrim(item.name)));
      if (existing && item.operation === 'update') {
        await db.modules.update(existing.id, { name: safeTrim(item.name), description: safeTrim(item.description) ?? existing.description, owner: safeTrim(item.owner) ?? existing.owner, updatedAt: now });
        moduleByName.set(key(item.name), { ...existing, name: item.name.trim() });
        updatedModules++;
      } else {
        const created = { id: newId(), createdAt: now, updatedAt: now, applicationId: app.id, name: item.name.trim(), description: item.description?.trim() ?? '', owner: item.owner?.trim() ?? '' };
        await db.modules.add(created);
        moduleByName.set(key(created.name), created);
        createdModules++;
      }
    }

    const screens = await db.screens.where('applicationId').equals(app.id).toArray();
    const screenByName = new Map(screens.map((s) => [key(s.name), s]));
    for (const item of extraction.screens ?? []) {
      if (!item.name?.trim()) continue;
      const mod = moduleByName.get(key(item.moduleName));
      const existing = screenByName.get(key(item.matchName || item.name));
      const patch: Partial<Screen> = {
        name: item.name.trim(), moduleId: mod?.id, purpose: item.purpose ?? '', description: item.description ?? '',
        businessProcess: item.businessProcess ?? '', businessOwner: item.businessOwner ?? '', functionalOwner: item.functionalOwner ?? '',
        navigationPath: item.navigationPath ?? '', fieldDescriptions: item.fieldDescriptions ?? [], uiElements: item.uiElements ?? [],
        validationRules: item.validationRules ?? [], workflowSteps: item.workflowSteps ?? [], approvalLogic: item.approvalLogic ?? '',
        exceptionHandling: item.exceptionHandling ?? [], upstreamSystems: item.upstreamSystems ?? [], downstreamSystems: item.downstreamSystems ?? [],
      };
      let screen: Screen;
      if (existing && item.operation === 'update') {
        await db.screens.update(existing.id, { ...patch, updatedAt: now });
        screen = { ...existing, ...patch, updatedAt: now };
        updatedScreens++;
      } else {
        screen = { id: newId(), createdAt: now, updatedAt: now, applicationId: app.id, moduleId: mod?.id, name: item.name.trim(), purpose: item.purpose ?? '', description: item.description ?? '', businessProcess: item.businessProcess ?? '', businessOwner: item.businessOwner ?? '', functionalOwner: item.functionalOwner ?? '', navigationPath: item.navigationPath ?? '', fieldDescriptions: item.fieldDescriptions ?? [], uiElements: item.uiElements ?? [], validationRules: item.validationRules ?? [], workflowSteps: item.workflowSteps ?? [], approvalLogic: item.approvalLogic ?? '', exceptionHandling: item.exceptionHandling ?? [], upstreamSystems: item.upstreamSystems ?? [], downstreamSystems: item.downstreamSystems ?? [], relatedScreenIds: [] };
        await db.screens.add(screen);
        screenByName.set(key(screen.name), screen);
        createdScreens++;
      }
      if (item.sourceFiles?.length) {
        for (const file of imageFiles.filter((f) => item.sourceFiles.includes(f.name))) {
          const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error(`Could not read ${file.name}.`)); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); });
          const existingMedia = await db.screenMedia.where('screenId').equals(screen.id).filter((m) => m.name === file.name).first();
          if (!existingMedia) await db.screenMedia.add({ id: newId(), createdAt: now, updatedAt: now, screenId: screen.id, applicationId: app.id, kind: 'screenshot', name: file.name, caption: 'Attached source screenshot analysed by Gemini.', mimeType: file.type || 'image/*', sizeBytes: file.size, dataUrl });
        }
      }
    }

    const allScreens = await db.screens.where('applicationId').equals(app.id).toArray();
    const allScreenByName = new Map(allScreens.map((s) => [key(s.name), s]));
    const functionalities = await db.functionalities.where('applicationId').equals(app.id).toArray();
    const fnByName = new Map(functionalities.map((f) => [key(f.name), f]));
    for (const item of extraction.functionalities ?? []) {
      if (!item.name?.trim()) continue;
      const screen = allScreenByName.get(key(item.screenName));
      const mod = moduleByName.get(key(item.moduleName));
      const existing = fnByName.get(key(item.matchName || item.name));
      const patch: Partial<Functionality> = {
        name:item.name.trim(), description:item.description ?? '', businessPurpose:item.businessPurpose ?? '', processFlow:item.processFlow ?? '',
        moduleId:mod?.id ?? screen?.moduleId, screenId:screen?.id, userRoles:item.userRoles ?? [], triggers:item.triggers ?? [], inputs:item.inputs ?? [], outputs:item.outputs ?? [],
        exceptions:item.exceptions ?? {validation:[],error:[],business:[],system:[]}, upstreamSystems:item.upstreamSystems ?? [], downstreamSystems:item.downstreamSystems ?? [],
      };
      if (existing && item.operation === 'update') {
        await db.functionalities.update(existing.id, { ...patch, updatedAt: now });
        fnByName.set(key(item.name), { ...existing, ...patch, updatedAt: now });
      } else {
        const created: Functionality = { id:newId(),createdAt:now,updatedAt:now,applicationId:app.id,moduleId:mod?.id ?? screen?.moduleId,screenId:screen?.id,name:item.name.trim(),description:item.description ?? '',businessPurpose:item.businessPurpose ?? '',processFlow:item.processFlow ?? '',userRoles:item.userRoles ?? [],triggers:item.triggers ?? [],inputs:item.inputs ?? [],outputs:item.outputs ?? [],exceptions:item.exceptions ?? {validation:[],error:[],business:[],system:[]},relatedFunctionalityIds:[],upstreamSystems:item.upstreamSystems ?? [],downstreamSystems:item.downstreamSystems ?? [] };
        await db.functionalities.add(created); fnByName.set(key(created.name),created); createdFunctionalities++;
      }
    }

    const components = await db.technicalComponents.where('applicationId').equals(app.id).toArray();
    const componentByName = new Map(components.map((c) => [key(c.name), c]));
    for (const item of extraction.technicalComponents ?? []) {
      if (!item.name?.trim()) continue;
      const existing = componentByName.get(key(item.matchName || item.name));
      const functionalityIds = (item.functionalityNames ?? []).map((n) => fnByName.get(key(n))?.id).filter((x): x is string => !!x);
      const screenIds = (item.screenNames ?? []).map((n) => allScreenByName.get(key(n))?.id).filter((x): x is string => !!x);
      const relatedComponentIds = (item.dependsOnNames ?? []).map((n) => componentByName.get(key(n))?.id).filter((x): x is string => !!x);
      if (existing && item.operation === 'update') {
        await db.technicalComponents.update(existing.id,{name:item.name.trim(),kind:item.kind,description:item.description ?? '',definition:item.definition ?? '',functionalityIds,screenIds,relatedComponentIds,metadata:item.metadata ?? {},columns:item.columns ?? [],updatedAt:now});
      } else {
        const created: TechnicalComponent = {id:newId(),createdAt:now,updatedAt:now,applicationId:app.id,kind:item.kind,name:item.name.trim(),description:item.description ?? '',definition:item.definition ?? '',functionalityIds,screenIds,relatedComponentIds,metadata:item.metadata ?? {},columns:item.columns ?? []};
        await db.technicalComponents.add(created); componentByName.set(key(created.name),created); createdComponents++;
      }
    }

    const currentScreens = await db.screens.where('applicationId').equals(app.id).toArray();
    const currentScreenByName = new Map(currentScreens.map((s) => [key(s.name), s]));
    for (const item of extraction.screens ?? []) {
      const screen = currentScreenByName.get(key(item.name));
      if (!screen) continue;
      const related = (item.relatedScreenNames ?? []).map((n) => currentScreenByName.get(key(n))?.id).filter((x): x is string => !!x);
      if (related.length) await db.screens.update(screen.id,{relatedScreenIds:related,updatedAt:now});
    }

    const currentFns = await db.functionalities.where('applicationId').equals(app.id).toArray();
    const currentFnByName = new Map(currentFns.map((f) => [key(f.name), f]));
    for (const item of extraction.functionalities ?? []) {
      const fn = currentFnByName.get(key(item.name));
      if (!fn) continue;
      const related = (item.relatedFunctionalityNames ?? []).map((n) => currentFnByName.get(key(n))?.id).filter((x): x is string => !!x);
      if (related.length) await db.functionalities.update(fn.id,{relatedFunctionalityIds:related,updatedAt:now});
    }
  });

  return { modules: createdModules + updatedModules, screens: createdScreens + updatedScreens, functionalities: createdFunctionalities, components: createdComponents, updatedModules, updatedScreens };
}
