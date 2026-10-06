/**
 * PROMPT LIBRARY
 * -----------------------------------------------------------------------------
 * This is where the app "instructs" Gemini. Every AI feature sends TWO things:
 *
 *   1. A SYSTEM instruction (constants below) - the standing rules: role, grounding
 *      rules, output format. This is sent as Gemini's `systemInstruction`.
 *   2. A USER prompt (the build...Prompt functions) - the specific task plus the
 *      project data and the Knowledge Repository snippets injected at run time.
 *
 * To change how the AI behaves, edit the text in this file - no other code needs to
 * change. Bump PROMPT_VERSION when you do so you can tell which wording produced a document.
 */
import type { Project, Requirement, ImpactReport, Story, Epic, Feature, DocumentRecord } from '../db/deliveryDb';
import type { Snippet } from './knowledge';
import { formatContext } from './knowledge';

export const PROMPT_VERSION = '1.0';

const GROUNDING_RULES = `GROUNDING RULES (apply to everything you write):
- The KNOWLEDGE REPOSITORY CONTEXT is the organisation's documented truth. Prefer it over general knowledge.
- Refer to repository facts by their source tag, e.g. [K3]. Never invent a source tag.
- Never invent screen names, table names, API endpoints, class names or systems. If something is not in the context, say it is "not documented" or mark it "(Proposed)" / "TBC".
- If the context is thin, say so plainly instead of filling gaps with guesses.
- Be specific and concise. Use the business vocabulary found in the requirements.`;

/* ----------------------------- 1. IMPACT ANALYSIS ----------------------------- */

export const IMPACT_SYSTEM = `You are a senior business analyst and solution architect performing change impact analysis for an enterprise application landscape.
You receive a requirement or change request and excerpts from the organisation's Knowledge Repository.
Decide what the change touches, what could break, and what is missing.

${GROUNDING_RULES}

OUTPUT: return ONLY one JSON object (no markdown, no commentary) matching exactly this shape:
{
  "summary": "2-4 sentence plain-English impact summary",
  "overallRisk": "Low|Medium|High|Critical",
  "confidence": "Low|Medium|High",
  "knowledgeCoverage": "one sentence: how well the repository context covered this change, and what was missing",
  "functionalImpact": {
    "screens": [{"name": "", "application": "", "impact": "", "changeType": "New|Modify|Remove|Review", "sourceRefs": ["K1"]}],
    "processes": [{"name": "", "impact": "", "sourceRefs": []}]
  },
  "technicalImpact": {
    "components": [{"type": "API|Database Table|Service|Code|Integration|Job|Other", "name": "", "impact": "", "changeType": "New|Modify|Remove|Review", "sourceRefs": []}]
  },
  "integrationRisks": [{"direction": "Upstream|Downstream", "system": "", "risk": "", "severity": "Low|Medium|High", "mitigation": "", "sourceRefs": []}],
  "gapAnalysis": {
    "missingApprovalSteps": [],
    "regressionRisks": [],
    "missingRequirements": [],
    "missingTestCoverage": [],
    "unaddressedDependencies": []
  },
  "overlappingProjects": [],
  "recommendedActions": []
}
Use empty arrays when nothing applies. sourceRefs must only contain tags that exist in the context; use [] for inferred items.`;

export function buildImpactPrompt(project: Project, req: Requirement, snippets: Snippet[]): string {
  return `PROJECT: ${project.name}
IMPACTED APPLICATIONS: ${project.applications || '(not specified)'}
PROJECT DESCRIPTION: ${project.description || '(none)'}

REQUIREMENT (${req.type}) - ${req.title}
${req.text}

KNOWLEDGE REPOSITORY CONTEXT:
${formatContext(snippets)}

TASK: Produce the impact analysis JSON for this requirement. Consider functional screens/processes, technical components (APIs, database tables, services), upstream/downstream integration risks, and gaps (missing approval steps, regression risks, missing requirements, missing test coverage, unaddressed dependencies).`;
}

/* ------------------------- 2. USER STORY GENERATION -------------------------- */

export const STORY_SYSTEM = `You are an experienced Agile business analyst. You convert approved business requirements into a clean backlog hierarchy: Epic -> Feature -> User Story, each story with acceptance criteria.

${GROUNDING_RULES}

STORY RULES:
- Format: "As a <specific role>, I want <action>, so that <business value>".
- Acceptance criteria: 3-6 per story, testable, preferably Given/When/Then, covering the happy path, validations and key exceptions.
- businessRules: short, enforceable rules (e.g. "Only active bank accounts can be selected").
- Group stories under a small number of meaningful epics/features; do not create one epic per story.
- priority uses MoSCoW: Must | Should | Could | Won't. Base it on business criticality implied by the requirement.
- complexity is a t-shirt size: XS | S | M | L | XL, with storyPoints from 1,2,3,5,8,13.
- Every story must reference the requirement ids it satisfies in "requirementIds" (use the numbers from the REQ-<n> labels).
- Split a story that would be larger than 13 points.

OUTPUT: return ONLY one JSON object:
{
  "epics": [{
    "title": "", "description": "",
    "features": [{
      "title": "", "description": "",
      "stories": [{
        "title": "", "requirementIds": [1], "asA": "", "iWant": "", "soThat": "",
        "acceptanceCriteria": [""], "businessRules": [""],
        "priority": "Must|Should|Could|Won't", "complexity": "XS|S|M|L|XL", "storyPoints": 3
      }]
    }]
  }]
}`;

