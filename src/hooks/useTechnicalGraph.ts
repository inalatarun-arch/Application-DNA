import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { TechnicalGraph } from '@/lib/techUsage';

/** Live snapshot of everything needed to resolve technical ↔ functional links (all applications). */
export function useTechnicalGraph(): TechnicalGraph | undefined {
  return useLiveQuery(async () => {
    const [applications, components, screens, functionalities] = await Promise.all([
      db.applications.toArray(),
      db.technicalComponents.toArray(),
      db.screens.toArray(),
      db.functionalities.toArray(),
    ]);
    return { applications, components, screens, functionalities };
  }, []);
}
