import { PREVIEW_CSS } from '../components/MarkdownPreview';

const safeName = (s: string): string => s.replace(/[^a-z0-9\-_ ]+/gi, '').trim().replace(/\s+/g, '_') || 'document';

export function downloadText(filename: string, content: string, mime = 'text/markdown;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportMarkdown(title: string, version: number, markdown: string): void {
  downloadText(`${safeName(title)}_v${version}.md`, markdown);
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface PrintMeta {
  title: string;
  version: number;
  status: string;
  audit: { timestamp: string; stageLabel: string; reviewerName: string; role: string; decision: string; comments: string }[];
}

/**
 * Print / Save as PDF. Uses the already-rendered preview HTML (so Mermaid diagrams are included)
 * in a hidden iframe and opens the browser print dialog - choose "Save as PDF" as the destination.
 */
export function printDocument(renderedHtml: string, meta: PrintMeta): void {
  const rows = meta.audit
    .map(
      (a) =>
        `<tr><td>${esc(new Date(a.timestamp).toLocaleString())}</td><td>${esc(a.stageLabel)}</td><td>${esc(a.reviewerName)}</td><td>${esc(a.role)}</td><td>${esc(a.decision)}</td><td>${esc(a.comments)}</td></tr>`,
    )
    .join('');
  const auditHtml = meta.audit.length
    ? `<h2>Approval History</h2><div class="md-table"><table><thead><tr><th>Date</th><th>Stage</th><th>Reviewer</th><th>Role</th><th>Decision</th><th>Comments</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '';
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(meta.title)} v${meta.version}</title>
<style>
@page{margin:18mm 16mm}
body{margin:0}
.cover{font-family:Inter,system-ui,sans-serif;font-size:11px;color:#45464c;border-bottom:1px solid #D1D5DB;padding-bottom:8px;margin-bottom:18px;display:flex;justify-content:space-between}
${PREVIEW_CSS}
.md-body h2{break-after:avoid}.md-body table,.md-body pre,.md-diagram{break-inside:avoid}
</style></head><body>
<div class="cover"><span>${esc(meta.title)}</span><span>Version ${meta.version} · ${esc(meta.status)} · Printed ${esc(new Date().toLocaleDateString())}</span></div>
<div class="md-body">${renderedHtml}${auditHtml}</div></body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);
  const w = iframe.contentWindow;
  if (!w) {
    iframe.remove();
    return;
  }
  w.document.open();
  w.document.write(doc);
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
    setTimeout(() => iframe.remove(), 2000);
  }, 400);
}