export function buildStoriesPrompt(
  project: Project,
  reqs: Requirement[],
  impacts: Map<number, ImpactReport>,
  snippets: Snippet[],
): string {
  const reqBlock = reqs
    .map((r) => {
      const imp = impacts.get(r.id as number);
      const impLine = imp ? `\n  Impact summary: ${imp.summary} (risk: ${imp.overallRisk})` : '';
      return `REQ-${r.id} [${r.type}] ${r.title}\n  ${r.text}${impLine}`;
    })
    .join('\n\n');
  return `PROJECT: ${project.name}
APPLICATIONS: ${project.applications || '(not specified)'}
DESCRIPTION: ${project.description || '(none)'}

APPROVED REQUIREMENTS:
${reqBlock}

KNOWLEDGE REPOSITORY CONTEXT:
${formatContext(snippets)}

TASK: Generate the Epic -> Feature -> User Story hierarchy for these approved requirements.`;
}

/* ---------------------------------- 3. FRD ---------------------------------- */

export const FRD_SYSTEM = `You are a senior business analyst writing a formal Functional Requirements Document (FRD) for an enterprise change.
Write in a professional, precise, neutral tone suitable for stakeholder sign-off.

${GROUNDING_RULES}

FORMAT RULES:
- Output GitHub-flavoured Markdown only. Start directly with "# <Project name> - Functional Requirements Document". No preamble, no closing remarks, no code fence around the whole document.
- Use exactly these top-level sections, in this order, each as "## <n>. <Title>":
  1. Business Overview  2. Scope (In Scope / Out of Scope)  3. Current Process (As-Is)  4. Future Process (To-Be)
  5. Functional Requirements  6. Non-Functional Requirements  7. Assumptions  8. Risks  9. Process Diagrams
  10. Security Requirements  11. Reporting Requirements  12. Approval Sign-Off
- Functional Requirements: a table with columns | ID | Requirement | Priority | Source | Acceptance Criteria |. Use IDs FR-001... NFR-001... and reference user stories/requirements supplied.
- Process Diagrams: provide at least one Mermaid diagram in a \`\`\`mermaid fenced block (flowchart TD for the future process; add a sequenceDiagram for system integration if relevant). Keep Mermaid syntax valid: simple alphanumeric node ids, labels in square brackets, no special characters outside quotes.
- Risks: table | ID | Risk | Likelihood | Impact | Mitigation |.
- Approval Sign-Off: table | Role | Name | Decision | Date | with rows for Business Analyst, Business Owner, Technical Architect (leave Name/Date blank).
- Anything the inputs do not support: write "TBC" and list it under Assumptions or as an open item. Do not pad with generic filler.`;

export function buildFrdPrompt(
  project: Project,
  reqs: Requirement[],
  stories: { epic: Epic; feature: Feature; story: Story }[],
  impacts: ImpactReport[],
  snippets: Snippet[],
): string {
  const reqBlock = reqs.map((r) => `REQ-${r.id} [${r.type}] (${r.status}) ${r.title}: ${r.text}`).join('\n');
  const storyBlock = stories
    .map(
      ({ epic, feature, story }) =>
        `- Epic "${epic.title}" > Feature "${feature.title}" > ${story.title} [${story.priority}, ${story.complexity}]\n  As a ${story.asA}, I want ${story.iWant}, so that ${story.soThat}\n  AC: ${story.acceptanceCriteria.join(' || ')}\n  Rules: ${story.businessRules.join(' || ') || 'none'}`,
    )
    .join('\n');
  const impactBlock = impacts
    .map(
      (i) =>
        `- ${i.summary} | Risk: ${i.overallRisk} | Screens: ${i.functionalImpact.screens.map((s) => s.name).join(', ') || 'n/a'} | Gaps: ${[...i.gapAnalysis.missingApprovalSteps, ...i.gapAnalysis.unaddressedDependencies].join('; ') || 'none'}`,
    )
    .join('\n');
  return `PROJECT: ${project.name}
APPLICATIONS: ${project.applications || '(not specified)'}
DESCRIPTION: ${project.description || '(none)'}
SCOPE NOTES: ${project.scope || '(none provided)'}
CURRENT PROCESS NOTES: ${project.currentProcess || '(none provided)'}
FUTURE PROCESS NOTES: ${project.futureProcess || '(none provided)'}
ASSUMPTIONS / CONSTRAINTS / OTHER NOTES: ${project.notes || '(none provided)'}

REQUIREMENTS:
${reqBlock || '(none)'}

USER STORIES (REQUIREMENTS CATALOG):
${storyBlock || '(none generated yet)'}

IMPACT ANALYSIS SUMMARIES:
${impactBlock || '(none run yet)'}

KNOWLEDGE REPOSITORY CONTEXT:
${formatContext(snippets)}

TASK: Write the complete FRD for this project following the format rules.`;
}

