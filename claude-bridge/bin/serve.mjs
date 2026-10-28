#!/usr/bin/env node
/** Standalone: `npm run bridge` from the repo root. Press Ctrl+C to stop. */
import { loadConfig } from '../src/config.mjs';
import { claudeVersion } from '../src/engine.mjs';
import { createBridge } from '../src/server.mjs';

const cfg = loadConfig();
const bridge = createBridge(cfg, (m) => console.error(`[bridge] ${m}`));
const version = await claudeVersion(cfg);
if (!version) {
  console.error(`Could not run "${cfg.claudeBin}". Install Claude Code and sign in once with "claude", or set EIH_CLAUDE_BIN.`);
  process.exit(1);
}
try {
  const addr = await bridge.listen();
  console.log(`Claude Code bridge ready (${version})`);
  console.log(`  Base URL : http://127.0.0.1:${addr.port}/v1`);
  console.log(`  API key  : ${cfg.token ? 'the EIH_BRIDGE_TOKEN value' : 'none needed (any placeholder text works)'}`);
  console.log(`  Allowed  : localhost pages${cfg.origins.length ? `, ${cfg.origins.join(', ')}` : ''}`);
} catch (e) {
  console.error(e.code === 'EADDRINUSE' ? `Port ${cfg.port} is already in use. Is the bridge already running? Use EIH_BRIDGE_PORT to pick another.` : e.message);
  process.exit(1);
}
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => bridge.close().then(() => process.exit(0)));
