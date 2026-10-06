import { useEffect, useId, useRef, useState } from 'react';
import mermaid from 'mermaid';

export default function MermaidDiagram({ source }: { source: string }) {
  const rawId = useId();
  const id = 'mermaid-' + rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const render = async () => {
      if (!ref.current || !source.trim()) return;
      setError('');
      try {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default' });
        const result = await mermaid.render(id, source);
        if (active && ref.current) ref.current.innerHTML = result.svg;
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not render Mermaid.');
      }
    };
    void render();
    return () => { active = false; };
  }, [id, source]);
  return <div className="overflow-auto rounded border border-outline-variant bg-surface-lowest p-4">{error ? <><p className="text-body-md text-error">{error}</p><pre className="mt-3 whitespace-pre-wrap font-mono text-code">{source}</pre></> : <div ref={ref} className="flex min-h-48 justify-center [&_svg]:max-w-full" aria-label="Mermaid process flow" />}</div>;
}
