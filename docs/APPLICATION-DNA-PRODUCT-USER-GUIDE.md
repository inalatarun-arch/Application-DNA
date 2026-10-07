# Application DNA — Product & User Guide

## 1. Executive summary

Application DNA, also called the Enterprise Intelligence Hub (EIH) in the application UI and repository, is a browser-based enterprise application knowledge and delivery management platform.

Its core purpose is to capture enterprise application knowledge once, structure it, connect it, and reuse it throughout the change-delivery lifecycle.

The product brings together:

- Applications
- Modules
- Screens
- Screenshots and screen media
- Business functionalities
- Technical components
- Projects
- Meeting transcripts and notes
- Requirements and requirement suggestions
- Impact assessments
- Future-state process flows
- User stories
- FRDs and TDDs
- Test cases
- Defects
- Requirements traceability
- Approval records
- A visual knowledge graph
- A repository-grounded AI Copilot

The product is designed around a simple principle:

> Capture once → structure → connect → validate → reuse → maintain.

AI is an accelerator. The repository is the knowledge base. Human users remain responsible for validating requirements, approving designs, and deciding what is true.

---

## 2. What problem does Application DNA solve?

Enterprise application knowledge is normally fragmented across Word documents, spreadsheets, screenshots, process diagrams, technical documents, meeting notes, test tools, defect trackers and individual SME knowledge.

That creates recurring problems:

- The same information is documented repeatedly.
- Documentation becomes stale.
- Business and technical information are disconnected.
- Impact analysis is recreated for every change.
- New team members need repeated SME interviews.
- Requirements are difficult to trace into design and testing.
- FRDs and TDDs are recreated manually.
- Test coverage is difficult to assess.
- AI has little reliable organizational context to work from.

Application DNA addresses this by creating a connected knowledge model.

At the application level, the central relationship is:

Application → Module → Screen → Functionality → Technical Component

At the delivery level, the central relationship is:

Project → Requirements → Stories → Design Documents → Test Cases → Defects

The Knowledge Graph connects these concepts visually, while AI uses the repository as context.

---

## 3. Product architecture

Application DNA currently runs fully in the browser.

The reviewed repository uses:

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Dexie / IndexedDB
- HashRouter
- D3-based graph visualization
- Google Gemini API

### Local storage

The main browser database is named eih and uses IndexedDB through Dexie.

The current schema version reviewed in the repository is 5.

The repository stores application, project, delivery, test and defect data locally in the browser.

### AI architecture

Gemini requests are centralized through the shared Gemini service.

AI capabilities can use:

- A default Gemini model.
- Per-feature model overrides.
- Optional fallback models.
- Connection testing.
- Live model discovery for the configured key.
- Retry behavior for transient failures.
- Structured JSON generation.
- Model identification in successful responses.

### Important architectural implication

This is currently a browser-local product, not a centralized multi-user SaaS application.

Users should therefore use database backup/export as part of normal operating discipline.

---

# 4. Who should use it?

## Business Analysts

Primary use cases:

- Application documentation.
- Screen and functionality capture.
- Screenshot analysis.
- Meeting processing.
- Requirement extraction.
- Impact analysis.
- Future-state process design.
- Story creation.
- FRD/TDD generation.
- Test generation.
- Traceability.
- Copilot-based discovery.

## Product Owners and Business Owners

Useful for:

- Requirement review.
- Scope validation.
- Impact review.
- Process review.
- FRD/TDD review.
- Approval.

## Application Owners

Useful for:

- Application inventory.
- Criticality.
- Ownership.
- Functional dependency analysis.
- Change impact analysis.

## Solution and Technical Architects

Useful for:

- Technical component documentation.
- APIs.
- Tables.
- Procedures.
- Jobs.
- Queues.
- Middleware.
- Infrastructure.
- Dependencies.
- TDD review.

## QA and Test Leads

Useful for:

- Test generation.
- Test execution tracking.
- Requirement traceability.
- Defect linkage.
- Coverage analysis.

## Delivery Managers

Useful for:

- Project readiness.
- Requirements.
- Risks and dependencies.
- Deliverables.
- Approval status.
- Overall delivery visibility.

---

# 5. Navigation

The current application navigation contains:

1. Dashboard
2. Applications
3. Knowledge Graph
4. Projects & Delivery
5. FRD/TDD Studio
6. Testing & RTM
7. Copilot
8. Settings

These modules are intended to form one lifecycle rather than separate utilities.

Recommended lifecycle:

Application knowledge
→ Project
→ Discovery
→ Requirements
→ Impact
→ Future-state process
→ Stories
→ FRD/TDD
→ Testing
→ Traceability
→ Ongoing Copilot and knowledge reuse

---

# 6. Dashboard

The Dashboard provides a workspace overview.

It currently shows counts for:

- Applications
- Functionalities
- Technical components
- Projects
- Requirements
- Test cases
- Open/in-progress defects

