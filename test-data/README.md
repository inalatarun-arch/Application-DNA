# Application DNA — End-to-End Test Data Pack

This folder contains a repeatable test fixture for the Application DNA features currently implemented.

## Files

- `application-dna-demo-backup.json` — import through **Settings → Data management → Import / restore database**.
- `TEST-EXECUTION-GUIDE.md` — ordered manual test run with expected outcomes.
- `COPILOT-SEARCH-SCENARIOS.md` — ready-to-paste Search and Copilot scenarios.
- `TEST-DATA-MAP.md` — relationship map for the fixture.

## Setup

1. Open the deployed Application DNA instance.
2. If you have existing work, use **Settings → Data management → Export database** first.
3. Import `application-dna-demo-backup.json` using **Choose backup file**.
4. Confirm the restore dialog and click **Replace local data**.
5. Go to **Settings → AI configuration** and add a Gemini API key if you want to test AI generation. The fixture contains no API key.
6. Run `TEST-EXECUTION-GUIDE.md` in order.

## Important

Restore replaces all local IndexedDB data in the current browser. Use a dedicated browser profile or export first.

The data is synthetic and contains no real credentials or business records.
