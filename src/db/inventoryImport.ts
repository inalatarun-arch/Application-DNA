import { db, newId, nowIso } from './db';
import type { AppModule, Application } from './types';
import { DEFAULT_DOMAIN, DEFAULT_TIER, fillBlanks, normKey, type StagedApp } from '@/lib/appInventory';

export interface InventoryImportResult {
  created: number;
  updated: number;
  modulesAdded: number;
  skipped: number;
}

/**
 * Saves the reviewed rows in one transaction. Whether a row creates or updates is decided here from what is stored
 * right now (not from what the review screen saw), so a stale review can never create a duplicate application.
 * Updates only fill blanks and add missing modules; nothing a person typed is overwritten.
 * Pass `modules: false` when a detailed extraction follows, which brings its own (ID-named) modules.
 */
export async function applyInventory(rows: StagedApp[], opts: { modules?: boolean } = {}): Promise<InventoryImportResult> {
  const withModules = opts.modules !== false;
  const result: InventoryImportResult = { created: 0, updated: 0, modulesAdded: 0, skipped: 0 };
  await db.transaction('rw', db.applications, db.modules, async () => {
    const apps = await db.applications.toArray();
    const byKey = new Map(apps.map((a) => [normKey(a.name), a]));
    const now = nowIso();
    for (const row of rows) {
      if (!row.selected || !row.app.name.trim()) { result.skipped++; continue; }
      const a = row.app;
      const key = normKey(a.name);
      let target = byKey.get(key);
      if (target) {
        const patch = fillBlanks(target, a);
        if (Object.keys(patch).length) {
          await db.applications.update(target.id, { ...patch, updatedAt: now });
          target = { ...target, ...patch };
          byKey.set(key, target);
        }
        result.updated++;
      } else {
        const created: Application = {
          id: newId(), createdAt: now, updatedAt: now, name: a.name.trim(), vendor: a.vendor, domain: a.domain || DEFAULT_DOMAIN,
          technicalStack: a.technicalStack, criticalTier: a.criticalTier || DEFAULT_TIER, description: a.description,
          businessOwner: a.businessOwner, technicalOwner: a.technicalOwner, tags: a.tags,
        };
        await db.applications.add(created);
        byKey.set(key, created);
        target = created;
        result.created++;
      }
      if (withModules && a.modules.length) {
        const have = new Set((await db.modules.where('applicationId').equals(target.id).toArray()).map((m) => normKey(m.name)));
        for (const m of a.modules) {
          if (have.has(normKey(m.name))) continue;
          const mod: AppModule = { id: newId(), createdAt: now, updatedAt: now, applicationId: target.id, name: m.name, description: m.description, owner: '' };
          await db.modules.add(mod);
          have.add(normKey(m.name));
          result.modulesAdded++;
        }
      }
    }
  });
  return result;
}
