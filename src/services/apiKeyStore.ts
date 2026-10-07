/**
 * Gemini API key persistence. The key lives in this browser's localStorage only
 * (never in IndexedDB, so it is not part of database exports unless the user opts in).
 */
const STORAGE_KEY = 'eih.gemini.apiKey';
const CHANGE_EVENT = 'eih:apikey-changed';

export function getApiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function setApiKey(key: string): void {
  const value = key.trim();
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } finally {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

export function clearApiKey(): void {
  setApiKey('');
}

/** For useSyncExternalStore; also reacts to changes made in other tabs. */
export function subscribeApiKey(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) listener();
  };
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
