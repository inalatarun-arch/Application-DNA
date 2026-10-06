import Dexie, { type Table } from 'dexie';
import type {
  AppModule,
  Application,
  Artifact,
  Defect,
  Functionality,
  Meeting,
  Project,
  Requirement,
  RequirementCandidate,
  Screen,
  ScreenMedia,
  SettingRecord,
  TechnicalComponent,
  TestCase,
} from './types';

/** Bump together with a new `this.version(n)` block when the schema changes. */
export const DB_SCHEMA_VERSION = 4;

export class EihDatabase extends Dexie {
  applications!: Table<Application, string>;
  modules!: Table<AppModule, string>;
  screens!: Table<Screen, string>;
  screenMedia!: Table<ScreenMedia, string>;
  functionalities!: Table<Functionality, string>;
  technicalComponents!: Table<TechnicalComponent, string>;
  projects!: Table<Project, string>;
  requirements!: Table<Requirement, string>;
  artifacts!: Table<Artifact, string>;
  testCases!: Table<TestCase, string>;
  defects!: Table<Defect, string>;
  settings!: Table<SettingRecord, string>;
  meetings!: Table<Meeting, string>;
  candidates!: Table<RequirementCandidate, string>;

  constructor() {
    super('eih');
    // Only indexed fields are listed. `*field` = multi-entry index on an array.
    this.version(1).stores({
      applications: 'id, name, vendor, updatedAt',
      modules: 'id, applicationId, name',
      screens: 'id, applicationId, moduleId, name',
      functionalities: 'id, applicationId, moduleId, screenId, name',
      technicalComponents: 'id, applicationId, kind, name, *functionalityIds',
      projects: 'id, name, status, updatedAt, *applicationIds',
      requirements: 'id, projectId, kind, status, parentId, *functionalityIds',
      artifacts: 'id, projectId, kind, status, updatedAt',
      testCases: 'id, projectId, level, status, *requirementIds',
      defects: 'id, projectId, severity, status, testCaseId, requirementId',
      settings: 'key',
    });
    // v2: screenshots/wireframes live in their own table so editing a screen never rewrites image data.
    this.version(2).stores({
      screenMedia: 'id, screenId, applicationId',
    });
    // v3: technical components can be linked to screens (multi-entry index for reverse lookups).
    this.version(3).stores({
      technicalComponents: 'id, applicationId, kind, name, *functionalityIds, *screenIds',
    });
    // v4: project discovery. Meeting transcripts with their AI notes, and requirement suggestions awaiting review.
    this.version(4).stores({
      meetings: 'id, projectId, meetingDate, status',
      candidates: 'id, projectId, meetingId, decision',
    });
  }
}

export const db = new EihDatabase();

export const newId = (): string => crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();

/** Request persistent storage so the browser doesn't evict IndexedDB under pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* non-fatal */
  }
  return false;
}
