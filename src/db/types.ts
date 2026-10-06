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

export interface Application extends BaseEntity {
  name: string;
  /** e.g. Salesforce, Oracle E-Business Suite, SAP, ServiceNow, Workday, Custom */
  vendor: string;
  description: string;
  businessOwner?: string;
  technicalOwner?: string;
  tags: string[];
}

export interface AppModule extends BaseEntity {
  applicationId: ID;
  name: string;
  description: string;
}

export interface Screen extends BaseEntity {
  applicationId: ID;
  moduleId?: ID;
  name: string;
  purpose: string;
  description: string;
  businessProcess?: string;
  businessOwner?: string;
  functionalOwner?: string;
  navigationPath?: string;
  fieldDescriptions: Array<{ field: string; description: string }>;
  validationRules: string[];
  workflowSteps: string[];
  approvalLogic?: string;
  exceptionHandling?: string;
  upstreamSystems: string[];
  downstreamSystems: string[];
  relatedScreenIds: ID[];
  media: MediaRef[];
}

export interface Functionality extends BaseEntity {
  applicationId: ID;
  moduleId?: ID;
  screenId?: ID;
  name: string;
  description: string;
  businessPurpose?: string;
  processFlow?: string; // Mermaid source
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
  externalSystems: string[];
}

export type TechnicalComponentKind =
  | 'class' | 'package' | 'method' | 'service' | 'api'
  | 'table' | 'view' | 'procedure' | 'trigger'
  | 'rest' | 'soap' | 'middleware' | 'queue'
  | 'server' | 'cloud' | 'job';

export interface TechnicalComponent extends BaseEntity {
  applicationId: ID;
  kind: TechnicalComponentKind;
  name: string;
  description: string;
  /** Source, SQL, endpoint spec, etc. */
  definition?: string;
  functionalityIds: ID[];
  /** Edges to other components (e.g. table relationships). */
  relatedComponentIds: ID[];
  metadata: Record<string, string>;
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
