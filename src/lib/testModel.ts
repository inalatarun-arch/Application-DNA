const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface GeneratedCase {
  scenario: string;
  steps: string[];
  expectedResult: string;
  priority: 'low' | 'medium' | 'high';
  caseType: 'positive' | 'negative' | 'boundary';
  coversCriteria: number[];
}

export function normalizeCases(raw: unknown, criteriaCount: number, existingScenarios: string[]): GeneratedCase[] {
  const list = Array.isArray((raw as { testCases?: unknown })?.testCases) ? ((raw as { testCases: unknown[] }).testCases) : [];
  const seen = new Set(existingScenarios.map((s) => s.trim().toLowerCase()));
  const out: GeneratedCase[] = [];
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    const x = it as Record<string, unknown>;
    const scenario = str(x.scenario);
    const steps = strs(x.steps);
    const expectedResult = str(x.expectedResult);
    if (!scenario || !steps.length || !expectedResult || seen.has(scenario.toLowerCase())) continue;
    seen.add(scenario.toLowerCase());
    const p = str(x.priority).toLowerCase();
    const t = str(x.type).toLowerCase();
    out.push({
      scenario: clip(scenario, 240), steps, expectedResult,
      priority: p === 'high' || p === 'low' ? p : 'medium',
      caseType: t === 'negative' || t === 'boundary' ? t : 'positive',
      coversCriteria: (Array.isArray(x.coversCriteria) ? x.coversCriteria : []).filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= criteriaCount),
    });
  }
  return out;
}

