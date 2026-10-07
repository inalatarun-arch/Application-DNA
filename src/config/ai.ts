export interface GeminiModelOption {
  id: string;
  label: string;
  hint: string;
}

/** Google-maintained alias that follows the current Flash release. */
export const DEFAULT_MODEL = 'gemini-flash-latest';

export type AiFeature = 'transcript' | 'impact' | 'frd' | 'tdd' | 'testcases' | 'defects' | 'copilot' | 'application-ingestion' | 'screen-extraction' | 'requirement-import' | 'project-flow' | 'knowledge-flow';

export const AI_FEATURES: Array<{ id: AiFeature; label: string; description: string }> = [
  { id: 'transcript', label: 'Transcript processing', description: 'Meeting notes and requirement extraction' },
  { id: 'impact', label: 'Impact assessment', description: 'Functional, technical and gap analysis' },
  { id: 'frd', label: 'FRD generation', description: 'Functional Requirements Documents' },
  { id: 'tdd', label: 'TDD generation', description: 'Technical Design Documents' },
  { id: 'testcases', label: 'Test case generation', description: 'Unit, SIT, regression and UAT cases' },
  { id: 'defects', label: 'Defect analysis', description: 'Root cause and similar-defect suggestions' },
  { id: 'copilot', label: 'Copilot', description: 'Natural-language search across the repository' },
  { id: 'application-ingestion', label: 'Application ingestion', description: 'Build and update application knowledge from text and files' },
  { id: 'screen-extraction', label: 'Screen extraction', description: 'Extract screen controls and business clues from screenshots' },
  { id: 'requirement-import', label: 'Requirement import', description: 'Extract project requirements from uploaded files' },
  { id: 'project-flow', label: 'Project process flow', description: 'Generate future-state flows from requirements' },
  { id: 'knowledge-flow', label: 'Knowledge graph flow', description: 'Generate Mermaid flows from application evidence' },
];

export interface AiSettings {
  /** Model used when a feature has no override. */
  defaultModel: string;
  /** Per-feature model overrides. */
  featureModels: Partial<Record<AiFeature, string>>;
  /** Models tried after the primary when Google returns 404 or 503. */
  fallbackModels: string[];
  temperature: number;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  defaultModel: DEFAULT_MODEL,
  featureModels: { impact: DEFAULT_MODEL, frd: DEFAULT_MODEL, tdd: DEFAULT_MODEL },
  fallbackModels: [],
  temperature: 0.3,
};
