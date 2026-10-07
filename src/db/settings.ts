import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, nowIso } from './db';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '@/config/ai';

export const SETTING_KEYS = {
  ai: 'ai',
  workspace: 'workspace',
} as const;

export interface WorkspaceSettings {
  name: string;
  description: string;
}

export const DEFAULT_WORKSPACE: WorkspaceSettings = { name: 'Default Workspace', description: '' };

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value, updatedAt: nowIso() });
}

function mergeAi(value: Partial<AiSettings> | undefined): AiSettings {
  const rawFallbacks = Array.isArray(value?.fallbackModels) ? value.fallbackModels : DEFAULT_AI_SETTINGS.fallbackModels;
  const fallbackModels = rawFallbacks
    .filter((model): model is string => typeof model === 'string')
    .map((model) => model.trim())
    .filter(Boolean)
    .filter((model, index, all) => all.indexOf(model) === index);

  return {
    ...DEFAULT_AI_SETTINGS,
    ...value,
    featureModels: { ...DEFAULT_AI_SETTINGS.featureModels, ...value?.featureModels },
    fallbackModels,
  };
}

export async function getAiSettings(): Promise<AiSettings> {
  const row = await db.settings.get(SETTING_KEYS.ai);
  return mergeAi(row?.value as Partial<AiSettings> | undefined);
}

/** Reactive AI settings. `patch` shallow-merges into the stored record. */
export function useAiSettings(): [AiSettings, (patch: Partial<AiSettings>) => Promise<void>] {
  const row = useLiveQuery(() => db.settings.get(SETTING_KEYS.ai), []);
  const current = mergeAi(row?.value as Partial<AiSettings> | undefined);
  const update = useCallback(async (patch: Partial<AiSettings>) => {
    const latest = await getAiSettings();
    await setSetting(SETTING_KEYS.ai, { ...latest, ...patch });
  }, []);
  return [current, update];
}

export function useWorkspace(): [WorkspaceSettings, (next: WorkspaceSettings) => Promise<void>] {
  const row = useLiveQuery(() => db.settings.get(SETTING_KEYS.workspace), []);
  const current = { ...DEFAULT_WORKSPACE, ...(row?.value as Partial<WorkspaceSettings> | undefined) };
  const update = useCallback((next: WorkspaceSettings) => setSetting(SETTING_KEYS.workspace, next), []);
  return [current, update];
}