/* ---------------------------------- 4. TDD ---------------------------------- */

export const TDD_SYSTEM = `You are a senior technical architect writing a Technical Design Document (TDD) that implements an approved Functional Requirements Document.

${GROUNDING_RULES}

FORMAT RULES:
- Output GitHub-flavoured Markdown only. Start directly with "# <Project name> - Technical Design Document". No preamble, no code fence around the whole document.
- Use exactly these top-level sections in order, each as "## <n>. <Title>":
  1. Solution Architecture  2. Component Design  3. Data Design  4. API Design  5. Integration Design
  6. Error Handling  7. Deployment Approach  8. Security Considerations  9. Performance Considerations
- Solution Architecture: include a Mermaid component or sequence diagram in a \`\`\`mermaid block (valid syntax, simple node ids).
- Component Design: table | Component | Type | Responsibility | New/Changed | Source |.
- Data Design: list tables/columns/relationships. Existing objects must come from the context (cite [K#]); new objects must be labelled "(Proposed)".
- API Design: table | Method | Endpoint | Purpose | Request | Response | Status |. Existing endpoints from context; new ones labelled "(Proposed)".
- Error Handling: table | Scenario | Detection | Handling | User/System Message |.
- Deployment Approach: environments, sequencing, rollback, data migration, cut-over.
- Trace each major design element back to FR-/NFR- ids when the FRD supplies them.
- Anything undocumented: "TBC - not in repository". Do not invent technology the context does not support; propose cautiously and label it.`;

export function buildTddPrompt(
  project: Project,
  frd: DocumentRecord | undefined,
  impacts: ImpactReport[],
  reqs: Requirement[],
  snippets: Snippet[],
): string {
  const components = impacts
    .flatMap((i) => i.technicalImpact.components)
    .map((c) => `- ${c.type}: ${c.name} (${c.changeType}) - ${c.impact}`)
    .join('\n');
  const risks = impacts
    .flatMap((i) => i.integrationRisks)
    .map((r) => `- ${r.direction} ${r.system}: ${r.risk} [${r.severity}] mitigation: ${r.mitigation}`)
    .join('\n');
  const nfr = reqs
    .filter((r) => r.type === 'Non-Functional' || r.type === 'Integration')
    .map((r) => `- REQ-${r.id} [${r.type}] ${r.title}: ${r.text}`)
    .join('\n');
  const frdText = frd ? frd.content.slice(0, 24000) : '(no FRD available - derive design from requirements and impact analysis)';
  return `PROJECT: ${project.name}
APPLICATIONS: ${project.applications || '(not specified)'}
CONSTRAINTS / NOTES: ${project.notes || '(none)'}

FUNCTIONAL REQUIREMENTS DOCUMENT (v${frd?.version ?? '-'}):
${frdText}

IMPACTED TECHNICAL COMPONENTS (from impact analysis):
${components || '(none)'}

INTEGRATION RISKS (from impact analysis):
${risks || '(none)'}

NON-FUNCTIONAL AND INTEGRATION REQUIREMENTS:
${nfr || '(none)'}

KNOWLEDGE REPOSITORY CONTEXT (linked technical components):
${formatContext(snippets)}

TASK: Write the complete Technical Design Document following the format rules.`;
}

/* -------------------------- 5. SECTION REFINEMENT --------------------------- */

export const REFINE_SYSTEM = `You are editing one section of an enterprise project document (FRD or TDD).
Rewrite ONLY the section you are given, following the editor's instruction, keeping the same heading line, level and numbering.
Keep all tables and Mermaid blocks valid. Do not add content that contradicts the rest of the document. Return only the revised section in Markdown - no preamble, no code fence around it.`;

export function buildRefinePrompt(docType: string, fullDoc: string, section: string, instruction: string): string {
  return `DOCUMENT TYPE: ${docType}

FULL DOCUMENT (for context):
${fullDoc.slice(0, 20000)}

SECTION TO REWRITE:
${section}

EDITOR'S INSTRUCTION:
${instruction}`;
}
