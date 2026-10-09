import { describe, expect, it } from 'vitest';
import { flowToBpmn, flowToDrawio, flowToVsdx } from '@/lib/flowFormats';
import type { FlowModel } from '@/lib/flowModel';

const model: FlowModel = {
  title: 'Order <& "check">', subtitle: '', lanes: ['Buyer', 'System'],
  nodes: [
    { id: 'a', label: 'Start', lane: 'Buyer', kind: 'start' },
    { id: 'b', label: 'Check stock & price', lane: 'System', kind: 'decision' },
    { id: 'c', label: 'Done', lane: 'System', kind: 'end' },
  ],
  edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'Yes' }],
};

describe('BPMN', () => {
  const xml = flowToBpmn(model);
  it('is a BPMN 2.0 document with events, a gateway and flows', () => {
    expect(xml).toContain('http://www.omg.org/spec/BPMN/20100524/MODEL');
    expect(xml).toContain('startEvent');
    expect(xml).toContain('exclusiveGateway');
    expect(xml).toContain('sequenceFlow');
  });
  it('escapes special characters', () => {
    expect(xml).toContain('&amp;');
    expect(xml).not.toContain('Check stock & price');
  });
});

describe('draw.io', () => {
  it('is an mxfile with one vertex per node and one edge per connection', () => {
    const xml = flowToDrawio(model);
    expect(xml).toContain('<mxfile');
    expect((xml.match(/vertex="1"/g) ?? []).length).toBeGreaterThan(2);
    expect((xml.match(/edge="1"/g) ?? []).length).toBe(2);
  });
});

describe('Visio', () => {
  it('is a zip package with the required parts', () => {
    const bytes = flowToVsdx(model);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toContain('[Content_Types].xml');
    expect(text).toContain('visio/document.xml');
    expect(text).toContain('visio/pages/page1.xml');
  });
});