It also provides a getting-started checklist.

The initial checklist is:

1. Add a Gemini API key.
2. Test the connection.
3. Document the first application.
4. Create a project and link impacted applications.

Use the Dashboard as the operational starting point rather than as a detailed management-reporting dashboard.

---

# 7. Applications

Applications are the foundation of Application DNA.

An Application record captures:

- Name
- Vendor/platform
- Business domain
- Technical stack
- Criticality tier
- Description
- Business owner
- Technical owner
- Tags

Applications can be searched and filtered by name, platform, domain, criticality and other descriptive information.

## 7.1 Modules

A module is a meaningful functional grouping inside an application.

Examples:

- Supplier Management
- Accounts Payable
- Procurement
- User Administration

Avoid creating a module for every small menu item. Use modules to represent meaningful business or functional areas.

## 7.2 Screens

A screen represents an important user-facing or process-facing interface.

The data model can capture:

- Purpose
- Description
- Business process
- Business owner
- Functional owner
- Navigation path
- Field descriptions
- UI elements
- Validation rules
- Workflow steps
- Approval logic
- Exception handling
- Upstream systems
- Downstream systems
- Related screens

## 7.3 Functionalities

A functionality describes what the application does from a business/process perspective.

It can capture:

- Description
- Business purpose
- Process flow
- User roles
- Triggers
- Inputs
- Outputs
- Validation exceptions
- Error exceptions
- Business exceptions
- System exceptions
- Related functionalities
- Upstream systems
- Downstream systems

A strong functionality description answers:

> Who does what, when, using which inputs, producing which outputs, subject to which rules?

## 7.4 Technical components

Technical components describe implementation-level knowledge.

Supported types include:

- Class
- Package
- Method
- Service
- API
- Table
- View
- Procedure
- Trigger
- REST
- SOAP
- Middleware
- Queue
- Server
- Cloud
- Job

Technical component records can include:

- Definition
- Metadata
- Dependencies
- Functionality links
- Screen links
- Database columns

Database columns can capture:

- Name
- Data type
- Nullable
- PK/FK status
- Reference
- Description

This allows Application DNA to connect functional knowledge to technical implementation.

---

# 8. How to document an application

A recommended sequence is:

### Step 1 — Create the application

Enter the name, vendor/platform, domain, criticality, owners, technical stack and description.

### Step 2 — Add modules

Create logical business areas.

### Step 3 — Add screens

Capture purpose, navigation, fields, actions, validations, workflow, approvals and exceptions.

### Step 4 — Add functionalities

Describe the business capability supported by each important screen or process.

### Step 5 — Add technical components

Capture APIs, tables, services, procedures, jobs, queues, middleware and other known implementation objects.

### Step 6 — Connect the entities

Create the relationships that explain how the application works.

The relationships are more valuable than isolated records.

---

# 9. AI Application Capture

AI Application Capture is one of the most important capabilities for accelerating application archaeology.

A user can provide:

- Plain unstructured English.
- Screenshots.
- Documents.
- Other supported files.

Gemini converts the evidence into a structured application edit plan.

It can identify or update:

- Application information.
- Modules.
- Screens.
- Fields.
- UI controls.
- Business processes.
- Functionalities.
- Business purpose.
- Roles.
- Triggers.
- Inputs.
- Outputs.
- Validations.
- Workflow steps.
- Approval logic.
- Exceptions.
- Upstream systems.
- Downstream systems.
- Technical components.
- Component dependencies.
- Technical metadata.
- Database columns.

## Example

A BA could write:

"Procurement users open Supplier Maintenance from Payables. They can create a supplier, validate Tax ID, save the record, and submit it for approval. Duplicate Tax IDs must be blocked. The screen calls the supplier API and writes to the supplier master table."

The AI can translate that into structured application knowledge.

The extraction service is explicitly designed to compare the supplied evidence with the current application records. Where a clear existing record is identified, it can propose an update rather than blindly creating a duplicate.

## Screenshot use

Screenshots are particularly useful for recovering undocumented UI information.

The extraction model is instructed to identify visible:

- Fields
- Inputs
- Buttons
- Links
- Tables

It can also use the screenshot as evidence for screen and functionality documentation.

### Best practice

Use both a screenshot and a short plain-English explanation.

The screenshot provides visual evidence. The description provides business meaning.

---

# 10. Human review of AI output

AI extraction is not intended to replace BA validation.

The recommended workflow is:

Evidence
→ AI extraction
→ Review
→ Correct
→ Save
→ Reuse

Do not treat generated content as approved business truth until a person has reviewed it.

This is particularly important for:

- Business rules.
- Approval logic.
- Security.
- Technical architecture.
- Integration behavior.
- Regulatory requirements.
- High-risk impact conclusions.

---

# 11. Knowledge Graph

The Knowledge Graph visually represents relationships in the repository.

It can show entities such as:

- Applications
- Modules
- Screens
- Functionalities
- Technical components
- Requirements

