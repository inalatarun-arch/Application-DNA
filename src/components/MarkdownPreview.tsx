import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { renderMarkdown } from '../lib/markdown';

export const PREVIEW_CSS = `
.md-body{font-family:Inter,system-ui,sans-serif;color:#111827;font-size:14px;line-height:22px}
.md-body h1{font-size:26px;line-height:34px;font-weight:600;letter-spacing:-0.02em;margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid #111827}
.md-body h2{font-size:19px;line-height:26px;font-weight:600;margin:28px 0 10px;padding-bottom:4px;border-bottom:1px solid #D1D5DB}
.md-body h3{font-size:15px;font-weight:600;margin:20px 0 6px}
.md-body h4,.md-body h5,.md-body h6{font-size:14px;font-weight:600;margin:14px 0 4px}
.md-body p{margin:0 0 10px}
.md-body ul,.md-body ol{margin:0 0 10px;padding-left:22px}
.md-body ul{list-style:disc}.md-body ol{list-style:decimal}
.md-body li{margin:2px 0}
.md-body code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:3px;padding:0 4px}
.md-body pre{background:#F3F4F6;border:1px solid #D1D5DB;border-radius:4px;padding:12px;overflow-x:auto;margin:0 0 12px}
.md-body pre code{background:none;border:0;padding:0}
.md-body blockquote{border-left:3px solid #9CA3AF;margin:0 0 10px;padding:2px 12px;color:#45464c;background:#F9FAFB}
.md-body hr{border:0;border-top:1px solid #D1D5DB;margin:18px 0}
.md-body a{color:#111827;text-decoration:underline}
.md-body .md-table{overflow-x:auto;margin:0 0 14px}
.md-body table{border-collapse:collapse;width:100%;font-size:13px}
.md-body th{background:#F3F4F6;border:1px solid #D1D5DB;padding:6px 8px;text-align:left;font-weight:600}
.md-body td{border:1px solid #D1D5DB;padding:6px 8px;vertical-align:top}
.md-body .md-diagram{margin:0 0 14px;padding:12px;border:1px solid #D1D5DB;border-radius:4px;overflow-x:auto;text-align:center;background:#fff}
.md-body .md-diagram svg{max-width:100%;height:auto}
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
let mermaidPromise: Promise<any> | null = null;
function loadMermaid(): Promise<any> {
  if (!mermaidPromise) {
    const url = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaidPromise = import(/* @vite-ignore */ url).then((m: any) => {
      const mermaid = m.default;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', fontFamily: 'Inter, sans-serif' });
      return mermaid;
    });
    mermaidPromise.catch(() => {
      mermaidPromise = null; // allow retry later
    });
  }
  return mermaidPromise;
}

let diagramCounter = 0;

interface Props {
  markdown: string;
  /** Receives the container element so callers can read the rendered HTML (e.g. for printing). */
  containerRef?: MutableRefObject<HTMLDivElement | null>;
}

export function MarkdownPreview({ markdown, containerRef }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const html = useMemo(() => renderMarkdown(markdown), [markdown]);

  useEffect(() => {
    if (containerRef) containerRef.current = ref.current;
  });

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('pre.md-mermaid'));
    if (blocks.length === 0) return;
    let cancelled = false;
    loadMermaid()
      .then(async (mermaid) => {
        for (const block of blocks) {
          if (cancelled) return;
          const code = (block.getAttribute('data-code') ?? '').replace(/&#10;/g, '\n');
          try {
            const { svg } = await mermaid.render(`eih-mmd-${++diagramCounter}`, code);
            if (cancelled || !block.isConnected) return;
            const wrap = document.createElement('div');
            wrap.className = 'md-diagram';
            wrap.innerHTML = svg; // SVG produced by mermaid in strict security mode
            block.replaceWith(wrap);
          } catch {
            block.title = 'Diagram could not be rendered - check the Mermaid syntax in the editor.';
            block.style.borderColor = '#111827';
          }
        }
      })
      .catch(() => {
        /* offline / CDN blocked: the Mermaid source stays visible as code */
      });
    return () => {
      cancelled = true;
    };
  }, [html]);

  return (
    <>
      <style>{PREVIEW_CSS}</style>
      <div ref={ref} className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
