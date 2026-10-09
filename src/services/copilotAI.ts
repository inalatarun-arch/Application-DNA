import { db } from '@/db/db';
import { generateText } from './geminiService';
import { COPILOT_SYSTEM, compact } from '@/prompts';
import { rank } from '@/lib/retrieval';

const MAX_CONTEXT_CHARS = 14_000;
const MAX_RECORDS = 30;

async function repositoryContext(q: string): Promise<{ text: string; count: number }> {
  const [apps, mods, screens, funcs, comps, projects, reqs, tests, defects] = await Promise.all([
    db.applications.toArray(), db.modules.toArray(), db.screens.toArray(), db.functionalities.toArray(), db.technicalComponents.toArray(),
    db.projects.toArray(), db.requirements.toArray(), db.testCases.toArray(), db.defects.toArray(),
  ]);
  // Names of linked items replace ids so the model can cite them.
  const fnName = new Map(funcs.map((f) => [f.id, f.name]));
  const screenName = new Map(screens.map((s) => [s.id, s.name]));
  const rec = (kind: string, name: string, data: unknown) => ({ kind, name, text: compact(data, 900) });
  const records = [
    ...apps.map((x) => rec('application', x.name, { vendor: x.vendor, domain: x.domain, description: x.description, stack: x.technicalStack })),
    ...mods.map((x) => rec('module', x.name, { description: x.description })),
    ...screens.map((x) => rec('screen', x.name, { purpose: x.purpose, process: x.businessProcess, fields: (x.uiElements ?? []).slice(0, 20).map((u) => u.name), rules: x.validationRules?.slice(0, 6), upstream: x.upstreamSystems, downstream: x.downstreamSystems })),
    ...funcs.map((x) => rec('functionality', x.name, { description: x.description, purpose: x.businessPurpose, roles: x.userRoles, inputs: x.inputs, outputs: x.outputs, upstream: x.upstreamSystems, downstream: x.downstreamSystems, screen: x.screenId ? screenName.get(x.screenId) : undefined })),
    ...comps.map((x) => rec('technical component', x.name, { kind: x.kind, description: x.description, usedBy: (x.functionalityIds ?? []).map((id) => fnName.get(id)).filter(Boolean), columns: x.columns?.slice(0, 15).map((c) => c.name), metadata: x.metadata })),
    ...projects.map((x) => rec('project', x.name, { description: x.description, status: x.status })),
    ...reqs.map((x) => rec('requirement', x.title, { kind: x.kind, status: x.status, description: x.description, functionalities: (x.functionalityIds ?? []).map((id) => fnName.get(id)).filter(Boolean) })),
    ...tests.map((x) => rec('test case', x.scenario, { level: x.level, status: x.status, expected: x.expectedResult })),
    ...defects.map((x) => rec('defect', x.title, { severity: x.severity, status: x.status, description: x.description })),
  ];
  const hits = rank(records, q).slice(0, MAX_RECORDS);
  const lines: string[] = [];
  let used = 0;
  for (const h of hits) {
    const line = `[${h.kind}] ${h.name}\n${h.text}`;
    if (used + line.length > MAX_CONTEXT_CHARS) break;
    lines.push(line);
    used += line.length;
  }
  return { text: lines.join('\n\n'), count: lines.length };
}

export async function askCopilot(question: string, signal?: AbortSignal): Promise<{ answer: string; sources: number }> {
  const ctx = await repositoryContext(question);
  const prompt = `QUESTION\n${question.trim()}\n\nREPOSITORY CONTEXT (${ctx.count} matching records)\n${ctx.text || 'No matching repository records found.'}`;
  const result = await generateText(prompt, { feature: 'copilot', system: COPILOT_SYSTEM, temperature: 0.2, maxOutputTokens: 3000, signal });
  return { answer: result.text.trim() || 'No answer was returned. Try rephrasing the question.', sources: ctx.count };
}
