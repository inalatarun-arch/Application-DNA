import { useCallback, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, nowIso } from './db';
import { type AiSettings } from '@/config/ai';
import { type ProviderId } from '@/config/providers';
import { applyPatch, viewForProvider } from './settingsView';
import { getActiveProvider, subscribeApiKey } from '@/services/apiKeyStore';

export const SETTING_KEYS = {
  ai: 'ai',
  workspace: 'workspace',
} as const;

export interface WorkspaceSettings {
  name: string;
  description: string;
}

export { applyPatch, viewForProvider };

export const DEFAULT_WORKSPACE: WorkspaceSettings = { name: 'Default Workspace', description: '' };

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value, updatedAt: nowIso() });
}

export async function getAiSettings(provider: ProviderId = getActiveProvider()): Promise<AiSettings> {
  const row = await db.settings.get(SETTING_KEYS.ai);
  return viewForProvider(row?.value as Partial<AiSettings> | undefined, provider);
}

/** Reactive AI settings for the active provider. `patch` shallow-merges into that provider's stored settings. */
export function useAiSettings(): [AiSettings, (patch: Partial<AiSettings>) => Promise<void>] {
  const provider = useSyncExternalStore(subscribeApiKey, getActiveProvider);
  const row = useLiveQuery(() => db.settings.get(SETTING_KEYS.ai), []);
  const current = viewForProvider(row?.value as Partial<AiSettings> | undefined, provider);
  const update = useCallback(async (patch: Partial<AiSettings>) => {
    const latest = await db.settings.get(SETTING_KEYS.ai);
    await setSetting(SETTING_KEYS.ai, applyPatch(latest?.value as Partial<AiSettings> | undefined, getActiveProvider(), patch));
  }, []);
  return [current, update];
}

export function useWorkspace(): [WorkspaceSettings, (next: WorkspaceSettings) => Promise<void>] {
  const row = useLiveQuery(() => db.settings.get(SETTING_KEYS.workspace), []);
  const current = { ...DEFAULT_WORKSPACE, ...(row?.value as Partial<WorkspaceSettings> | undefined) };
  const update = useCallback((next: WorkspaceSettings) => setSetting(SETTING_KEYS.workspace, next), []);
  return [current, update];
}