The graph supports:

- All / Functional / Technical presets.
- Application filtering.
- Node-type filtering.
- Hierarchy links.
- Search.
- Node selection.
- Neighbor highlighting.
- Zoom.
- Re-layout.
- Automatic spacing.
- Manual spacing.
- PNG export.

## Why it matters

A document may say:

"Supplier onboarding uses Salesforce, MuleSoft and Oracle EBS."

The graph can make the relationship navigable:

Salesforce screen
→ onboarding functionality
→ middleware
→ Oracle API
→ procedure
→ supplier table

This is valuable for impact analysis, architecture discovery, onboarding and dependency analysis.

---

# 12. Projects & Delivery

Applications describe the existing enterprise landscape.

Projects describe change to that landscape.

A project can contain:

- Name
- Description
- Status
- Priority
- Owner
- Sponsor
- Target date
- Linked applications
- Linked modules
- Linked functionalities
- Notes

The Project Workspace contains:

1. Overview
2. Meeting Notes
3. Extracted Requirements
4. Impact Analysis
5. Future-State Flow
6. Deliverables

This is the main change-delivery workflow.

---

# 13. Project setup

Create a project and establish context before using AI.

A useful project should link the affected:

- Applications.
- Modules.
- Functionalities.

For example, instead of a vague project called "Supplier enhancement", use a name such as:

"Supplier onboarding tax-validation enhancement — Salesforce to Oracle EBS"

Then link the supplier onboarding functionality and the relevant technical/application records.

The more accurately the project is connected to the repository, the more useful the downstream AI capabilities become.

---

# 14. Meeting Notes and discovery

Projects can capture meetings and workshops.

A meeting can contain:

- Title
- Date
- Attendees
- Transcript
- Summary
- Key points
- Decisions
- Action items
- Open questions
- Processing status
- AI model used

The source can be pasted or uploaded.

## Recommended workflow

1. Create the project.
2. Create a meeting.
3. Paste or upload the transcript.
4. Process it with Gemini.
5. Review the summary.
6. Review decisions.
7. Review action items.
8. Review open questions.
9. Review requirement suggestions.

This turns unstructured workshop evidence into structured project information.

---

# 15. AI requirement extraction

Gemini can extract candidate:

- Functional requirements.
- Non-functional requirements.
- Integration requirements.
- Reporting requirements.
- Business rules.
- Epics.
- Features.
- User stories.

A requirement can contain:

- Title
- Description
- Acceptance criteria
- Priority
- Parent relationship
- Functionality mapping
- Source

AI-generated requirements are intended to be reviewed rather than silently treated as approved scope.

Recommended flow:

Transcript
→ AI suggestions
→ BA review
→ Accept/reject
→ Commit to backlog
→ Refine
→ Approve

---

# 16. Requirements

Requirements are the bridge between business discovery and delivery.

Supported kinds include:

- Functional
- Non-functional
- Reporting
- Integration
- Epic
- Feature
- User story
- Business rule

A requirement can contain:

- Title
- Description
- Acceptance criteria
- Status
- Parent
- Linked functionalities
- Source
- Priority

Approval states include:

- Draft
- In review
- Approved
- Rejected

## Requirement quality standard

A strong requirement should be:

- Specific.
- Testable.
- Traceable.
- Grounded in evidence.
- Mapped to the affected functionality where possible.
- Supported by acceptance criteria.

---

# 17. Impact Analysis

Impact analysis is designed to answer:

> What might this change affect?

The current impact model covers:

### Functional impact

- Screens
- Processes

### Technical impact

- Technical components

### Integration risks

- Upstream systems
- Downstream systems
- Risk
- Severity
- Mitigation

### Gap analysis

- Missing approval steps.
- Regression risks.
- Missing requirements.
- Missing test coverage.
- Unaddressed dependencies.

It can also report:

- Overall risk.
- Confidence.
- Knowledge coverage.
- Overlapping projects.
- Recommended actions.

## Important principle

Impact analysis is only as reliable as the documented knowledge.

If an integration or technical component is absent from the repository, the AI cannot reliably discover it.

Knowledge coverage should therefore be treated as part of the impact-analysis result.

---

# 18. Future-State Process Flow

The Project Flow tab uses Gemini to propose a future-state process.

The AI receives:

- Project information.
- Requirements.
- Existing documented flows.
- Applications.
- Modules.
- Screens.
- Functionalities.

It generates Mermaid flowchart content.

The result can contain:

- Future-state steps.
- System handoffs.
- Changed/new steps.
- Assumptions.
- Change summary.

The generated flow is stored as a project artifact and rendered in the UI.

## Freshness

The product can detect when application or requirement data changed after a flow was generated.

When that happens, the UI warns that the flow should be regenerated before it is used for analysis or design.

This is important because generated artifacts can become stale.

---

# 19. Deliverables and readiness

