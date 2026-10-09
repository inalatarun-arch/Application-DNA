/**
 * Gemini access for the whole app. This is a thin facade over the encrypted key vault (lib/vault.ts) so the
 * rest of the code keeps one simple API while the key is never stored in plain text.
 *
 * Two ways to authorise requests:
 *  1. A key saved in the vault (AES-256-GCM, passphrase or device bound). It is decrypted into memory only.
 *  2. An optional server proxy (see docs/gemini-proxy-worker.js). The Google key then lives on the server
 *     and the browser holds no key at all; only the proxy URL and an optional shared token are stored here.
 */
import { PROVIDERS, cleanBaseUrl, isProviderId, type ProviderId } from '@/config/providers';
import {
  deleteVault,
  findLegacyKeys,
  getKey,
  getVaultSnapshot,
  normalizeApiKey,
  readLegacyKey,
  saveKey,
  subscribeVault,
  tryAutoUnlock,
  wipeLegacyKeys,
} from '@/lib/vault';

const PROXY_URL = 'eih.gemini.proxyUrl';
const PROXY_TOKEN = 'eih.gemini.proxyToken';
const LEGACY_PLAINTEXT_KEY = 'eih.gemini.apiKey';
const CHANGE_EVENT = 'eih:apikey-changed';
const ACTIVE_PROVIDER = 'eih.ai.provider';
const BASE_URL_PREFIX = 'eih.ai.baseUrl.';

const read = (k: string): string => {
  try {
    return localStorage.getItem(k)?.trim() ?? '';
  } catch {
    return '';
  }
};

/** The provider all AI calls use. Kept in localStorage (not secret) so it can be read synchronously. */
export function getActiveProvider(): ProviderId {
  const v = read(ACTIVE_PROVIDER);
  return isProviderId(v) ? v : 'gemini';
}

export function setActiveProvider(p: ProviderId): void {
  try {
    localStorage.setItem(ACTIVE_PROVIDER, p);
  } finally {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

/** Endpoint for providers that allow a custom one; falls back to the provider default. */
export function getBaseUrl(p: ProviderId): string {
  if (!PROVIDERS[p].customBaseUrl) return PROVIDERS[p].defaultBaseUrl;
  return cleanBaseUrl(read(BASE_URL_PREFIX + p)) || PROVIDERS[p].defaultBaseUrl;
}

export function setBaseUrl(p: ProviderId, url: string): void {
  const clean = cleanBaseUrl(url);
  if (url.trim() && !clean) throw new Error('The address must start with https:// (http:// is only allowed for localhost).');
  try {
    if (clean && clean !== PROVIDERS[p].defaultBaseUrl) localStorage.setItem(BASE_URL_PREFIX + p, clean);
    else localStorage.removeItem(BASE_URL_PREFIX + p);
  } finally {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

/** The decrypted key for a provider (default: the active one), or '' while locked or missing. Never throws. */
export function getApiKey(provider: ProviderId = getActiveProvider()): string {
  try {
    return getKey(provider);
  } catch {
    return '';
  }
}

/** True when this provider has any stored key (locked or not). */
export function hasStoredKey(provider: ProviderId): boolean {
  return getVaultSnapshot(provider).hasVault;
}

export interface ProxyConfig {
  url: string;
  token: string;
}

export function getProxy(): ProxyConfig {
  return { url: read(PROXY_URL).replace(/\/+$/, ''), token: read(PROXY_TOKEN) };
}

export function setProxy(url: string, token: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  if (clean && !/^https:\/\//i.test(clean)) throw new Error('The proxy URL must start with https://');
  try {
    if (clean) localStorage.setItem(PROXY_URL, clean);
    else localStorage.removeItem(PROXY_URL);
    if (clean && token.trim()) localStorage.setItem(PROXY_TOKEN, token.trim());
    else localStorage.removeItem(PROXY_TOKEN);
  } finally {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

/** Truthy when AI calls can be authorised right now: an unlocked key for the active provider, or (Gemini only) a configured proxy. */
export function getAiAccess(): string {
  const p = getActiveProvider();
  return getApiKey(p) || (p === 'gemini' && getProxy().url ? 'proxy' : '');
}

/** Saves a key into the vault, device bound. Used by backup restore; the settings panel offers passphrase mode. */
export async function setApiKey(key: string, provider: ProviderId = 'gemini'): Promise<void> {
  const clean = normalizeApiKey(key);
  if (!clean) {
    await deleteVault(provider);
    return;
  }
  await saveKey(clean, 'device', undefined, provider, PROVIDERS[provider].minKeyLength);
}

export async function clearApiKey(provider: ProviderId = 'gemini'): Promise<void> {
  await deleteVault(provider);
}

/** For useSyncExternalStore; fires on vault lock/unlock/save/delete and on proxy changes. */
export function subscribeApiKey(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const offVault = subscribeVault(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === PROXY_URL || e.key === PROXY_TOKEN || e.key === ACTIVE_PROVIDER || e.key === null) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    offVault();
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

export interface KeyStoreInit {
  /** True when an old plain-text key was moved into the encrypted vault during this start. */
  migrated: boolean;
}

/**
 * Call once at start-up. Moves a plain-text key left by older versions into the vault (device bound) and erases
 * the plain-text copy, then silently unlocks device-bound vaults.
 */
export async function initKeyStore(): Promise<KeyStoreInit> {
  let migrated = false;
  try {
    const legacy = findLegacyKeys().filter((h) => h.storage === 'localStorage' && h.name === LEGACY_PLAINTEXT_KEY);
    if (legacy.length) {
      if (!getVaultSnapshot().hasVault) {
        const key = readLegacyKey(legacy[0]);
        if (key) {
          await saveKey(key, 'device');
          migrated = true;
        }
      }
      // Only erase once the key is safely in the vault, or when a vault already exists.
      if (getVaultSnapshot().hasVault) wipeLegacyKeys(legacy);
    }
  } catch {
    /* leave the old key untouched; the settings panel offers a manual import */
  }
  await tryAutoUnlock();
  return { migrated };
}
