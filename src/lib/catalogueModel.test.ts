import { describe, expect, test } from 'vitest';
import { canonicaliseIds, countPlan, isProjectOnlyPart, leadingId, mergeAnswers, normalizeCatalogue, resolveApplication } from './catalogueModel';

const roster = ['Salesforce Sales Cloud', 'Oracle E-Business Suite'];

describe('resolveApplication', () => {
  test('exact, loose containment, and refusal when ambiguous or unknown', () => {
    expect(resolveApplication('salesforce sales cloud', roster)).toBe('Salesforce Sales Cloud');
    expect(resolveApplication('Oracle E-Business Suite (Accounts Payable)', roster)).toBe('Oracle E-Business Suite');
    expect(resolveApplication('Oracle', roster)).toBe('Oracle E-Business Suite');
    expect(resolveApplication('Sales', ['Sales Cloud', 'Sales Portal'])).toBeNull();
    expect(resolveApplication('Workday', roster)).toBeNull();
    expect(resolveApplication('', roster)).toBeNull();
  });
});

describe('leadingId', () => {
  test.each([['SCR-01.01.01 Supplier Request', 'SCR-01.01.01'], ['fn-01.01.01-01 Create draft', 'FN-01.01.01-01'], ['CMP-01-01 — Workspace', 'CMP-01-01'], ['MOD-02.01', 'MOD-02.01'], ['POST /suppliers', ''], ['Supplier Request', ''], ['E-Business Suite', '']])('%s', (n, want) => expect(leadingId(n)).toBe(want));
});

describe('normalizeCatalogue', () => {
  test('keeps only roster applications, counts strays, fills missing fields', () => {
    const raw = { applications: [
      { applicationName: 'Salesforce Sales Cloud', modules: [{ name: 'MOD-01.01 Intake' }], screens: [{ name: 'SCR-01.01.01 Request', moduleName: 'MOD-01.01 Intake', fieldDescriptions: [{ field: 'Name', description: 'Text; Yes' }] }], functionalities: [{ name: 'FN-01 Create', screenName: 'SCR-01.01.01 Request' }], technicalComponents: [{ name: 'INT-01-01 Handoff', kind: 'integration', metadata: { source: 'APP-01', n: 3 } }] },
      { applicationName: 'Unknown App', screens: [{ name: 'S1' }, { name: 'S2' }] },
      'junk', null,
    ] };
    const { perApp, unmatched } = normalizeCatalogue(raw, roster);
    expect([...perApp.keys()]).toEqual(['Salesforce Sales Cloud']);
    expect(unmatched).toBe(2);
    const plan = perApp.get('Salesforce Sales Cloud')!;
    expect(plan.screens[0].fieldDescriptions).toEqual([{ field: 'Name', description: 'Text; Yes' }]);
    expect(plan.technicalComponents[0]).toMatchObject({ kind: 'integration', metadata: { source: 'APP-01' } });
    expect(normalizeCatalogue('nonsense', roster).perApp.size).toBe(0);
  });
});

describe('ID-based de-duplication across parts', () => {
  const part = (screens: string[], fns: Array<[string, string]> = []) => normalizeCatalogue({ applications: [{ applicationName: roster[0], screens: screens.map((name) => ({ name, purpose: name.length > 20 ? 'long purpose text' : '' })), functionalities: fns.map(([name, screenName]) => ({ name, screenName })) }] }, roster);

  test('items sharing a source ID merge, and references follow the first full name', () => {
    const merged = mergeAnswers([
      part(['SCR-01.01.01 Supplier Request'], [['FN-01.01.01-01 Create draft', 'SCR-01.01.01 Supplier Request']]),
      part(['SCR-01.01.01 Supplier Request form (TDD)'], [['FN-01.01.01-01 create a draft', 'SCR-01.01.01']]),
    ], roster).get(roster[0])!;
    expect(merged.screens).toHaveLength(1);
    expect(merged.screens[0].name).toBe('SCR-01.01.01 Supplier Request');
    expect(merged.functionalities).toHaveLength(1);
    expect(merged.functionalities[0].screenName).toBe('SCR-01.01.01 Supplier Request');
  });

  test('a restatement without an ID joins the item that has one, unless the bare name is ambiguous', () => {
    const merged = mergeAnswers([
      normalizeCatalogue({ applications: [{ applicationName: roster[0], technicalComponents: [{ name: 'OBJ-02-01 AP_SUPPLIER', kind: 'table' }, { name: 'OBJ-02-02 Shared', kind: 'table' }, { name: 'OBJ-02-03 Shared', kind: 'table' }] }] }, roster),
      normalizeCatalogue({ applications: [{ applicationName: roster[0], technicalComponents: [{ name: 'AP_SUPPLIER', kind: 'table', description: 'from design' }, { name: 'Shared', kind: 'table' }] }] }, roster),
    ], roster).get(roster[0])!;
    expect(merged.technicalComponents.map((c) => c.name).sort()).toEqual(['OBJ-02-01 AP_SUPPLIER', 'OBJ-02-02 Shared', 'OBJ-02-03 Shared', 'Shared']);
    expect(merged.technicalComponents.find((c) => c.name === 'OBJ-02-01 AP_SUPPLIER')!.description).toBe('from design');
  });

  test('items without an ID are only merged when their names match', () => {
    const [p] = canonicaliseIds([part(['Alpha', 'Beta']).perApp.get(roster[0])!]);
    expect(p.screens.map((s) => s.name)).toEqual(['Alpha', 'Beta']);
  });
});

describe('countPlan', () => {
  test('groups components for the summary table', () => {
    const { perApp } = normalizeCatalogue({ applications: [{ applicationName: roster[0], modules: [{ name: 'M' }], technicalComponents: [
      { name: 'a', kind: 'integration' }, { name: 'b', kind: 'table' }, { name: 'c', kind: 'view' }, { name: 'd', kind: 'rest' }, { name: 'e', kind: 'service' }, { name: 'f', kind: 'job' }, { name: 'g', kind: 'nonsense' },
    ] }] }, roster);
    expect(countPlan(perApp.get(roster[0])!)).toEqual({ modules: 1, screens: 0, functionalities: 0, integrations: 1, database: 2, apis: 1, components: 3 });
  });
});

describe('isProjectOnlyPart', () => {
  test.each([
    [{ path: ['9. Test Cases'], text: '## TC-1' }, true], [{ path: [], text: '# 11. Defects\n\nx' }, true], [{ path: ['Appendix A: Mermaid Source'], text: 'x' }, true],
    [{ path: ['10. Requirements Traceability Matrix'], text: 'x' }, true], [{ path: ['2. Applications'], text: 'x' }, false], [{ path: ['5. Requirements Catalog'], text: 'x' }, false],
    [{ path: [], text: '# Functional specification\n\nx' }, false],
  ])('%j', (part, want) => expect(isProjectOnlyPart(part)).toBe(want));
});
