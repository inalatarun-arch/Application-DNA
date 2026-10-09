import { describe, expect, it } from 'vitest';
import { generateFdd, traceCodes, type FddInput, type GenResult } from '@/lib/fddPipeline';
import { defaultFrdHeadings } from '@/lib/fddTemplate';

const now = '2026-01-01T00:00:00.000Z';
const base = { id: 'x', createdAt: now, updatedAt: now };

function input(fnCount = 3): FddInput {
  const functionalities = Array.from({ length: fnCount }, (_, i) => ({
    ...base, id: `f${i}`, applicationId: 'a1', moduleId: 'm1', screenId: 's1', name: `Function ${i + 1}`, description: 'd', businessPurpose: 'p', processFlow: '',
    userRoles: ['Buyer'], triggers: [], inputs: ['Amount'], outputs: [], exceptions: { validation: [], error: [], business: [], system: [] },
    relatedFunctionalityIds: [], upstreamSystems: [], downstreamSystems: [],
  }));
  return {
    project: { ...base, id: 'p1', name: 'Project X', description: 'Desc', applicationIds: ['a1'], moduleIds: [], functionalityIds: [] } as unknown as FddInput['project'],
    requirements: [{ ...base, id: 'r1', projectId: 'p1', kind: 'functional', title: 'Req one', description: 'd', acceptanceCriteria: ['ac'], status: 'approved', functionalityIds: ['f0'] }] as FddInput['requirements'],
    stories: [],
    source: {
      applications: [{ ...base, id: 'a1', name: 'App' }], modules: [{ ...base, id: 'm1', applicationId: 'a1', name: 'Mod' }],
      screens: [{ ...base, id: 's1', applicationId: 'a1', name: 'Screen One', uiElements: [{ name: 'Amount', type: 'input', description: '', action: '', required: true }], fieldDescriptions: [], validationRules: [], workflowSteps: [], exceptionHandling: [], upstreamSystems: [], downstreamSystems: [] }],
      functionalities, components: [], requirements: [],
    } as unknown as FddInput['source'],
    futureFlow: 'flowchart TD\nA-->B',
    level: 'lean',
  };
}

const ok = (text: string): GenResult => ({ text, model: 'fake', usage: { promptTokens: 10, outputTokens: 5 } });

/** A model that answers every part, sometimes with the wrong headings. */
function fakeModel(opts: { failOn?: string; rename?: boolean } = {}) {
  const calls: string[] = [];
  return {
    calls,
    generate: async (prompt: string): Promise<GenResult> => {
      calls.push(prompt);
      if (opts.failOn && prompt.includes(opts.failOn)) throw new Error('boom');
      if (prompt.includes('1.1 Purpose of Documentation')) return ok(`## ${opts.rename ? 'Purpose' : '1.1 Purpose of Documentation'}\nWhy.\n\n## 2.1 Business Process Model\nExplains the flow.`);
      if (prompt.includes('Write section 3 entries')) {
        const titles = [...prompt.matchAll(/^## 3\.(\d+) (.+)$/gm)];
        return ok(titles.map((t) => `## 3.${t[1]} ${t[2]}\n### 3.${t[1]}.1 Use Case\n| Item | Detail |\n|---|---|\n| Goal | Do ${t[2]} |`).join('\n\n'));
      }
      return ok('## 4.1 Performance\n- The system shall respond fast.');
    },
  };
}

describe('generateFdd', () => {
  it('produces the five sections in order with every functionality numbered', async () => {
    const m = fakeModel();
    const r = await generateFdd(input(3), m, undefined);
    const tops = r.markdown.split('\n').filter((l) => /^# /.test(l));
    expect(tops).toEqual(['# 1 Introduction', '# 2 System/Solution Overview', '# 3 Functional Specifications', '# 4 Non-Functional Requirements', '# 5 Appendix/Glossary']);
    expect(r.markdown).toContain('## 3.1 Function 1');
    expect(r.markdown).toContain('## 3.3 Function 3');
    expect(r.markdown).toContain('Goal | Do Function 2');
    expect(r.failed).toHaveLength(0);
    // 1 overview + 2 calls for three functionalities (two per call) + 1 closing
    expect(m.calls).toHaveLength(4);
  });

  it('inserts the future-state diagram itself instead of asking the model for it', async () => {
    const r = await generateFdd(input(1), fakeModel(), undefined);
    expect(r.markdown).toContain('```mermaid\nflowchart TD\nA-->B\n```');
  });

  it('adds a wireframe placeholder per functionality that points at its screen', async () => {
    const r = await generateFdd(input(1), fakeModel(), undefined);
    expect(r.markdown).toContain('![Wireframe: Screen One](wireframe:s1)');
  });

  it('keeps content when the model renames a heading', async () => {
    const r = await generateFdd(input(1), fakeModel({ rename: true }), undefined);
    expect(r.markdown).toContain('Why.');
  });

  it('survives a failed part, marks it not documented and reports it', async () => {
    const r = await generateFdd(input(3), fakeModel({ failOn: 'Function 3' }), undefined);
    expect(r.failed.length).toBeGreaterThan(0);
    expect(r.markdown).toContain('## 3.3 Function 3');
    expect(r.markdown).toContain('Goal | Do Function 1');
    expect(r.notes.join(' ')).toContain('could not be generated');
  });

  it('limits section 3 and says so', async () => {
    const r = await generateFdd(input(35), fakeModel(), undefined);
    expect(r.markdown).toContain('## 3.30 Function');
    expect(r.markdown).not.toContain('## 3.31 ');
    expect(r.notes.join(' ')).toContain('30 of 35');
  });

  it('stops when cancelled instead of swallowing the cancellation', async () => {
    const abort = Object.assign(new Error('cancelled'), { code: 'ABORTED' });
    let threw = false;
    try {
      await generateFdd(input(1), { generate: async () => { throw abort; } }, undefined);
    } catch (e) {
      threw = (e as { code?: string }).code === 'ABORTED';
    }
    expect(threw).toBe(true);
  });

  it('sums the tokens the model reported', async () => {
    const r = await generateFdd(input(1), fakeModel(), undefined);
    expect(r.tokens.prompt).toBe(30);
    expect(r.tokens.output).toBe(15);
  });
});

describe('traceCodes', () => {
  it('numbers requirements and skips rejected ones', () => {
    const i = input(1);
    i.requirements.push({ ...i.requirements[0], id: 'r2', status: 'rejected' });
    const t = traceCodes(i.requirements, []);
    expect(t.reqCode.get('r1')).toBe('REQ-001');
    expect(t.reqCode.has('r2')).toBe(false);
  });
});

describe('template headings', () => {
  it('are stored as the default FDD template', () => {
    expect(defaultFrdHeadings().length).toBeGreaterThan(30);
  });
});
