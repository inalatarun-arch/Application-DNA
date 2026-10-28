/**
 * Minimal MCP server over stdio (newline-delimited JSON-RPC 2.0). Registering it in Claude Code starts the bridge
 * with the session and stops it when Claude Code exits. stdout carries protocol only; logs go to stderr.
 */
import { createInterface } from 'node:readline';
import { loadConfig } from './config.mjs';
import { claudeVersion } from './engine.mjs';
import { createBridge } from './server.mjs';

const PROTOCOL = '2024-11-05';

export async function startMcp({ input = process.stdin, output = process.stdout, env = process.env } = {}) {
  const cfg = loadConfig(env);
  const log = (m) => process.stderr.write(`[eih-bridge] ${m}\n`);
  const bridge = createBridge(cfg, log);
  const state = { owner: false, port: cfg.port, error: '' };

  try {
    const addr = await bridge.listen();
    state.owner = true;
    state.port = addr.port;
    log(`listening on http://127.0.0.1:${addr.port}/v1`);
  } catch (e) {
    // Another Claude Code window already runs the bridge on this port; that one serves the app.
    state.error = e.code === 'EADDRINUSE' ? `Port ${cfg.port} is already served by another bridge instance (probably another Claude Code window).` : e.message;
    log(state.error);
  }

  const baseUrl = () => `http://127.0.0.1:${state.port}/v1`;
  const tools = [{
    name: 'eih_bridge_status',
    description: 'Shows whether the Enterprise Intelligence Hub AI bridge is running, the Base URL to enter in the app, and how many requests it has served. The bridge answers the app\'s AI features through this Claude Code login, so no API key is needed.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  }];

  async function callTool(name) {
    if (name !== 'eih_bridge_status') return { isError: true, content: [{ type: 'text', text: `Unknown tool ${name}` }] };
    const version = await claudeVersion(cfg);
    const lines = [
      state.owner ? 'Bridge: running in this Claude Code session' : `Bridge: not started here. ${state.error}`,
      `Base URL for the app: ${baseUrl()}`,
      `API key in the app: ${cfg.token ? 'the EIH_BRIDGE_TOKEN value' : 'none needed'}`,
      `Claude Code CLI: ${version ?? 'NOT FOUND (set EIH_CLAUDE_BIN)'}`,
      `Requests served: ${bridge.stats.requests} (failed: ${bridge.stats.failures}), running now: ${bridge.gate.active}, waiting: ${bridge.gate.waiting.length}`,
      `Allowed sites: localhost${cfg.origins.length ? `, ${cfg.origins.join(', ')}` : ''}. Add a deployed address with EIH_BRIDGE_ORIGINS.`,
      'In the app: Settings > AI configuration > OpenAI or compatible > "Use Claude Code bridge".',
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  const write = (msg) => output.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);

  async function handle(msg) {
    const { id, method, params } = msg;
    const reply = (result) => id !== undefined && write({ id, result });
    const fail = (code, message) => id !== undefined && write({ id, error: { code, message } });
    switch (method) {
      case 'initialize':
        return reply({
          protocolVersion: PROTOCOL,
          capabilities: { tools: {} },
          serverInfo: { name: 'eih-claude-bridge', version: '0.1.0' },
          instructions: 'Hosts a local OpenAI-compatible endpoint for the Enterprise Intelligence Hub app. Call eih_bridge_status for the address to enter in the app.',
        });
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools });
      case 'tools/call':
        return reply(await callTool(params?.name));
      default:
        if (method?.startsWith('notifications/')) return undefined;
        return fail(-32601, `Method not found: ${method}`);
    }
  }

  const rl = createInterface({ input });
  const pending = new Set();
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return write({ id: null, error: { code: -32700, message: 'Parse error' } }); }
    const p = handle(msg).catch((e) => msg.id !== undefined && write({ id: msg.id, error: { code: -32603, message: String(e?.message ?? e) } }));
    pending.add(p);
    p.finally(() => pending.delete(p));
  });
  await new Promise((resolve) => rl.on('close', resolve));
  await Promise.allSettled([...pending]);
  await bridge.close();
}
