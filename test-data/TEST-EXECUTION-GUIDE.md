# End-to-End Test Execution Guide

1. Import `application-dna-demo-backup.json` from Settings > Data management. Export current data first if needed.
2. Configure Gemini under Settings > AI configuration if you want to run AI features.
3. Verify the Applications, Project, Meeting, Requirements, Tests and Defects records from the fixture.
4. Open Applications > Oracle E-Business Suite > Supplier Maintenance. Verify fields, validations, workflow, approval logic and exceptions.
5. Open Create Supplier and verify its process flow, roles, inputs, outputs and exceptions.
6. Open the technical registry and inspect AP_SUPPLIERS, AP_SUPPLIER_PKG.CREATE_SUPPLIER and Supplier API: Create Supplier.
7. Open Knowledge Graph and trace Salesforce -> MuleSoft -> Supplier API -> EBS procedure -> AP_SUPPLIERS.
8. Open the project Meeting notes and verify transcript, summary, decisions, actions and the accepted duplicate-Tax-ID candidate.
9. In Requirements, verify Epic -> Feature -> User Story hierarchy and acceptance criteria.
10. In Testing, generate SIT cases from Create supplier from onboarding request. Repeat for Block duplicate supplier by Tax ID.
11. Execute fixture tests. Expected initial mix: two Pass, one Fail, one Not Run.
12. Open RTM and verify Requirement -> User Story -> Technical Component -> Test Case -> Defect, coverage, Failing and Unmapped filters.
13. Open Defects and inspect the duplicate-supplier defect and timeout defect.
14. Run AI Root Cause Advisor on the duplicate-supplier defect and verify Root causes, Impacted modules and Recommendations.
15. Create a new defect with a local screenshot attachment and verify it is retained.
16. Use header search for AP_SUPPLIERS, Supplier API, Create supplier, duplicate supplier and MuleSoft.
17. Open Copilot with the floating button or Ctrl/Cmd + K. Use the prompts in COPILOT-SEARCH-SCENARIOS.md.
18. Compare Search for AP_SUPPLIERS with Copilot asking which functionality uses AP_SUPPLIERS and what upstream integration feeds it.
19. Reload the browser and verify data persists.
20. Export the database, make a temporary change, then restore the export and verify the temporary change disappears.
