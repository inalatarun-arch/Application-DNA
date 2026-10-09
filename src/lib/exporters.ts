import { labelOf, REQUIREMENT_KINDS, REQUIREMENT_STATUSES, PRIORITIES } from '@/db/projects';
import type { Meeting, Project, Requirement } from '@/db/types';
import type { ImpactAssessment } from '@/services/impactAI';
import { downloadBlob, slug } from './download';

export function saveText(filename: string, content: string, mime = 'text/markdown'): void {
  downloadBlob(new Blob([content], { type: `${mime};charset=utf-8` }), filename);
}

const bullets = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '_None recorded._');

export function meetingToMarkdown(meeting: Meeting, project: Project): string {
  const decisions = meeting.decisions.length ? meeting.decisions.map((d) => `- ${d.text}${d.owner ? ` _(owner: ${d.owner})_` : ''}`).join('\n') : '_None recorded._';
  const actions = meeting.actionItems.length
    ? meeting.actionItems.map((a) => `- [${a.done ? 'x' : ' '}] ${a.task}, ${a.assignee || 'Unassigned'}${a.due ? `, due ${a.due}` : ''}`).join('\n')
    : '_None recorded._';
  return `# ${meeting.title}

**Project:** ${project.name}  
**Date:** ${meeting.meetingDate || 'n/a'}  
**Attendees:** ${meeting.attendees.join(', ') || 'n/a'}

## Executive summary

${meeting.summary || '_Not generated._'}

## Key discussion points

${bullets(meeting.keyPoints)}

## Decisions

${decisions}

## Action items

${actions}

## Open questions

${bullets(meeting.openQuestions)}
`;
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

export function backlogToCsv(requirements: Requirement[], meetingTitle: (id?: string) => string, functionalityName: (id: string) => string): string {
  const header = ['ID', 'Type', 'Title', 'Description', 'Priority', 'Status', 'Acceptance criteria', 'Impacted functionalities', 'Source meeting'];
  const rows = sorted(requirements).map((r, i) =>
    [
      `REQ-${String(i + 1).padStart(3, '0')}`,
      labelOf(REQUIREMENT_KINDS, r.kind),
      r.title,
      r.description,
      labelOf(PRIORITIES, r.priority ?? 'medium'),
      labelOf(REQUIREMENT_STATUSES, r.status),
      (r.acceptanceCriteria ?? []).join(' | '),
      (r.functionalityIds ?? []).map(functionalityName).filter(Boolean).join(' | '),
      meetingTitle(r.source),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.map(csvCell).join(','), ...rows].join('\r\n');
}

export const sorted = (requirements: Requirement[]): Requirement[] => [...requirements].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export function backlogToMarkdown(project: Project, requirements: Requirement[], functionalityName: (id: string) => string): string {
  const items = sorted(requirements)
    .map((r, i) => {
      const id = `REQ-${String(i + 1).padStart(3, '0')}`;
      const fns = (r.functionalityIds ?? []).map(functionalityName).filter(Boolean);
      return `### ${id}: ${r.title}

**Type:** ${labelOf(REQUIREMENT_KINDS, r.kind)} · **Priority:** ${labelOf(PRIORITIES, r.priority ?? 'medium')} · **Status:** ${labelOf(REQUIREMENT_STATUSES, r.status)}

${r.description || '_No description._'}

${fns.length ? `**Impacted functionalities:** ${fns.join(', ')}\n\n` : ''}${(r.acceptanceCriteria ?? []).length ? `**Acceptance criteria**\n\n${r.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}\n` : ''}`;
    })
    .join('\n');
  return `# Requirements backlog: ${project.name}\n\n${requirements.length} requirement${requirements.length === 1 ? '' : 's'}.\n\n${items}`;
}

export function impactToMarkdown(project: Project, a: ImpactAssessment): string {
  const list = (rows: ImpactAssessment['functional']) =>
    rows.length
      ? rows.map((r) => [
          `- **${r.area}** (${r.severity}): ${r.description}`,
          r.impactedPart && `  - Impacted part: ${r.impactedPart}`,
          r.currentState && `  - Current: ${r.currentState}`,
          r.proposedChange && `  - Change: ${r.proposedChange}`,
          r.rationale && `  - Why: ${r.rationale}`,
          r.propagation && `  - Knock-on: ${r.propagation}`,
        ].filter(Boolean).join('\n')).join('\n')
      : '_None identified._';
  return `# Impact assessment: ${project.name}

## Summary

${a.summary || '_No summary._'}

## Functional impact

${list(a.functional)}

## Technical impact

${list(a.technical)}

## Risks

${a.risks.length ? a.risks.map((r) => `- **${r.risk}** (${r.severity})${r.mitigation ? `, mitigation: ${r.mitigation}` : ''}`).join('\n') : '_None identified._'}

## Gaps

${a.gaps.length ? a.gaps.map((g) => `- **${g.gap}**${g.recommendation ? `, ${g.recommendation}` : ''}`).join('\n') : '_None identified._'}
`;
}

export const fileBase = (name: string, suffix: string) => `${slug(name)}-${suffix}`;


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

export function printDocument(renderedHtml: string, meta: PrintMeta): void {
  const rows = meta.audit.map((a) => `<tr><td>${esc(new Date(a.timestamp).toLocaleString())}</td><td>${esc(a.stageLabel)}</td><td>${esc(a.reviewerName)}</td><td>${esc(a.role)}</td><td>${esc(a.decision)}</td><td>${esc(a.comments)}</td></tr>`).join('');
  const auditHtml = meta.audit.length ? `<h2>Approval History</h2><div class="md-table"><table><thead><tr><th>Date</th><th>Stage</th><th>Reviewer</th><th>Role</th><th>Decision</th><th>Comments</th></tr></thead><tbody>${rows}</tbody></table></div>` : '';
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(meta.title)} v${meta.version}</title>
<style>
@page{margin:18mm 16mm}
body{margin:0}
${PREVIEW_CSS}
</style></head><body>
<div class="md-body">${renderedHtml}${auditHtml}</div></body></html>`;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);
  const w = iframe.contentWindow;
  if (!w) { iframe.remove(); return; }
  w.document.open();
  w.document.write(doc);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); setTimeout(() => iframe.remove(), 2000); }, 400);
}

