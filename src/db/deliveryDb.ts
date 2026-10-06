/**
 * Separate IndexedDB database for Steps 6 & 7. It never touches your existing
 * Knowledge Repository database (so no schema migration can break Steps 1-5).
 */
import Dexie, { liveQuery } from 'dexie';
import type { Table } from 'dexie';
import { useEffect, useState } from 'react';

/* ------------------------------- domain types ------------------------------ */

export interface Project {
  id?: number;
  name: string;
  description: string;
  applications: string; // comma separated, e.g. "Oracle EBS, Salesforce"
  scope: string;
  currentProcess: string;
  futureProcess: string;
  notes: string; // assumptions / constraints / anything else for generators
  createdAt: string;
  updatedAt: string;
}

export type RequirementType = 'Functional' | 'Non-Functional' | 'Reporting' | 'Integration' | 'Change Request';
export type RequirementStatus = 'Draft' | 'Approved' | 'Rejected';

export interface Requirement {
  id?: number;
  projectId: number;
  title: string;
  text: string;
  type: RequirementType;
  status: RequirementStatus;
  storiesGeneratedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type Severity = 'Low' | 'Medium' | 'High';
export type ChangeType = 'New' | 'Modify' | 'Remove' | 'Review';

export interface ImpactReport {
  summary: string;
  overallRisk: 'Low' | 'Medium' | 'High' | 'Critical';
  confidence: 'Low' | 'Medium' | 'High';
  knowledgeCoverage: string;
  functionalImpact: {
    screens: { name: string; application: string; impact: string; changeType: ChangeType; sourceRefs: string[] }[];
    processes: { name: string; impact: string; sourceRefs: string[] }[];
  };
  technicalImpact: {
    components: { type: string; name: string; impact: string; changeType: ChangeType; sourceRefs: string[] }[];
  };
  integrationRisks: {
    direction: 'Upstream' | 'Downstream';
    system: string;
    risk: string;
    severity: Severity;
    mitigation: string;
    sourceRefs: string[];
  }[];
  gapAnalysis: {
    missingApprovalSteps: string[];
    regressionRisks: string[];
    missingRequirements: string[];
    missingTestCoverage: string[];
    unaddressedDependencies: string[];
  };
  overlappingProjects: string[];
  recommendedActions: string[];
}

export interface ContextRef {
  id: string; // K1, K2...
  source: string; // table name
  label: string;
}

export interface ImpactRecord {
  id?: number;
  projectId: number;
  requirementId: number;
  model: string;
  report: ImpactReport;
  contextRefs: ContextRef[];
  createdAt: string;
}

export type MoSCoW = 'Must' | 'Should' | 'Could' | "Won't";
export type StoryStatus = 'Backlog' | 'Ready' | 'In Progress' | 'Done' | 'Blocked';
export type Complexity = 'XS' | 'S' | 'M' | 'L' | 'XL';

export interface Epic {
  id?: number;
  projectId: number;
  title: string;
  description: string;
  createdAt: string;
}
export interface Feature {
  id?: number;
  projectId: number;
  epicId: number;
  title: string;
  description: string;
  createdAt: string;
}
export interface Story {
  id?: number;
  projectId: number;
  featureId: number;
  requirementIds: number[];
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: string[];
  businessRules: string[];
  priority: MoSCoW;
  status: StoryStatus;
  complexity: Complexity;
  storyPoints: number;
  createdAt: string;
  updatedAt: string;
}

export type DocType = 'FRD' | 'TDD';
export interface DocumentRecord {
  id?: number;
  projectId: number;
  type: DocType;
  title: string;
  version: number;
  content: string; // markdown
  /** 0 = Draft, 1..N = awaiting review stage N, N+1 = Approved (N = number of matrix stages) */
  stageIndex: number;
  /** Set when the last decision was "Rejected" (cleared on resubmit). */
  rejected?: boolean;
  generatedAt?: string;
  createdAt: string;
  updatedAt: string;
}
export interface DocVersion {
  id?: number;
  documentId: number;
  version: number;
  content: string;
  note: string;
  savedAt: string;
}

export type ApprovalDecision = 'Submitted' | 'Approved' | 'Rejected' | 'Changes Requested' | 'Reopened';
export interface ApprovalEntry {
  id?: number;
  documentId: number;
  version: number;
  stageLabel: string;
  reviewerName: string;
  role: string;
  decision: ApprovalDecision;
  comments: string;
  timestamp: string;
}

/* --------------------------------- database -------------------------------- */

class DeliveryDb extends Dexie {
  projects!: Table<Project, number>;
  requirements!: Table<Requirement, number>;
  impactReports!: Table<ImpactRecord, number>;
  epics!: Table<Epic, number>;
  features!: Table<Feature, number>;
  stories!: Table<Story, number>;
  documents!: Table<DocumentRecord, number>;
  docVersions!: Table<DocVersion, number>;
  approvals!: Table<ApprovalEntry, number>;

  constructor() {
    super('eih-delivery');
    this.version(1).stores({
      projects: '++id, name',
      requirements: '++id, projectId, status, type',
      impactReports: '++id, projectId, requirementId, createdAt',
      epics: '++id, projectId',
      features: '++id, projectId, epicId',
      stories: '++id, projectId, featureId, priority, status',
      documents: '++id, projectId, type',
      docVersions: '++id, documentId',
      approvals: '++id, documentId, timestamp',
    });
  }
}

export const db = new DeliveryDb();
export const nowIso = (): string => new Date().toISOString();

/* ------------------------------ live query hook ----------------------------- */

/** Minimal replacement for dexie-react-hooks' useLiveQuery (no extra dependency). */
export function useLive<T>(querier: () => Promise<T> | T, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(querier).subscribe({
      next: (v) => setValue(v),
      error: (e) => console.error('liveQuery error', e),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/* ------------------------------ approval matrix ----------------------------- */

export interface ApprovalStage {
  key: string;
  label: string; // shown in stepper
  role: string;
  email: string;
}

const LS_MATRIX = 'eih.approvalMatrix.v1';

export const DEFAULT_MATRIX: ApprovalStage[] = [
  { key: 'ba', label: 'BA Sign-off', role: 'Business Analyst', email: '' },
  { key: 'bo', label: 'Business Owner Review', role: 'Business Owner', email: '' },
  { key: 'ta', label: 'Technical Architect Review', role: 'Technical Architect', email: '' },
];

export function loadMatrix(): ApprovalStage[] {
  try {
    const raw = localStorage.getItem(LS_MATRIX);
    if (!raw) return DEFAULT_MATRIX;
    const parsed = JSON.parse(raw) as ApprovalStage[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_MATRIX;
  } catch {
    return DEFAULT_MATRIX;
  }
}
export function saveMatrix(m: ApprovalStage[]): void {
  localStorage.setItem(LS_MATRIX, JSON.stringify(m));
}
