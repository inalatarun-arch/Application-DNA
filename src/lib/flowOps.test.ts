import { describe, expect, it } from 'vitest';
import { applyFlowOps, flowToCompact, normalizeOps } from '@/lib/flowOps';
import type { FlowModel } from '@/lib/flowModel';

const base: FlowModel = {
  title: 'T', subtitle: '', lanes: ['User'],
  nodes: [
    { id: 'a', label: 'Start', lane: 'User', kind: 'start' },
    { id: 'b', label: 'Submit', lane: 'User', kind: 'step' },
    { id: 'c', label: 'End', lane: 'User', kind: 'end' },
  ],
  edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
};

describe('normalizeOps', () => {
  it('drops malformed operations', () => {
    const ops = normalizeOps([{ op: 'addNode', id: 'x', label: 'X', kind: 'step', lane: 'User' }, { op: 'nonsense' }, null, 'text', { op: 'removeNode' }]);
    expect(ops).toHaveLength(1);
  });
  it('returns an empty list for non-arrays', () => {
    expect(normalizeOps('oops')).toHaveLength(0);
  });
});

describe('applyFlowOps', () => {
  it('inserts a step between two others', () => {
    const r = applyFlowOps(base, normalizeOps([
      { op: 'removeEdge', from: 'b', to: 'c' },
      { op: 'addNode', id: 'n1', label: 'Manager approval', kind: 'step', lane: 'User' },
      { op: 'addEdge', from: 'b', to: 'n1' },
      { op: 'addEdge', from: 'n1', to: 'c' },
    ]));
    expect(r.applied).toBe(4);
    expect(r.model.nodes).toHaveLength(4);
    expect(r.model.edges.some((e) => e.from === 'b' && e.to === 'c')).toBe(false);
  });

  it('removing a node reconnects its neighbours so the flow stays continuous', () => {
    const r = applyFlowOps(base, normalizeOps([{ op: 'removeNode', id: 'b' }]));
    expect(r.model.nodes).toHaveLength(2);
    expect(r.model.edges).toEqual([{ from: 'a', to: 'c' }]);
  });

  it('skips operations that point at unknown ids and does not change the input', () => {
    const r = applyFlowOps(base, normalizeOps([{ op: 'updateNode', id: 'zzz', label: 'x' }, { op: 'addEdge', from: 'a', to: 'nope' }]));
    expect(r.applied).toBe(0);
    expect(r.skipped).toHaveLength(2);
    expect(base.nodes).toHaveLength(3);
  });
});

describe('flowToCompact', () => {
  it('uses one short line per node and edge', () => {
    const c = flowToCompact(base);
    expect(c).toContain('b|step|User|Submit');
    expect(c).toContain('a>b');
  });
});
