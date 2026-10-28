#!/usr/bin/env node
// Stand-in for the `claude` CLI: echoes the request back in stream-json so tests need no login.
import { readFileSync } from 'node:fs';

if (process.argv.includes('--version')) { console.log('0.0.0-fake'); process.exit(0); }
const prompt = readFileSync(0, 'utf8');
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1]; };
if (prompt.includes('FAIL_LOGIN')) { console.log(JSON.stringify({ type: 'result', is_error: true, result: 'Not logged in · Please run /login' })); process.exit(1); }
if (prompt.includes('FAIL_LIMIT')) { console.log(JSON.stringify({ type: 'result', is_error: true, result: 'Claude usage limit reached', api_error_status: 429 })); process.exit(1); }
if (prompt.includes('SLOW')) await new Promise((r) => setTimeout(r, 5000));
const answer = JSON.stringify({ prompt, system: arg('--system-prompt'), model: arg('--model'), tools: arg('--tools'), max: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS });
const half = Math.ceil(answer.length / 2);
for (const text of [answer.slice(0, half), answer.slice(half)]) {
  console.log(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } }));
}
console.log(JSON.stringify({ type: 'result', is_error: false, result: answer, stop_reason: prompt.includes('TRUNCATE') ? 'max_tokens' : 'end_turn', usage: { input_tokens: 10, output_tokens: 4 }, modelUsage: { 'claude-fake': {} } }));
