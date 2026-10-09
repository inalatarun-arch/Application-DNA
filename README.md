# Enterprise Intelligence Hub (EIH)

AI-powered application knowledge and delivery management platform. Runs fully in the browser:
React + TypeScript + Tailwind, local data in IndexedDB (Dexie), AI via your own Gemini API key.

## Run locally
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

## Notes
- Routing uses `HashRouter` and `base: './'`, so `dist/` works on any static host or sub-path with no rewrite rules.
- Choose the AI provider in Settings > AI configuration: Google Gemini, Anthropic Claude, or any OpenAI-compatible service (OpenAI, OpenRouter, Groq, Mistral, local servers; set the base URL). Each provider has its own encrypted key, live model list and model-per-feature settings. Calls go straight from the browser to the provider you pick.
- Each key lives in an encrypted vault (AES-256-GCM, passphrase or device mode) in Settings > AI configuration. For Gemini only, you can instead deploy the server proxy in `proxy/` (see `proxy/README.md`) so no key reaches the browser.
- All Gemini traffic goes through `src/services/geminiService.ts`.
- Schema changes: add a new `this.version(n)` block in `src/db/db.ts` and bump `DB_SCHEMA_VERSION`.

## Documentation

- [Application DNA Product & User Guide](docs/APPLICATION-DNA-PRODUCT-USER-GUIDE.md) — product overview, capabilities, user workflows, AI behavior, operating guidance, current limitations and recommended BA lifecycle.

## What's new in this version
- **Prompts** are centralised in `src/prompts/`, with JSON repair, retries and cut-off detection.
- **Application Extractor** has a review screen: accept, reject or ask Gemini to change items before they are saved.
- **Process flows** export to BPMN 2.0, draw.io and Visio (.vsdx), and can be changed by typing an instruction (delta edits, so few tokens).
- **Projects**: impact analysis and the future-state flow work from a ranked, size-limited digest of the application (lean / standard / deep).
- **Studio**: FDD (5-section template), FRD, TDD and stories; download as DOCX or Markdown, or ask Gemini to revise a section.
- **Tests** (`npm test`) cover Gemini parsing, file payloads, flow logic, DOCX/Visio output and the FDD pipeline. `npm run lint` is advisory in CI.

## Lockfile
No `package-lock.json` is committed. In GitHub open Actions > "Update lockfile" > Run workflow once; it commits the lockfile and CI/deploy then use `npm ci`.