The Deliverables area provides a readiness checklist before formal FRD generation.

The current checks include:

- At least one meeting processed.
- Requirements exist.
- Requirement suggestions have been reviewed.
- Requirements are mapped to functionalities.
- Requirements are approved.
- Impact assessment has been generated.

This encourages:

Evidence
→ Requirements
→ Review
→ Mapping
→ Approval
→ Impact
→ Deliverables

rather than immediately writing a document after the first workshop.

---

# 20. Project exports

Current project-level exports include:

- Requirements backlog CSV.
- Requirements backlog Markdown.
- Impact assessment Markdown.
- Meeting minutes Markdown.

These provide lightweight ways to move project information into other tools or organizational documents.

---

# 21. FRD/TDD Studio

FRD/TDD Studio is the document-generation and editing workspace.

It currently supports:

- Project selection.
- FRD/TDD selection.
- Story generation.
- AI document generation.
- Markdown editing.
- Version saving.
- Approval submission.
- Business Owner approval/rejection.
- Version history.
- Markdown download.
- RTM export.

## FRD template

The default FRD headings are:

1. Business Overview
2. Scope
3. Current Process
4. Future Process
5. Functional Requirements
6. Non-Functional Requirements
7. Assumptions
8. Risks
9. Process Diagrams
10. Security
11. Reporting
12. Approval Sign-off

## TDD template

The default TDD headings cover:

1. Architecture
2. Components
3. Data Design
4. APIs
5. Integrations
6. Error Handling
7. Deployment
8. Security
9. Performance

The organization template is stored in the database as Markdown headings.

---

# 22. How document generation works

Studio does not simply ask Gemini to write a generic FRD or TDD.

The generation prompt includes project context such as:

- Project name.
- Project description.
- Requirements.
- Acceptance criteria.
- Generated stories.
- Linked applications.
- Current/future process information.
- Organization template headings.

The generation rules instruct Gemini to:

- Use supplied facts.
- Write "not documented" where evidence is absent.
- Avoid inventing existing applications, APIs or components.
- Mark proposed design as "(Proposed)".
- Preserve the template headings.
- Include trace identifiers where appropriate.

This is an important product principle:

> The desired behavior is grounded generation, not imaginative architecture generation.

---

# 23. User stories

Studio can generate delivery stories from project requirements.

A story contains:

- Title.
- As-a statement.
- I-want statement.
- So-that statement.
- Acceptance criteria.
- Business rules.
- Priority.
- Status.
- Requirement links.

This allows the organization to distinguish between:

"What the business requires"

and:

"How the delivery team expresses the work."

Generated stories should still be reviewed before implementation.

---

# 24. Document versioning

Delivery documents have a version history.

When a document is regenerated or saved, earlier content can be preserved as a document version.

This provides a historical trail for the document lifecycle.

### Current implementation boundary

The reviewed Studio implementation provides version history, but it is not yet a full visual Word-style diff and restore experience.

Therefore the current capability should be described as version history, not as full document comparison.

---

# 25. Approval model

The delivery data model defines the following approval matrix:

1. Business Analyst
2. Business Owner
3. Application Owner
4. Technical Architect
5. Project Sponsor

Approval records capture:

- Document.
- Version.
- Role.
- Approver name.
- Decision.
- Comment.
- Timestamp.

### Current UI boundary

The reviewed Studio UI currently provides document submission and Business Owner approval/rejection controls.

The full five-stage sequential approval process is represented in the data model but is not yet enforced end-to-end by the current Studio interface.

Do not describe the current product as having a fully automated five-stage approval workflow.

---

# 26. Requirements Traceability Matrix

The RTM connects delivery artifacts.

The intended chain is:

Requirement
→ User Story
→ Design Component
→ Document
→ Test Case
→ Defect

The Testing area provides an RTM view that relates:

- Requirements.
- User stories.
- Technical components.
- Test cases.
- Defects.

It provides filters including:

- All.
- Unmapped.
- Failing tests.

The Studio also provides RTM export.

## Why this matters

A requirement should not disappear once the FRD is written.

It should remain traceable into design and quality activities.

---

# 27. Testing & Quality

The Testing & Quality module contains:

1. Test Cases.
2. RTM.
3. Defects.

## AI Test Case Generator

A user selects a requirement and a test level:

- Unit
- SIT
- Regression
- UAT

The AI uses:

- Requirement title.
- Requirement description.
- User story.
- Acceptance criteria.

The generated test contains:

- Scenario.
- Steps.
- Expected result.
- Priority.
- Status.

The AI is instructed not to invent business rules.

New tests begin in a not-run state.

## Test execution

Test status can be updated to:

- Not Run.
- Pass.
- Failed.
- Blocked.

Actual results can be captured.

---

# 28. Defect management

Defects can contain:

- Title.
- Description.
- Severity.
- Priority.
- Status.
- Assignee.
- Requirement.
- Test case.
- Technical components.
- Screenshots.

