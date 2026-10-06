import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { GraphSource } from '@/lib/graphModel';

/** Live snapshot of the whole documented workspace. */
export function useGraphSource(): GraphSource | undefined {
  return useLiveQuery(async () => {
    const [applications, modules, screens, functionalities, components, requirements] = await Promise.all([
      db.applications.toArray(),
      db.modules.toArray(),
      db.screens.toArray(),
      db.functionalities.toArray(),
      db.technicalComponents.toArray(),
      db.requirements.toArray(),
    ]);
    return { applications, modules, screens, functionalities, components, requirements };
  }, []);
}
