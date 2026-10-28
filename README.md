# Application DNA

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
- **No API key? Use Claude Code.** `claude-bridge/` is a small local server (and Claude Code MCP server) that answers every AI feature through your Claude Code login. Settings > AI configuration > OpenAI or compatible > **Use Claude Code bridge**. The same bridge hosts the **application crawler** (live URL and/or repository link, feeding AI application capture). See [claude-bridge/README.md](claude-bridge/README.md).
- Each key lives in an encrypted vault (AES-256-GCM, passphrase or device mode) in Settings > AI configuration. For Gemini only, you can instead deploy the server proxy in `proxy/` (see `proxy/README.md`) so no key reaches the browser.
- All Gemini traffic goes through `src/services/geminiService.ts`.
- The production build adds a Content-Security-Policy (`vite.config.ts`) that only lets the app's own bundled scripts run. If a new feature loads a script, font or frame from another site, it must be added there on purpose. Check the browser console for "Content Security Policy" messages after a deploy.
- Backups exclude API keys by default; when included they are encrypted with a backup passphrase. The optional proxy in `proxy/` requires an access token.
- Schema changes: add a new `this.version(n)` block in `src/db/db.ts` and bump `DB_SCHEMA_VERSION`.

## Documentation

- [Application DNA Product & User Guide](docs/APPLICATION-DNA-PRODUCT-USER-GUIDE.md) — product overview, capabilities, user workflows, AI behavior, operating guidance, current limitations and recommended BA lifecycle.

## What's new in this version
- **Bulk application import**: on the Applications page, *Import from file* reads one file that lists many applications (spreadsheet/CSV columns are mapped automatically without AI; documents, PDFs, images and notes are read by the AI), shows every application for review, matches existing ones by name, and saves them in one go.
- **Prompts** are centralised in `src/prompts/`, with JSON repair, retries and cut-off detection.
- **Application Extractor** has a review screen: accept, reject or ask Gemini to change items before they are saved.
- **Process flows** export to BPMN 2.0, draw.io and Visio (.vsdx), and can be changed by typing an instruction (delta edits, so few tokens).
- **Projects**: impact analysis and the future-state flow work from a ranked, size-limited digest of the application (lean / standard / deep).
- **Studio**: FDD (5-section template), FRD, TDD and stories; download as DOCX or Markdown, or ask Gemini to revise a section.
- **Tests** (`npm test`) cover Gemini parsing, file payloads, flow logic, DOCX/Visio output and the FDD pipeline. `npm run lint` is advisory in CI.

## Lockfile
CI and deploy use `npm ci`, which needs `package-lock.json`. If it is missing or `package.json` changed, open Actions > "Update lockfile" > Run workflow once; it commits the lockfile and then starts a deploy. CI also runs `npm audit` on production dependencies, and Dependabot proposes weekly updates.
