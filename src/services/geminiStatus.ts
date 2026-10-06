import { getApiKey, subscribeApiKey } from './apiKeyStore';

export type GeminiPhase = 'missing' | 'untested' | 'checking' | 'connected' | 'quota' | 'error';

export interface GeminiStatus {
  phase: GeminiPhase;
  latencyMs?: number;
  model?: string;
  checkedAt?: number;
  message?: string;
}

const STORAGE_KEY = 'eih.gemini.status';
const PERSISTED: GeminiPhase[] = ['connected', 'quota', 'error'];

function initial(): GeminiStatus {
  if (!getApiKey()) return { phase: 'missing' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GeminiStatus;
      if (PERSISTED.includes(parsed.phase)) return parsed;
    }
  } catch {
    /* ignore corrupt value */
  }
  return { phase: 'untested' };
}

let state: GeminiStatus = initial();
const listeners = new Set<() => void>();

export function getStatus(): GeminiStatus {
  return state;
}

export function setStatus(next: GeminiStatus): void {
  state = next;
  try {
    if (PERSISTED.includes(next.phase)) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* non-fatal */
  }
  listeners.forEach((l) => l());
}

export function subscribeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Any key change invalidates the previous verification result.
subscribeApiKey(() => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  setStatus(getApiKey() ? { phase: 'untested' } : { phase: 'missing' });
});