Statuses include:

- Open.
- In progress.
- Resolved.
- Closed.

This allows defects to be connected back to requirements, tests and technical components.

---

# 29. Copilot

Copilot is the natural-language interface to the repository.

It can be opened from:

- The Copilot page.
- The global assistant.
- Ctrl/Cmd + K.

## Current retrieval model

The current Copilot implementation:

1. Reads locally stored repository entities.
2. Scores records based on words in the user's question.
3. Selects the most relevant records.
4. Sends that context to Gemini.
5. Instructs Gemini to answer using the repository context.
6. Instructs Gemini to say that something is "not documented" when the repository does not support it.

## Useful questions

Examples:

- Which functionalities touch the AP_SUPPLIERS table?
- Show integrations connected to Supplier Creation.
- Which screens use a particular functionality?
- Which technical components are related to a requirement?
- What requirements are associated with a project?
- What tests cover a requirement?

## Current limitation

The current Copilot is repository-grounded but uses relatively simple text matching for retrieval.

It is not yet a full enterprise RAG platform with advanced BM25/TF-IDF ranking, graph-neighbor retrieval, rich citations, long-term conversational memory or sophisticated token-budget management.

---

# 30. Settings

Settings currently provides:

- AI Configuration.
- Workspace.
- Sample enterprise data.
- Data Management.

## AI Configuration

Users can:

- Save a Gemini API key.
- Reveal/hide it.
- Remove it.
- Test the API connection.
- Load models available to the key.
- Select a default model.
- Configure fallback models.
- Configure models per AI feature.

Feature-specific routing is available for areas such as:

- Transcript processing.
- Impact assessment.
- FRD generation.
- TDD generation.
- Test generation.
- Defect analysis.
- Copilot.
- Application ingestion.
- Screen extraction.
- Requirement import.
- Project process flow.
- Knowledge graph flow.

## Fallback models

A comma-separated list of fallback model IDs can be configured.

When the primary model returns a supported model-not-found or server-side failure, the service can attempt fallback models.

The successful model can be reported to the user.

---

# 31. API key and privacy model

The current README states that the Gemini API key is stored in browser localStorage and not in IndexedDB.

Gemini requests go directly to Google's API.

Users should therefore:

- Use an appropriately restricted key.
- Avoid putting unrelated production secrets into the repository.
- Avoid sharing backups containing the API key.
- Understand that browser-local storage is not the same as an enterprise secret vault.

## Backup behavior

The database export excludes the Gemini key by default.

There is an explicit option to include it.

If a key is included, anyone obtaining that backup could potentially use the key.

---

# 32. Sample enterprise data

Sample data is opt-in.

The current sample landscape is a realistic procure-to-pay scenario containing examples such as:

- Oracle E-Business Suite.
- Salesforce.
- SAP.
- A custom procurement portal.
- Supplier maintenance.
- Supplier APIs.
- PL/SQL packages and procedures.
- Tables and views.
- Middleware.
- Queue.
- Jobs.
- Infrastructure.

The sample data is useful for learning:

- Application documentation.
- Knowledge graph behavior.
- Impact analysis.
- Copilot.
- Technical relationship modeling.
- Requirement and testing flows.

Use it for exploration, not as organizational truth.

---

# 33. Backup and restore

Application DNA provides database export/import.

Export creates a JSON backup of local data.

Restore replaces local data with the contents of the backup.

## Recommended practice

Back up before:

- Clearing browser data.
- Moving to another browser profile.
- Major application changes.
- Large imports.
- Deleting important applications or projects.

## Restore warning

Restore is a replacement operation.

The current UI warns that current local data will be overwritten.

Always create a fresh backup before restoring an older file.

---

# 34. Recommended BA operating model

## Phase 1 — Establish application knowledge

1. Create the application.
2. Capture ownership and criticality.
3. Add modules.
4. Add screens.
5. Add functionalities.
6. Add technical components where known.
7. Add screenshots and evidence.
8. Use AI capture to accelerate population.
9. Review and correct AI output.

## Phase 2 — Create the project

1. Create project.
2. Set owner and sponsor.
3. Set priority and status.
4. Link applications.
5. Link modules/functionality.
6. Record assumptions, risks and dependencies.

## Phase 3 — Discovery

1. Create meeting.
2. Paste/upload transcript.
3. Process with Gemini.
4. Review summary.
5. Review decisions and actions.
6. Review requirement suggestions.

## Phase 4 — Requirement baseline

1. Accept/reject suggestions.
2. Refine titles.
3. Add descriptions.
4. Add acceptance criteria.
5. Set priorities.
6. Link functionality.
7. Approve requirements.

## Phase 5 — Impact

Generate impact analysis and review:

- Screens.
- Processes.
- Technical components.
- Integrations.
- Risks.
- Gaps.
- Regression concerns.
- Recommendations.

## Phase 6 — Future state

Generate the future-state flow.

