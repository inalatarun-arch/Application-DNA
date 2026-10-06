export interface GeminiModelOption {
  id: string;
  label: string;
  hint: string;
}

export const GEMINI_MODELS: GeminiModelOption[] = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', hint: 'Fast and economical. Best for real-time tasks.' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', hint: 'Deeper reasoning. Best for FRD, TDD and impact analysis.' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', hint: 'Lowest cost and latency. Best for simple, high-volume calls.' },
];

export const DEFAULT_MODEL = 'gemini-2.5-flash';

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
  featureModels: { impact: 'gemini-2.5-pro', frd: 'gemini-2.5-pro', tdd: 'gemini-2.5-pro' },
  temperature: 0.3,
};
