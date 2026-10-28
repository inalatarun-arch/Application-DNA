# Claude Code bridge: run the app's AI without an API key

The app calls its AI through an OpenAI-style API. This bridge is a tiny local server that speaks that API and answers each
request by running **Claude Code** (`claude -p`) with the login you already use. No Gemini, Anthropic or OpenAI key is
involved, so every AI feature (extraction, flows, impact analysis, Studio documents, stories, tests, Copilot, transcripts,
screens) works as before.

```
Browser app  --http://127.0.0.1:8787/v1-->  bridge  --spawns-->  claude -p  (your Claude Code login)
```

It uses your Claude Code allowance (Pro/Max/Team/Enterprise plan), so heavy runs count against that plan's limits.

## Setup (once)

1. Install Claude Code and sign in: run `claude` in a terminal and complete `/login`.
2. Start the bridge. Pick **one**:
   - **As an MCP server (recommended).** Claude Code starts it with your session and stops it on exit. The repo ships a
     project `.mcp.json`, so just open Claude Code in this repo and approve the `eih-claude-bridge` server. To use it from any
     folder instead: `claude mcp add --scope user eih-claude-bridge -- node /full/path/to/claude-bridge/bin/mcp.mjs`.
     Ask Claude Code to run the `eih_bridge_status` tool to see the address.
   - **Standalone.** `npm run bridge` from the repo root; stop with Ctrl+C. Needs only Node 20+, no `npm install`.
3. In the app open **Settings > AI configuration**, choose **OpenAI or compatible**, press **Use Claude Code bridge**, then
   **Test API connection**. No key is needed for a localhost address. Pick a model (`sonnet` is a good default,
   `haiku` is fastest, `opus` strongest).

## Limits to know about

- **PDFs:** the OpenAI-style path cannot carry PDFs. Upload Word, text or Excel instead, or switch to Gemini/Claude for those.
  Images work (PNG, JPEG, GIF, WebP).
- **Speed:** each request starts a Claude Code process, so expect a few seconds of overhead per call. Up to 3 run at once.
- **The bridge must be running** whenever you use AI in the app, and Claude Code must be signed in on the same computer.
- Temperature is not adjustable through Claude Code and is ignored.

## Settings (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `EIH_BRIDGE_PORT` | `8787` | Port on 127.0.0.1. If you change it, change the Base URL in the app to match. |
| `EIH_BRIDGE_ORIGINS` | none | Comma-separated sites allowed to call the bridge, e.g. `https://yourname.github.io` when you use the deployed app. `localhost` pages are always allowed. |
| `EIH_BRIDGE_TOKEN` | none | Optional shared secret; if set, enter it as the API key in the app. |
| `EIH_BRIDGE_CONCURRENCY` | `3` | Claude Code processes running at once. |
| `EIH_BRIDGE_TIMEOUT_MS` | `300000` | Per-request limit. |
| `EIH_BRIDGE_MODEL` | Claude Code default | Model used when the app sends a name Claude Code does not know. |
| `EIH_CLAUDE_BIN` | `claude` | Path to the Claude Code CLI. |

Browsers allow a public https page to call `http://127.0.0.1`, but newer Chrome versions may ask you to allow access to
local devices the first time. Allow it. Firefox and Safari may block it from an https site; open the app locally
(`npm run dev`) in that case.

## Security

- Listens on **127.0.0.1 only** and rejects requests whose `Host` is not localhost (DNS-rebinding defence).
- Rejects browser requests from any site not on the allow-list, so a random web page cannot spend your Claude Code allowance.
- Each request runs `claude -p` in an empty temporary folder with **no tools, no hooks, no plugins, no MCP servers, no
  settings and no session files**. Documents you upload are untrusted text; a prompt hidden inside one cannot run commands or
  read files. The only exception is image requests: the model gets the `Read` tool limited to that request's private folder.
- Nothing is logged except status lines; prompts and answers are never written to disk.

## Tests

`npm run test:bridge` runs the bridge against a fake `claude` binary, so it needs no login.

Note: any page served from `localhost` (any port) is allowed, because that is where `npm run dev` runs. Do not open untrusted
local web apps while the bridge is running. Set `EIH_BRIDGE_TOKEN` if you want to rule that out.
