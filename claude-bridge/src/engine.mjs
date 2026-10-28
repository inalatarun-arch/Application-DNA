/** Runs one prompt through the Claude Code CLI (`claude -p`) using whatever login Claude Code already has. */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BridgeError } from './translate.mjs';

/**
 * Flags that turn Claude Code into a plain text model: no session files, no user/project settings, hooks, plugins,
 * MCP servers or slash commands, and (unless images are attached) no tools. Input documents are untrusted, so a
 * prompt hidden inside one must have nothing to act with.
 */
export function buildArgs({ model, system, hasImages, dir }) {
  const args = [
    '-p',
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands',
    '--setting-sources', '',
    '--system-prompt', system || 'You are a precise assistant. Follow the instructions in the user message exactly.',
  ];
  if (model) args.push('--model', model);
  if (hasImages) {
    // Read is limited to this request's private folder; everything else is denied rather than asked about.
    args.push('--tools', 'Read', '--permission-mode', 'dontAsk', '--allowedTools', `Read(/${dir}/**)`, '--add-dir', dir);
  } else {
    args.push('--tools', '');
  }
  return args;
}

function mapFailure(message, status) {
  const m = message || 'Claude Code returned an error.';
  if (/not logged in|please run \/login|invalid api key|authentication|oauth/i.test(m) || status === 401) {
    return new BridgeError(401, `Claude Code is not signed in. Run "claude" in a terminal, sign in with /login, then try again. (${m})`, 'authentication_error', 'claude_not_signed_in');
  }
  if (/rate.?limit|usage limit|limit reached|overloaded|quota|credit/i.test(m) || status === 429 || status === 529) {
    return new BridgeError(429, `Claude Code usage limit reached. ${m}`, 'rate_limit_error', 'rate_limit');
  }
  return new BridgeError(502, m, 'api_error', 'claude_error');
}

/**
 * @returns {Promise<{ text: string, stopReason?: string, usage?: object, model?: string }>}
 * `onText` is called with each streamed piece of the answer.
 */
export async function runClaude(cfg, job, { onText, signal } = {}) {
  const dir = await mkdtemp(path.join(cfg.tmpDir, 'eih-bridge-'));
  try {
    for (const img of job.images) await writeFile(path.join(dir, img.name), img.data, { mode: 0o600 });
    const args = buildArgs({ model: job.model, system: job.system, hasImages: job.images.length > 0, dir });
    const env = { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };
    if (job.maxTokens) env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(job.maxTokens);
    return await new Promise((resolve, reject) => {
      const child = spawn(cfg.claudeBin, args, { cwd: dir, env, stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      let streamed = '';
      let final;
      let settled = false;
      const done = (fn, v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        fn(v);
      };
      const kill = () => child.kill('SIGKILL');
      const timer = setTimeout(() => {
        kill();
        done(reject, new BridgeError(504, `Claude Code did not answer within ${Math.round(cfg.timeoutMs / 1000)}s.`, 'timeout_error', 'timeout'));
      }, cfg.timeoutMs);
      const onAbort = () => {
        kill();
        done(reject, new BridgeError(499, 'Request cancelled.', 'invalid_request_error', 'cancelled'));
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });

      const handle = (line) => {
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          return;
        }
        if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta' && !ev.parent_tool_use_id) {
          streamed += ev.event.delta.text;
          onText?.(ev.event.delta.text, streamed);
        } else if (ev.type === 'result') {
          final = ev;
        }
      };
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d) => {
        out += d;
        const lines = out.split('\n');
        out = lines.pop() ?? '';
        lines.forEach(handle);
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (d) => { err = (err + d).slice(-500); });
      child.on('error', (e) => {
        done(reject, e.code === 'ENOENT'
          ? new BridgeError(503, `Could not start "${cfg.claudeBin}". Install Claude Code (https://claude.com/claude-code) or set EIH_CLAUDE_BIN to its path.`, 'api_error', 'claude_not_found')
          : new BridgeError(502, `Could not start Claude Code: ${e.message}`, 'api_error'));
      });
      child.on('close', (code) => {
        if (out.trim()) handle(out);
        if (!final) return done(reject, mapFailure(err.trim() || `Claude Code exited with code ${code} and no answer.`));
        if (final.is_error) return done(reject, mapFailure(typeof final.result === 'string' ? final.result : '', final.api_error_status));
        const text = typeof final.result === 'string' ? final.result : streamed;
        if (!text.trim()) return done(reject, new BridgeError(502, 'Claude Code returned an empty answer.', 'api_error', 'empty'));
        done(resolve, { text, stopReason: final.stop_reason, usage: final.usage, model: Object.keys(final.modelUsage ?? {})[0] });
      });
      child.stdin.on('error', () => { /* the process ended early; the close handler reports why */ });
      child.stdin.end(job.prompt);
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Version string of the installed CLI, or null when it cannot be started. */
export function claudeVersion(cfg) {
  return new Promise((resolve) => {
    try {
      const c = spawn(cfg.claudeBin, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
      let v = '';
      c.stdout.on('data', (d) => { v += d; });
      c.on('error', () => resolve(null));
      c.on('close', (code) => resolve(code === 0 ? v.trim() : null));
    } catch {
      resolve(null);
    }
  });
}
