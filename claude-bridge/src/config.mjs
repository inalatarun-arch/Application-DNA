/** Settings come from environment variables so the same code runs standalone and as an MCP server. */
import os from 'node:os';

const int = (v, d, min = 1) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= min ? n : d;
};

export function loadConfig(env = process.env) {
  return {
    host: '127.0.0.1',
    port: int(env.EIH_BRIDGE_PORT, 8787, 0),
    claudeBin: env.EIH_CLAUDE_BIN || 'claude',
    /** Extra browser origins allowed to call the bridge (localhost origins are always allowed). */
    origins: (env.EIH_BRIDGE_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean),
    /** Optional shared secret; when set the app's API key field must contain it. */
    token: env.EIH_BRIDGE_TOKEN || '',
    concurrency: int(env.EIH_BRIDGE_CONCURRENCY, 3),
    timeoutMs: int(env.EIH_BRIDGE_TIMEOUT_MS, 300_000, 1000),
    /** Model used when the app asks for a name Claude Code does not know (for example the OpenAI default). */
    defaultModel: env.EIH_BRIDGE_MODEL || '',
    maxBodyBytes: 40 * 1024 * 1024,
    tmpDir: os.tmpdir(),
  };
}

/** Aliases track the newest model of each family, so this list does not go stale. */
export const MODELS = [
  { id: 'sonnet', name: 'Claude Sonnet (latest)', description: 'Balanced. Good default for every feature.' },
  { id: 'opus', name: 'Claude Opus (latest)', description: 'Strongest reasoning. Slower, uses more of your Claude Code allowance.' },
  { id: 'haiku', name: 'Claude Haiku (latest)', description: 'Fastest and lightest.' },
  { id: 'fable', name: 'Claude Fable (latest)', description: 'Largest model family available to Claude Code.' },
];

const KNOWN = /^(claude-[\w.-]+|sonnet|opus|haiku|fable)(\[1m\])?$/i;

/** A model name Claude Code can use, or '' to let it pick its own default. */
export function resolveModel(requested, cfg) {
  if (typeof requested === 'string' && KNOWN.test(requested.trim())) return requested.trim();
  return cfg.defaultModel;
}
