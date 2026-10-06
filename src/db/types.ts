export type ID = string;

export interface BaseEntity {
  id: ID;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export interface MediaRef {
  kind: 'screenshot' | 'wireframe' | 'recording';
  name: string;
  /** Data URL for now; moves to a Blob store when file upload lands. */
  dataUrl: string;
}

// ---------- Domain 1: Application Knowledge Repository ----------

export type CriticalTier = 'tier-1' | 'tier-2' | 'tier-3' | 'tier-4';

export interface Application extends BaseEntity {
  name: string;
  /** Platform, e.g. Salesforce, Oracle E-Business Suite, SAP, ServiceNow, Workday, Custom */
  vendor: string;
  /** Business domain, e.g. Finance, Procurement, HR */
  domain: string;
  technicalStack: string[];
  criticalTier: CriticalTier;
  description: string;
  businessOwner: string;
  technicalOwner: string;
  tags: string[];
}

export interface AppModule extends BaseEntity {
  applicationId: ID;
  name: string;
  description: string;
  owner: string;
}

export interface Screen extends BaseEntity {
  applicationId: ID;
  moduleId?: ID;
  name: string;
  purpose: string;
  description: string;
  businessProcess: string;
  businessOwner: string;
  functionalOwner: string;
  navigationPath: string;
  fieldDescriptions: Array<{ field: string; description: string }>;
  validationRules: string[];
  workflowSteps: string[];
  approvalLogic: string;
  exceptionHandling: string[];
  upstreamSystems: string[];
  downstreamSystems: string[];
  relatedScreenIds: ID[];
}

/** Screenshots and wireframes. Stored as data URLs so JSON backups stay self-contained. */
export interface ScreenMedia extends BaseEntity {
  screenId: ID;
  applicationId: ID;
  kind: 'screenshot' | 'wireframe';
  name: string;
  caption: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
}

export interface Functionality extends BaseEntity {
  applicationId: ID;
  moduleId?: ID;
  screenId?: ID;
  name: string;
  description: string;
  businessPurpose: string;
  processFlow: string; // Mermaid source
  userRoles: string[];
  triggers: string[];
  inputs: string[];
  outputs: string[];
  exceptions: {
    validation: string[];
    error: string[];
    business: string[];
    system: string[];
  };
  relatedFunctionalityIds: ID[];
  upstreamSystems: string[];
  downstreamSystems: string[];
}

export type TechnicalComponentKind =
  | 'class' | 'package' | 'method' | 'service' | 'api'
  | 'table' | 'view' | 'procedure' | 'trigger'
  | 'rest' | 'soap' | 'middleware' | 'queue'
  | 'server' | 'cloud' | 'job';

export interface ColumnDef {
  name: string;
  dataType: string;
  nullable: boolean;
  /** Primary or foreign key marker. */
  key: '' | 'PK' | 'FK';
  /** For FK columns: the referenced "TABLE.COLUMN". */
  references: string;
  description: string;
}

export interface TechnicalComponent extends BaseEntity {
  applicationId: ID;
  kind: TechnicalComponentKind;
  name: string;
  description: string;
  /** Source code, DDL, SQL, sample payload or notes, depending on kind. */
  definition: string;
  /** Functionalities powered by this component (any application). */
  functionalityIds: ID[];
  /** Screens that rely on this component directly (any application). */
  screenIds: ID[];
  /** Components this one depends on (e.g. an API depends on a procedure, a table on its FK parents). */
  relatedComponentIds: ID[];
  /** Kind-specific attributes; the keys per kind are defined in config/technical.ts. */
  metadata: Record<string, string>;
  /** Columns for tables and views. */
  columns: ColumnDef[];
}

// ---------- Domain 2: Project & Delivery Management ----------

export type ProjectStatus = 'draft' | 'active' | 'on-hold' | 'completed' | 'cancelled';

export interface ProjectNote {
  id: ID;
  kind: 'meeting-note' | 'decision' | 'assumption' | 'risk' | 'dependency' | 'change-request';
  text: string;
  createdAt: string;
}

export interface Project extends BaseEntity {
  name: string;
  description: string;
  status: ProjectStatus;
  applicationIds: ID[];
  functionalityIds: ID[];
  sponsor?: string;
  notes: ProjectNote[];
}

export type RequirementKind =
  | 'functional' | 'non-functional' | 'reporting' | 'integration'
  | 'epic' | 'feature' | 'user-story' | 'business-rule';

export type ApprovalStatus = 'draft' | 'in-review' | 'approved' | 'rejected';

export interface Requirement extends BaseEntity {
  projectId: ID;
  kind: RequirementKind;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: ApprovalStatus;
  parentId?: ID;
  functionalityIds: ID[];
  source?: string; // e.g. transcript artifact id
  priority?: 'low' | 'medium' | 'high';
}

export type ArtifactKind =
  | 'transcript' | 'meeting-notes' | 'impact-assessment'
  | 'frd' | 'tdd' | 'diagram' | 'rtm' | 'other';

export interface ApprovalRecord {
  role: 'business-analyst' | 'business-owner' | 'application-owner' | 'technical-architect' | 'project-sponsor';
  approver?: string;
  decision: 'pending' | 'approved' | 'rejected';
  comment?: string;
  decidedAt?: string;
}

export interface Artifact extends BaseEntity {
  projectId?: ID;
  kind: ArtifactKind;
  title: string;
  /** Markdown (diagrams as Mermaid code blocks). */
  content: string;
  version: number;
  status: ApprovalStatus;
  approvals: ApprovalRecord[];
  generatedBy?: { model: string; at: string };
}

export type TestLevel = 'unit' | 'sit' | 'regression' | 'uat';
export type TestStatus = 'not-run' | 'passed' | 'failed' | 'blocked';

export interface TestCase extends BaseEntity {
  projectId: ID;
  requirementIds: ID[];
  level: TestLevel;
  scenario: string;
  steps: string[];
  expectedResult: string;
  actualResult?: string;
  status: TestStatus;
  priority: 'low' | 'medium' | 'high';
}

export interface Defect extends BaseEntity {
  projectId: ID;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  assignedTo?: string;
  requirementId?: ID;
  testCaseId?: ID;
  screenshots: MediaRef[];
  aiAnalysis?: string;
}

export interface SettingRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}