Review system handoffs, changed steps, assumptions and business sequence.

Regenerate when important requirements or application knowledge changes.

## Phase 7 — Stories

Generate stories and review:

- As a.
- I want.
- So that.
- Acceptance criteria.
- Business rules.
- Priority.

## Phase 8 — FRD/TDD

1. Select project.
2. Select FRD or TDD.
3. Generate stories if necessary.
4. Generate document.
5. Review every section.
6. Edit.
7. Save a version.
8. Submit for approval.
9. Record approval.
10. Download Markdown.

## Phase 9 — Testing

1. Select approved requirements.
2. Generate test cases.
3. Review edge cases.
4. Execute tests.
5. Record actual results.
6. Create/link defects.

## Phase 10 — Traceability

Regularly review:

- Requirements without stories.
- Requirements without design links.
- Requirements without tests.
- Failing tests.
- Defects linked to requirements.

---

# 35. How to get better AI results

AI quality depends on repository quality.

### Weak input

"We need supplier changes."

### Better input

"Procurement users create suppliers in Salesforce. The request is sent through MuleSoft to Oracle EBS. Oracle validates Tax ID and writes the supplier master record. The enhancement should prevent duplicate Tax IDs before submission and display the Oracle validation message to the requester."

The second example gives the AI:

- Actor.
- Application.
- Integration.
- Validation.
- Target system.
- Data object.
- Desired change.

### Best practice

Use AI for:

- Structuring.
- Summarization.
- Drafting.
- Relationship discovery.
- Candidate gap identification.
- Test generation.
- Document generation.

Use humans for:

- Business truth.
- Scope.
- Architecture decisions.
- Security decisions.
- Final requirements.
- Approval.
- Regulatory interpretation.

---

# 36. The meaning of "not documented"

The product intentionally encourages AI to say "not documented" when evidence is absent.

This is a quality feature.

For example:

"Authentication mechanism: not documented"

is safer and more useful than:

"Authentication mechanism: OAuth 2.0"

when OAuth 2.0 is not actually documented.

This principle should be preserved in all downstream documents.

---

# 37. Information quality rules

## Rule 1 — One canonical application record

Do not create duplicates for the same system merely because multiple teams use it.

## Rule 2 — Use consistent names

Choose canonical business and technical names.

## Rule 3 — Link important entities

Prefer:

Screen → Functionality → Technical Component

and:

Requirement → Functionality

and:

Requirement → Test

## Rule 4 — Preserve evidence

Meeting transcripts and source material provide context for why requirements exist.

## Rule 5 — Review AI output

AI accelerates documentation; it does not replace governance.

## Rule 6 — Separate fact from proposal

Existing APIs and components are facts if documented.

A newly suggested API is a proposed design.

Do not mix them.

## Rule 7 — Regenerate stale artifacts

When requirements or application knowledge change, review and regenerate downstream AI artifacts where necessary.

---

# 38. Example: legacy application change impact

Suppose supplier validation must change.

### Traditional approach

A BA might:

1. Search old FRDs.
2. Find screenshots.
3. Interview an SME.
4. Search technical documents.
5. Ask the integration team.
6. Find database dependencies.
7. Build an impact spreadsheet.
8. Write a new requirements document.
9. Build tests separately.

### Application DNA approach

A BA can:

1. Open the supplier functionality.
2. Follow screen relationships.
3. Explore technical components.
4. Use the Knowledge Graph.
5. Create/link a project.
6. Add the requirement.
7. Generate impact analysis.
8. Generate future-state flow.
9. Generate stories.
10. Generate FRD/TDD.
11. Generate tests.
12. Review RTM.

The value does not come from AI magically knowing the application.

The value comes from maintaining a reusable, connected knowledge base that both people and AI can consume.

---

# 39. Example: onboarding a new BA

A new BA can start with:

- Application overview.
- Module catalogue.
- Screen catalogue.
- Functionality descriptions.
- Technical relationships.
- Knowledge Graph.
- Project requirements.
- Impact analysis.
- Existing FRD/TDD.
- Copilot.

Instead of reconstructing the application from scratch through interviews, the BA starts with the organization's documented baseline.

---

# 40. Example: modernization

Application DNA can establish a baseline before modernization.

Capture:

- Applications.
- Modules.
- Screens.
- Business functionalities.
- APIs.
- Tables.
- Procedures.
- Jobs.
- Queues.
- Middleware.
- Dependencies.

Then analyze:

- Critical functionality.
- Legacy components.
- Integration dependencies.
- Regression scope.
- Missing knowledge.
- Candidate modernization areas.

This can turn modernization discovery into a structured knowledge exercise.

---

# 41. Example: regression planning

If a technical component changes, the repository can help identify connected:

Technical component
→ Functionality
→ Screen
→ Requirement
→ Test

This gives QA a more focused starting point for regression planning.

The current RTM and knowledge relationships are particularly useful for this purpose.

---

