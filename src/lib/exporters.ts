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
    ? meeting.actionItems.map((a) => `- [${a.done ? 'x' : ' '}] ${a.task} — ${a.assignee || 'Unassigned'}${a.due ? `, due ${a.due}` : ''}`).join('\n')
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
  const list = (rows: Array<{ area: string; description: string; severity: string }>) =>
    rows.length ? rows.map((r) => `- **${r.area}** (${r.severity}): ${r.description}`).join('\n') : '_None identified._';
  return `# Impact assessment: ${project.name}

## Summary

${a.summary || '_No summary._'}

## Functional impact

${list(a.functional)}

## Technical impact

${list(a.technical)}

## Risks

${a.risks.length ? a.risks.map((r) => `- **${r.risk}** (${r.severity})${r.mitigation ? ` — mitigation: ${r.mitigation}` : ''}`).join('\n') : '_None identified._'}

## Gaps

${a.gaps.length ? a.gaps.map((g) => `- **${g.gap}**${g.recommendation ? ` — ${g.recommendation}` : ''}`).join('\n') : '_None identified._'}
`;
}

export const fileBase = (name: string, suffix: string) => `${slug(name)}-${suffix}`;
