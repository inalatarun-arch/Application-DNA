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
- The Gemini key is stored in `localStorage` (`eih.gemini.apiKey`), never in IndexedDB, and is excluded from database exports unless you opt in.
- All Gemini traffic goes through `src/services/geminiService.ts`.
- Schema changes: add a new `this.version(n)` block in `src/db/db.ts` and bump `DB_SCHEMA_VERSION`.
