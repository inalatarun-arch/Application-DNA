import { describe, expect, it } from 'vitest';
import { mermaidHasErrors, modelToMermaid, parseMermaidFlow, sanitizeMermaid, validateMermaid } from '@/lib/mermaidFlow';

const SAMPLE = `flowchart TD
  A(["Start"]) --> B["Enter order"]
  B --> C{"Stock available?"}
  C -->|Yes| D["Confirm order"]
  C -->|No| E["Back-order"]
  D --> F(["End"])
  E --> F`;

describe('parseMermaidFlow', () => {
  it('reads nodes, shapes and labelled edges', () => {
    const m = parseMermaidFlow(SAMPLE, 'Orders');
    expect(m.nodes).toHaveLength(6);
    expect(m.nodes.find((n) => n.id === 'C')?.kind).toBe('decision');
    expect(m.edges.find((e) => e.from === 'C' && e.to === 'D')?.label).toBe('Yes');
  });

  it('keeps subgraphs as lanes', () => {
    const m = parseMermaidFlow('flowchart TD\n subgraph Buyer\n A["Request"]\n end\n subgraph System\n B["Validate"]\n end\n A --> B');
    expect(m.lanes).toContain('Buyer');
    expect(m.nodes.find((n) => n.id === 'B')?.lane).toBe('System');
  });
});

describe('validate and sanitize', () => {
  it('accepts the sample', () => {
    expect(mermaidHasErrors(validateMermaid(SAMPLE))).toBe(false);
  });

  it('flags a diagram without a flowchart header or edges', () => {
    expect(mermaidHasErrors(validateMermaid('hello world'))).toBe(true);
  });

  it('strips code fences', () => {
    expect(sanitizeMermaid('```mermaid\nflowchart TD\nA-->B\n```')).toMatch(/^flowchart TD/);
  });
});

describe('round trip', () => {
  it('writes Mermaid that parses back to the same structure', () => {
    const m = parseMermaidFlow(SAMPLE, 'Orders');
    const again = parseMermaidFlow(modelToMermaid(m), 'Orders');
    expect(again.nodes).toHaveLength(m.nodes.length);
    expect(again.edges).toHaveLength(m.edges.length);
    expect(mermaidHasErrors(validateMermaid(modelToMermaid(m)))).toBe(false);
  });
});
