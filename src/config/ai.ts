export interface GeminiModelOption {
  id: string;
  label: string;
  hint: string;
}

/** Google-maintained alias that follows the current Flash release. */
export const DEFAULT_MODEL = 'gemini-flash-latest';

export type AiFeature = 'transcript' | 'impact' | 'frd' | 'tdd' | 'testcases' | 'defects' | 'copilot';

export const AI_FEATURES: Array<{ id: AiFeature; label: string; description: string }> = [
  { id: 'transcript', label: 'Transcript processing', description: 'Meeting notes and requirement extraction' },
  { id: 'impact', label: 'Impact assessment', description: 'Functional, technical and gap analysis' },
  { id: 'frd', label: 'FRD generation', description: 'Functional Requirements Documents' },
  { id: 'tdd', label: 'TDD generation', description: 'Technical Design Documents' },
  { id: 'testcases', label: 'Test case generation', description: 'Unit, SIT, regression and UAT cases' },
  { id: 'defects', label: 'Defect analysis', description: 'Root cause and similar-defect suggestions' },
  { id: 'copilot', label: 'Copilot', description: 'Natural-language search across the repository' },
];

export interface AiSettings {
  /** Model used when a feature has no override. */
  defaultModel: string;
  /** Per-feature model overrides. */
  featureModels: Partial<Record<AiFeature, string>>;
  temperature: number;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  defaultModel: DEFAULT_MODEL,
  featureModels: { impact: DEFAULT_MODEL, frd: DEFAULT_MODEL, tdd: DEFAULT_MODEL },
  temperature: 0.3,
};
