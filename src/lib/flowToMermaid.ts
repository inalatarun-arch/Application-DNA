export function flowToMermaid(steps: string[]): string {
  const clean = steps.map((s) => s.trim()).filter(Boolean);
  if (!clean.length) return 'flowchart TD\n  A[Start] --> B[No documented process steps]';
  const nodes = clean.map((step, i) => `  N${i}[${step.replace(/[\[\]"]/g, '')}]`);
  const edges = clean.slice(0, -1).map((_, i) => `  N${i} --> N${i + 1}`);
  return ['flowchart TD', ...nodes, ...edges].join('\n');
}
