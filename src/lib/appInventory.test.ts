import { describe, expect, test } from 'vitest';
import { fillBlanks, mapColumns, mergeInventories, normalizeInventory, parseDelimited, parseTier, stageInventory, tableToInventory } from './appInventory';
import type { Application } from '../db/types';

describe('parseTier', () => {
  test.each([
    ['Tier 1', 'tier-1'], ['2', 'tier-2'], ['P3', 'tier-3'], ['tier-4', 'tier-4'], ['Mission critical', 'tier-1'],
    ['Business critical', 'tier-2'], ['Business operational', 'tier-3'], ['Non-critical', 'tier-4'], ['Low', 'tier-4'], ['', ''], ['banana', ''], ['2024', ''],
  ])('%s -> %s', (raw, want) => expect(parseTier(raw)).toBe(want));
});

describe('parseDelimited', () => {
  test('quotes, doubled quotes, embedded newlines and delimiter detection', () => {
    expect(parseDelimited('a,b\n"x, y","he said ""hi"""\n"line1\nline2",z')).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['line1\nline2', 'z']]);
    expect(parseDelimited('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseDelimited('﻿a;b\r\n1;2\r\n\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('column mapping and table import', () => {
  test('maps common inventory headers', () => {
    const headers = ['Application Name', 'Platform', 'Business Domain', 'Criticality', 'Business Owner', 'IT Owner', 'Tech Stack', 'Tags', 'Comments?', 'Description'];
    const m = mapColumns(headers);
    expect(headers.map((_, i) => m.fields.get(i)).filter(Boolean)).toEqual(['name', 'vendor', 'domain', 'criticalTier', 'businessOwner', 'technicalOwner', 'technicalStack', 'tags', 'description']);
    expect(m.unmapped).toEqual(['Comments?']);
  });

  test('"Application Owner" is the business owner', () => {
    const m = mapColumns(['App', 'Application Owner']);
    expect([m.fields.get(0), m.fields.get(1)]).toEqual(['name', 'businessOwner']);
  });

  test('builds applications, merges repeated names into modules, skips blanks and title rows', () => {
    const rows = parseDelimited([
      'Application inventory 2026,,,',
      'Application,Vendor,Domain,Tier,Module,Stack',
      'Oracle EBS,Oracle,Finance,Tier 1,Payables,"PL/SQL; Forms"',
      'Oracle EBS,Oracle,Finance,Tier 1,Receivables,',
      ',,,,,',
      'Workday,Workday,HR,2,,Java',
    ].join('\n'));
    const t = tableToInventory(rows)!;
    expect(t.apps).toHaveLength(2);
    const ebs = t.apps[0];
    expect(ebs).toMatchObject({ name: 'Oracle EBS', vendor: 'Oracle', domain: 'Finance', criticalTier: 'tier-1' });
    expect(ebs.modules.map((m) => m.name)).toEqual(['Payables', 'Receivables']);
    expect(ebs.technicalStack).toEqual(['PL/SQL', 'Forms']);
    expect(t.apps[1].criticalTier).toBe('tier-2');
    expect(t.rowCount).toBe(3);
  });

  test('returns null when there is no application-name column', () => {
    expect(tableToInventory(parseDelimited('Region,Revenue\nEU,10'))).toBeNull();
    expect(tableToInventory([])).toBeNull();
  });
});

describe('normalising model output', () => {
  test('is forgiving about shapes and drops nameless rows', () => {
    const apps = normalizeInventory({ applications: [
      { name: '  SAP   ERP ', technicalStack: 'ABAP, Fiori', criticalTier: 'Tier 1', modules: ['FI', { name: 'MM', description: 'Materials' }, { name: '' }], tags: null },
      { vendor: 'no name' }, 'junk', null,
      { name: 'sap erp', domain: 'Finance', description: 'Longer description here' },
    ] });
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ name: 'SAP ERP', domain: 'Finance', criticalTier: 'tier-1', description: 'Longer description here' });
    expect(apps[0].technicalStack).toEqual(['ABAP', 'Fiori']);
    expect(apps[0].modules).toEqual([{ name: 'FI', description: '' }, { name: 'MM', description: 'Materials' }]);
    expect(normalizeInventory('nonsense')).toEqual([]);
  });

  test('mergeInventories unites lists from several files', () => {
    const a = normalizeInventory([{ name: 'X', vendor: 'V', modules: ['A'] }]);
    const b = normalizeInventory([{ name: 'x', domain: 'D', modules: ['A', 'B'] }, { name: 'Y' }]);
    const m = mergeInventories([a, b]);
    expect(m.map((x) => x.name)).toEqual(['X', 'Y']);
    expect(m[0]).toMatchObject({ vendor: 'V', domain: 'D' });
    expect(m[0].modules.map((x) => x.name)).toEqual(['A', 'B']);
  });
});

describe('matching and updating existing applications', () => {
  const existing = { id: '1', name: 'SAP-ERP', vendor: 'SAP', domain: '', description: 'Mine', technicalStack: ['ABAP'], tags: [], businessOwner: '', technicalOwner: '', criticalTier: 'tier-2' } as unknown as Application;

  test('matches ignoring case, punctuation and spacing', () => {
    const staged = stageInventory(normalizeInventory([{ name: 'sap erp' }, { name: 'Brand New' }]), [existing]);
    expect(staged[0]).toMatchObject({ existingId: '1', existingName: 'SAP-ERP', selected: true });
    expect(staged[1].existingId).toBeUndefined();
  });

  test('fillBlanks never overwrites what is already there', () => {
    const [inc] = normalizeInventory([{ name: 'SAP ERP', vendor: 'Other', domain: 'Finance', description: 'Imported', businessOwner: 'Ann', technicalStack: ['ABAP', 'Fiori'], tags: ['SOX'] }]);
    expect(fillBlanks(existing, inc)).toEqual({ domain: 'Finance', businessOwner: 'Ann', technicalStack: ['ABAP', 'Fiori'], tags: ['SOX'] });
  });
});
