import type { ImpactReport, ChangeType, Severity, Requirement } from '../db/deliveryDb';

const arr = <T,>(v: unknown, map: (x: unknown) => T): T[] => (Array.isArray(v) ? v.map(map) : []);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : v == null ? d : String(v));
const strs = (v: unknown): string[] => arr(v, (x) => str(x)).filter(Boolean);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => {
  const s = str(v).toLowerCase();
  return allowed.find((a) => a.toLowerCase() === s) ?? d;
};

const CHANGE: readonly ChangeType[] = ['New', 'Modify', 'Remove', 'Review'];
const SEV: readonly Severity[] = ['Low', 'Medium', 'High'];

/** Coerces whatever Gemini returned into a fully-populated ImpactReport so the UI never crashes on missing fields. */
export function normalizeImpact(raw: unknown): ImpactReport {
  const r = obj(raw);
  const fi = obj(r.functionalImpact);
  const ti = obj(r.technicalImpact);
  const ga = obj(r.gapAnalysis);
  return {
    summary: str(r.summary, 'No summary returned.'),
    overallRisk: pick(r.overallRisk, ['Low', 'Medium', 'High', 'Critical'] as const, 'Medium'),
    confidence: pick(r.confidence, ['Low', 'Medium', 'High'] as const, 'Low'),
    knowledgeCoverage: str(r.knowledgeCoverage),
    functionalImpact: {
      screens: arr(fi.screens, (x) => {
        const o = obj(x);
        return { name: str(o.name), application: str(o.application), impact: str(o.impact), changeType: pick(o.changeType, CHANGE, 'Review'), sourceRefs: strs(o.sourceRefs) };
      }),
      processes: arr(fi.processes, (x) => {
        const o = obj(x);
        return { name: str(o.name), impact: str(o.impact), sourceRefs: strs(o.sourceRefs) };
      }),
    },
    technicalImpact: {
      components: arr(ti.components, (x) => {
        const o = obj(x);
        return { type: str(o.type, 'Other'), name: str(o.name), impact: str(o.impact), changeType: pick(o.changeType, CHANGE, 'Review'), sourceRefs: strs(o.sourceRefs) };
      }),
    },
    integrationRisks: arr(r.integrationRisks, (x) => {
      const o = obj(x);
      return {
        direction: pick(o.direction, ['Upstream', 'Downstream'] as const, 'Downstream'),
        system: str(o.system),
        risk: str(o.risk),
        severity: pick(o.severity, SEV, 'Medium'),
        mitigation: str(o.mitigation),
        sourceRefs: strs(o.sourceRefs),
      };
    }),
    gapAnalysis: {
      missingApprovalSteps: strs(ga.missingApprovalSteps),
      regressionRisks: strs(ga.regressionRisks),
      missingRequirements: strs(ga.missingRequirements),
      missingTestCoverage: strs(ga.missingTestCoverage),
      unaddressedDependencies: strs(ga.unaddressedDependencies),
    },
    overlappingProjects: strs(r.overlappingProjects),
    recommendedActions: strs(r.recommendedActions),
  };
}

export function impactToMarkdown(req: Pick<Requirement, 'id' | 'title' | 'text'>, r: ImpactReport): string {
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join('\n') : '- None identified');
  const refs = (x: string[]) => (x.length ? ` [${x.join(', ')}]` : '');
  return `# Impact Assessment - REQ-${req.id}: ${req.title}

**Overall risk:** ${r.overallRisk} | **Confidence:** ${r.confidence}

${r.summary}

> Knowledge coverage: ${r.knowledgeCoverage || 'n/a'}

## Impacted Screens
${r.functionalImpact.screens.length ? r.functionalImpact.screens.map((s) => `- **${s.name}** (${s.application || 'n/a'}) - ${s.changeType}: ${s.impact}${refs(s.sourceRefs)}`).join('\n') : '- None identified'}

## Impacted Processes
${r.functionalImpact.processes.length ? r.functionalImpact.processes.map((p) => `- **${p.name}**: ${p.impact}${refs(p.sourceRefs)}`).join('\n') : '- None identified'}

## Impacted Technical Components
${r.technicalImpact.components.length ? r.technicalImpact.components.map((c) => `- **${c.type}: ${c.name}** - ${c.changeType}: ${c.impact}${refs(c.sourceRefs)}`).join('\n') : '- None identified'}

## Integration Risks
${r.integrationRisks.length ? r.integrationRisks.map((i) => `- ${i.direction} / **${i.system}** [${i.severity}]: ${i.risk} Mitigation: ${i.mitigation}${refs(i.sourceRefs)}`).join('\n') : '- None identified'}

## Gap Analysis
### Missing approval steps
${list(r.gapAnalysis.missingApprovalSteps)}
### Regression risks
${list(r.gapAnalysis.regressionRisks)}
### Missing requirements
${list(r.gapAnalysis.missingRequirements)}
### Missing test coverage
${list(r.gapAnalysis.missingTestCoverage)}
### Unaddressed dependencies
${list(r.gapAnalysis.unaddressedDependencies)}

## Overlapping projects
${list(r.overlappingProjects)}

## Recommended actions
${list(r.recommendedActions)}
`;
}
