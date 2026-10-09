import { describe, expect, it } from 'vitest';
import { mergeExtractions, normalizeApplicationExtraction } from '@/lib/extractionModel';
import { applyRevision, parseRevision, resolveAction, stageExtraction, toExtraction, type ExistingNames } from '@/lib/extractionStage';

const raw = {
  application: { name: 'Billing' },
  modules: [{ name: 'Invoices', description: 'Invoice handling' }],
  screens: [{ name: 'Invoice Entry', moduleName: 'Invoices', uiElements: [{ name: 'Amount', type: 'input', required: true }] }],
  functionalities: [{ name: 'Create invoice', screenName: 'Invoice Entry', inputs: ['Amount'] }],
  technicalComponents: [{ name: 'AP_INVOICES', kind: 'table' }, { name: 'Odd', kind: 'not-a-kind' }],
};

describe('normalizeApplicationExtraction', () => {
  it('fills defaults and repairs unknown values instead of failing', () => {
    const e = normalizeApplicationExtraction(raw);
    expect(e.modules[0].operation).toBe('create');
    expect(e.technicalComponents).toHaveLength(2);
    expect(e.technicalComponents[1].kind).toBe('service');
    expect(e.screens[0].uiElements[0].required).toBe(true);
  });

  it('survives garbage', () => {
    const e = normalizeApplicationExtraction('nonsense');
    expect(e.modules).toHaveLength(0);
    expect(e.functionalities).toHaveLength(0);
  });
});

describe('mergeExtractions', () => {
  it('merges same-name items from two batches and unions lists', () => {
    const a = normalizeApplicationExtraction({ functionalities: [{ name: 'Create invoice', inputs: ['Amount'] }] });
    const b = normalizeApplicationExtraction({ functionalities: [{ name: 'create invoice', inputs: ['Date'], description: 'Makes an invoice' }] });
    const m = mergeExtractions([a, b]);
    expect(m.functionalities).toHaveLength(1);
    expect(m.functionalities[0].inputs).toEqual(['Amount', 'Date']);
    expect(m.functionalities[0].description).toBe('Makes an invoice');
  });
});

describe('staging and review', () => {
  const base = normalizeApplicationExtraction(raw);
  const staged = stageExtraction(base);

  it('gives every item a stable reference', () => {
    expect(staged.map((s) => s.ref)).toEqual(['M1', 'S1', 'F1', 'C1', 'C2']);
  });

  it('applies only what the reviewer kept', () => {
    const kept = staged.map((s) => (s.ref === 'C2' ? { ...s, include: false } : s));
    expect(toExtraction(base, kept).technicalComponents).toHaveLength(1);
  });

  it('lets the repository, not the model, decide create or update', () => {
    const existing: ExistingNames = { module: new Set(['invoices']), screen: new Set(), functionality: new Set(), component: new Set() };
    expect(resolveAction(staged[0], existing)).toBe('update');
    expect(resolveAction(staged[1], existing)).toBe('create');
  });

  it('applies a revision from JSON strings and ignores unknown references', () => {
    const rev = parseRevision({
      patches: [{ ref: 'F1', fieldsJson: '{"description":"Creates a draft invoice"}' }, { ref: 'X9', fieldsJson: '{"description":"x"}' }],
      remove: ['C2'],
      add: [{ type: 'module', itemJson: '{"name":"Payments"}' }],
      note: 'done',
    });
    const r = applyRevision(staged, rev);
    expect((r.staged.find((s) => s.ref === 'F1')!.item as { description: string }).description).toBe('Creates a draft invoice');
    expect(r.staged.find((s) => s.ref === 'C2')!.include).toBe(false);
    expect(r.staged.some((s) => s.ref === 'M2')).toBe(true);
    expect(r.ignored).toContain('X9');
  });

  it('does not let a patch change the operation', () => {
    const r = applyRevision(staged, parseRevision({ patches: [{ ref: 'M1', fieldsJson: '{"operation":"update","description":"New"}' }] }));
    expect((r.staged[0].item as { operation: string }).operation).toBe('create');
  });
});
