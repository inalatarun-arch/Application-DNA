# Universal Search and Copilot Scenario Pack

## Universal Search

Search these one at a time:

- AP_SUPPLIERS
- Supplier API: Create Supplier
- Create supplier
- duplicate supplier
- MuleSoft
- Integration timeout
- Create supplier from onboarding request

Verify the results can cover applications, modules, screens, functionalities, APIs, user stories, tests and defects. Open several results and verify navigation.

## Enterprise Copilot

### Architecture
- What applications are involved in supplier onboarding?
- Explain the technical path from Salesforce supplier onboarding to Oracle EBS.
- What is AP_SUPPLIERS and which functionality uses it?
- Which technical components sit between Salesforce and AP_SUPPLIERS?
- What could be impacted if AP_SUPPLIER_PKG.CREATE_SUPPLIER changed?

### Requirements
- What are the acceptance criteria for creating a supplier?
- What requirement covers duplicate supplier prevention?
- What non-functional requirement covers integration failures?
- Summarize the supplier onboarding requirements.

### Testing
- Which supplier onboarding requirements have passing tests?
- Which tests are failing?
- What defect is linked to the duplicate supplier test?
- Give me a regression checklist for supplier onboarding.

### Defects
- Explain the likely root cause of the duplicate supplier defect.
- Which technical components are implicated in the duplicate supplier defect?
- What should QA retest after this defect is fixed?

### Meeting intelligence
- What decisions were made in the supplier onboarding discovery meeting?
- What actions are still open?
- Which requirement candidate came from the meeting?
- What business rule was discussed about duplicate Tax IDs?

## Grounding check

Ask:
“What is the exact production retention period for supplier integration audit records?”

The fixture does not contain that retention period. The answer should not invent a fixture value.

## Paraphrase check

Ask all three:
1. Which functionality uses AP_SUPPLIERS?
2. Show me the business function backed by AP_SUPPLIERS.
3. Where is the supplier master table used?

The answers should converge on the same repository evidence.
