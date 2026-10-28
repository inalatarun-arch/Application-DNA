/** Talks to the crawler in the local Claude Code bridge (claude-bridge/). The browser cannot crawl other sites itself (CORS). */
import { CLAUDE_BRIDGE_URL, isLocalUrl } from '@/config/providers';
import { getBaseUrl } from './apiKeyStore';

export interface CrawlRequest {
  siteUrl?: string;
  repoUrl?: string;
  /** Optional session Cookie for apps behind a login. Sent to the local bridge only; never stored. */
  cookie?: string;
  maxPages?: number;
}

export interface CrawlResult {
  files: File[];
  /** One entry per source that failed; the other source may still have produced a file. */
  errors: string[];
  summary: string;
}

/** The bridge address: the OpenAI-compatible address when that already points at this computer, else the default. */
export function bridgeRoot(): string {
  const configured = getBaseUrl('openai');
  return (isLocalUrl(configured) ? configured : CLAUDE_BRIDGE_URL).replace(/\/v1\/?$/, '').replace(/\/+$/, '');
}

interface Wire {
  files?: Array<{ name: string; text: string; stats?: Record<string, number> }>;
  errors?: Array<{ source: string; message: string }>;
  error?: { message?: string };
}

export async function crawlApplication(req: CrawlRequest, signal?: AbortSignal): Promise<CrawlResult> {
  const body = {
    siteUrl: req.siteUrl?.trim() || undefined,
    repoUrl: req.repoUrl?.trim() || undefined,
    maxPages: req.maxPages,
    headers: req.cookie?.trim() ? { cookie: req.cookie.trim() } : undefined,
  };
  let res: Response;
  try {
    res = await fetch(`${bridgeRoot()}/v1/crawl`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (err) {
    if (signal?.aborted) throw new Error('Crawl cancelled.');
    throw new Error('Could not reach the crawler. Start the bridge on this computer ("npm run bridge" in the project folder) and allow this site if the browser asks. See claude-bridge/README.md.', { cause: err });
  }
  const data = (await res.json().catch(() => ({}))) as Wire;
  if (!res.ok) throw new Error(data.error?.message ?? `The crawler returned HTTP ${res.status}.`);
  const files = (data.files ?? []).map((f) => new File([f.text], f.name, { type: 'text/markdown' }));
  const parts = (data.files ?? []).map((f) => `${f.name}: ${Object.entries(f.stats ?? {}).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  return { files, errors: (data.errors ?? []).map((e) => `${e.source}: ${e.message}`), summary: parts.join(' · ') };
}