# 42. What Application DNA is not

Based on the reviewed implementation, it should not be positioned as:

### Not a replacement for Jira

It has requirements, tests and defects, but it does not provide the complete enterprise issue-management capabilities of Jira.

### Not a full CMDB

It can document applications and technical components but is not a full infrastructure configuration-management platform.

### Not a source-code repository

Technical definitions can be stored, but Git remains the appropriate source-code system.

### Not a fully collaborative SaaS product

The current architecture is browser-local with backup/restore.

### Not an autonomous architecture authority

Generated TDD/architecture content must be reviewed by qualified technical owners.

### Not an automatic truth engine

AI output depends on source evidence and repository quality.

---

# 43. Current implementation boundaries

The following points should be communicated honestly to stakeholders.

## Browser-local data

The reviewed product stores its primary data locally in IndexedDB.

There is no central multi-user backend in the current implementation.

## Approval

The data model defines a five-role approval matrix, but the current Studio UI does not yet enforce the complete five-stage sequential approval journey.

## Version comparison

Version history exists, but a sophisticated visual document diff/restore workflow is not yet implemented.

## Copilot retrieval

The current Copilot uses simple repository text matching before sending context to Gemini. Advanced hybrid semantic/graph retrieval is not yet implemented.

## External synchronization

The current browser product does not automatically synchronize with Jira, Confluence, SharePoint, Teams, source-control systems or other enterprise systems.

## Security

The Gemini API key is stored in browser localStorage. This should not be described as enterprise-grade secret-vault storage.

## Document formats

The current Studio primarily works with Markdown and provides Markdown downloads. A native DOCX generation workflow is not part of the reviewed Studio implementation.

---

# 44. Governance model

A serious organizational implementation should define ownership.

### Application Owner

Owns:

- Application metadata.
- Criticality.
- Business ownership.
- Application truth.

### Business Analyst

Owns:

- Functional knowledge.
- Requirements.
- Process documentation.
- Screen/functionality relationships.
- Requirement quality.

### Technical Architect / Technical Owner

Owns:

- Technical components.
- APIs.
- Integrations.
- Data relationships.
- Architecture truth.

### QA Lead

Owns:

- Test coverage.
- Test execution.
- Defect relationships.

### Delivery Manager

Owns:

- Project lifecycle.
- Readiness.
- Deliverable governance.

---

# 45. Knowledge maturity model

An organization can measure its Application DNA maturity as follows.

## Level 0 — Empty

Only application names exist.

## Level 1 — Inventory

Applications have ownership, domain, stack and criticality.

## Level 2 — Functional knowledge

Modules, screens and functionalities are documented.

## Level 3 — Connected knowledge

Technical components, integrations, dependencies and requirements are linked.

## Level 4 — Delivery intelligence

Projects, requirements, impact, flows, stories, FRDs/TDDs and tests are connected.

## Level 5 — Institutional intelligence

The repository is continuously maintained and used for:

- Onboarding.
- Impact analysis.
- Change planning.
- Regression planning.
- Architecture analysis.
- AI Copilot.
- Cross-project reuse.

The greatest value begins when relationships are maintained, not merely when records are created.

---

# 46. First-day setup

For a new workspace:

1. Open Settings.
2. Add a Gemini API key.
3. Test the connection.
4. Review available models.
5. Choose the default model and optional fallbacks.
6. Load sample data if learning the product.
7. Create a real application if starting actual work.
8. Capture one representative module, screen and functionality.
9. Try AI Application Capture.
10. Open the Knowledge Graph.
11. Create a small project.
12. Add one meeting transcript.
13. Review extracted requirements.
14. Generate an impact assessment.
15. Generate a future-state flow.
16. Open FRD/TDD Studio.
17. Generate an FRD.
18. Generate a test case.
19. Open RTM.
20. Ask Copilot a question about the application.

This demonstrates most of the product lifecycle with a small amount of data.

---

# 47. Practical BA tips

### Start small

Document one important application and one important business process first.

### Relationships matter more than volume

A connected 50-record repository can be more useful than an unconnected 500-record repository.

### Use screenshots strategically

Screenshots are valuable evidence for UI structure and terminology.

### Add business explanation

AI can interpret a screenshot better when the BA also explains what the screen does.

### Preserve uncertainty

Unknown is better than guessed.

### Use Copilot to find gaps

Ask questions such as:

"What is not documented about this functionality?"

Then validate the answer.

### Regenerate stale AI artifacts

Do not continue using an old flow or design document without considering source changes.

### Back up regularly

Browser-local data makes backup part of operational discipline.

---

# 48. A useful mental model

Think of Application DNA as five layers.

## Layer 1 — Enterprise inventory

What systems exist?

Applications.

## Layer 2 — Application behavior

What do the systems do?

Modules, screens and functionalities.

## Layer 3 — Technical DNA

How do they do it?

Components, APIs, tables, procedures, jobs, queues, middleware and infrastructure.

