/** Projects, meetings and the requirement backlog. */
import { db, newId, nowIso } from './db';
import type { Meeting, Project, ProjectPriority, ProjectStatus, Requirement, RequirementCandidate, RequirementKind } from './types';

export const PROJECT_STATUSES: Array<{ id: ProjectStatus; label: string }> = [
  { id: 'draft', label: 'Draft' },
  { id: 'active', label: 'Active' },
  { id: 'on-hold', label: 'On hold' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

export const PRIORITIES: Array<{ id: ProjectPriority; label: string }> = [
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];

export const REQUIREMENT_KINDS: Array<{ id: RequirementKind; label: string }> = [
  { id: 'functional', label: 'Functional' },
  { id: 'non-functional', label: 'Non-functional' },
  { id: 'integration', label: 'Integration' },
  { id: 'reporting', label: 'Reporting' },
];

export const REQUIREMENT_STATUSES: Array<{ id: Requirement['status']; label: string }> = [
  { id: 'draft', label: 'Draft' },
  { id: 'in-review', label: 'In review' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

export const labelOf = <T extends { id: string; label: string }>(list: T[], id: string): string => list.find((x) => x.id === id)?.label ?? id;

const stamp = () => {
  const t = nowIso();
  return { id: newId(), createdAt: t, updatedAt: t };
};

// ------------------------------------------------------------------ projects

export interface ProjectInput {
  name: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  owner: string;
  sponsor: string;
  targetDate: string;
  applicationIds: string[];
  moduleIds: string[];
}

export const emptyProjectInput = (): ProjectInput => ({
  name: '',
  description: '',
  status: 'active',
  priority: 'medium',
  owner: '',
  sponsor: '',
  targetDate: '',
  applicationIds: [],
  moduleIds: [],
});

export async function createProject(input: ProjectInput): Promise<Project> {
  const project: Project = {
    ...stamp(),
    ...input,
    name: input.name.trim(),
    description: input.description.trim(),
    owner: input.owner.trim(),
    sponsor: input.sponsor.trim(),
    functionalityIds: [],
    notes: [],
  };
  await db.projects.add(project);
  return project;
}

export interface ProjectStats {
  meetings: number;
  requirements: number;
  suggestions: number;
}

export async function countProjectContents(id: string): Promise<ProjectStats> {
  const [meetings, requirements, suggestions] = await Promise.all([
    db.meetings.where('projectId').equals(id).count(),
    db.requirements.where('projectId').equals(id).count(),
    db.candidates.where('projectId').equals(id).count(),
  ]);
  return { meetings, requirements, suggestions };
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', [db.projects, db.meetings, db.candidates, db.requirements, db.artifacts], async () => {
    await db.meetings.where('projectId').equals(id).delete();
    await db.candidates.where('projectId').equals(id).delete();
    await db.requirements.where('projectId').equals(id).delete();
    await db.artifacts.where('projectId').equals(id).delete();
    await db.projects.delete(id);
  });
}

// ------------------------------------------------------------------ meetings

const today = () => new Date().toISOString().slice(0, 10);

export async function createMeeting(projectId: string, title: string): Promise<Meeting> {
  const meeting: Meeting = {
    ...stamp(),
    projectId,
    title: title.trim() || 'Untitled meeting',
    meetingDate: today(),
    attendees: [],
    source: 'paste',
    fileName: '',
    transcript: '',
    status: 'draft',
    error: '',
    summary: '',
    keyPoints: [],
    decisions: [],
    actionItems: [],
    openQuestions: [],
    model: '',
    processedAt: '',
  };
  await db.meetings.add(meeting);
  return meeting;
}

export async function deleteMeeting(id: string): Promise<void> {
  await db.transaction('rw', [db.meetings, db.candidates], async () => {
    await db.candidates.where('meetingId').equals(id).delete();
    await db.meetings.delete(id);
  });
}

// ------------------------------------------------------------------ backlog

export async function addRequirement(projectId: string, fields: { title: string; description?: string; kind?: RequirementKind }): Promise<Requirement> {
  const requirement: Requirement = {
    ...stamp(),
    projectId,
    kind: fields.kind ?? 'functional',
    title: fields.title.trim(),
    description: (fields.description ?? '').trim(),
    acceptanceCriteria: [],
    status: 'draft',
    functionalityIds: [],
    priority: 'medium',
  };
  await db.requirements.add(requirement);
  return requirement;
}

export async function deleteRequirement(id: string): Promise<void> {
  await db.transaction('rw', [db.requirements, db.candidates], async () => {
    await db.candidates
      .filter((c) => c.requirementId === id)
      .modify((c) => {
        c.decision = 'accepted';
        c.requirementId = '';
      });
    await db.requirements.delete(id);
  });
}

/** Moves accepted suggestions into the project backlog as draft requirements. Returns how many were committed. */
export async function commitAcceptedCandidates(projectId: string, candidateIds?: string[]): Promise<number> {
  return db.transaction('rw', [db.candidates, db.requirements], async () => {
    const accepted = await db.candidates
      .where('projectId')
      .equals(projectId)
      .filter((c) => c.decision === 'accepted' && c.title.trim() !== '' && (!candidateIds || candidateIds.includes(c.id)))
      .toArray();
    for (const c of accepted) {
      const requirement: Requirement = {
        ...stamp(),
        projectId,
        kind: c.kind,
        title: c.title.trim(),
        description: c.description.trim(),
        acceptanceCriteria: c.acceptanceCriteria.filter((x) => x.trim()),
        status: 'draft',
        functionalityIds: c.functionalityIds,
        source: c.meetingId,
        priority: c.priority,
      };
      await db.requirements.add(requirement);
      await db.candidates.update(c.id, { decision: 'committed', requirementId: requirement.id, updatedAt: nowIso() });
    }
    return accepted.length;
  });
}

export async function addCandidates(
  projectId: string,
  meetingId: string,
  items: Array<Pick<RequirementCandidate, 'kind' | 'title' | 'description' | 'acceptanceCriteria' | 'priority' | 'sourceQuote' | 'functionalityIds'>>,
): Promise<void> {
  const rows: RequirementCandidate[] = items.map((i) => ({ ...stamp(), projectId, meetingId, ...i, decision: 'pending' as const, requirementId: '' }));
  await db.candidates.bulkAdd(rows);
}

/** Clears suggestions that have not been accepted so a re-run does not pile up duplicates. */
export async function clearUnreviewedCandidates(meetingId: string): Promise<void> {
  await db.candidates
    .where('meetingId')
    .equals(meetingId)
    .filter((c) => c.decision === 'pending' || c.decision === 'rejected')
    .delete();
}