## Layer 4 — Change intelligence

What are we changing?

Projects, meetings, requirements, impact, flows and stories.

## Layer 5 — Delivery intelligence

How do we implement and prove the change?

FRDs, TDDs, RTM, tests and defects.

Copilot and AI operate across these layers.

The Knowledge Graph visualizes the relationships.

---

# 49. Product value chain

The intended value chain is:

Application knowledge
→ Project change
→ Evidence
→ Requirements
→ Impact
→ Future state
→ Stories
→ FRD/TDD
→ Testing
→ Defects
→ Traceability
→ Reusable organizational knowledge

The product becomes more valuable every time a new project reuses existing application knowledge instead of recreating it.

---

# 50. Suggested success metrics

Organizations adopting Application DNA can measure:

## Knowledge coverage

- Percentage of critical applications documented.
- Percentage of important screens documented.
- Percentage of major functionalities documented.
- Percentage of important technical components documented.

## Requirement quality

- Requirements with acceptance criteria.
- Requirements mapped to functionality.
- Requirements approved.
- AI suggestions reviewed.

## Delivery efficiency

- Time to first FRD draft.
- Time to first impact assessment.
- Time to first future-state flow.
- Time spent on manual document assembly.

## Quality

- Requirements with tests.
- Requirements with passing tests.
- Unmapped requirements.
- Defects linked to requirements/tests.

## Knowledge reuse

- Copilot questions answered from documented knowledge.
- Projects reusing existing application records.
- Documents generated from existing repository context.

---

# 51. Final product definition

Application DNA is best understood as an:

> AI-assisted enterprise application memory and delivery system.

Its value comes from connecting information that is normally fragmented:

Applications
+ Business Processes
+ Screens
+ Functionalities
+ Technical Components
+ Requirements
+ Projects
+ Designs
+ Tests
+ Defects

Once these relationships exist, downstream work becomes easier:

- Discovery becomes faster.
- Impact analysis becomes more systematic.
- New BAs onboard faster.
- Requirements become more traceable.
- FRDs/TDDs become easier to produce.
- Testing becomes more connected to requirements.
- Technical dependencies become easier to understand.
- AI becomes more useful because it has organizational context.

The product should therefore be evaluated not only by how much documentation it can generate, but by how much reusable organizational knowledge it creates and how many downstream activities can reliably consume that knowledge.

---

# Appendix A — Current repository concepts

## Application Knowledge Repository

- Application
- Module
- Screen
- Screen media
- Functionality
- Technical component

## Project and Delivery Management

- Project
- Meeting
- Requirement
- Requirement candidate
- Artifact
- Delivery document
- Delivery document version
- Delivery approval
- Organization template
- Delivery story
- Requirement trace
- Test case
- Defect

A useful conceptual distinction is:

**Application knowledge describes the existing world.**

**Project knowledge describes change to that world.**

---

# Appendix B — AI feature map

| AI capability | Purpose | Main context |
|---|---|---|
| Application ingestion | Turn application evidence into structured knowledge | Application + existing entities + supplied text/files |
| Screen extraction | Identify visible controls and screen clues | Screenshots/documents |
| Transcript processing | Produce meeting notes and requirement suggestions | Meeting transcript |
| Requirement import | Extract project requirements | Uploaded source + application context |
| Impact assessment | Identify functional, technical, integration and gap impacts | Requirements + application knowledge |
| Project flow | Generate future-state process | Requirements + current flows + application knowledge |
| FRD generation | Produce functional design draft | Project + requirements + stories + process + template |
| TDD generation | Produce technical design draft | Project + requirements + stories + process + template |
| Test generation | Produce test scenarios | Requirement + story + acceptance criteria |
| Copilot | Answer repository questions | Local repository records |

---

# Appendix C — Product direction

The current repository provides a strong foundation for further capabilities such as:

- More advanced Copilot retrieval.
- Graph-aware retrieval.
- Full sequential approval orchestration.
- Visual document diff and restore.
- Stronger design-component traceability.
- Richer integration modeling.
- Secure enterprise key management.
- Additional document/export formats.
- Deeper test and defect intelligence.
- Additional evidence ingestion.
- Centralized collaboration and storage.

These are product evolution opportunities and should not be represented as current functionality until implemented.

---

# Conclusion

Application DNA is not simply a document generator.

It is a connected knowledge system designed to make enterprise application understanding reusable.

The central operating principle is:

**Capture once → structure → connect → validate → reuse → maintain.**

AI accelerates capture and reuse.

The Knowledge Graph makes relationships visible.

Projects make knowledge actionable.

FRD/TDD Studio turns knowledge into delivery artifacts.

Testing and RTM connect requirements to quality.

Copilot turns the repository into a natural-language interface.

Humans remain responsible for truth, governance, approval and decisions.

That combination is what makes Application DNA potentially useful as an organizational memory layer for business analysis, application change and delivery.
