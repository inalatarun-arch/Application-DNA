import { useSyncExternalStore } from 'react';
import { getAiAccess, subscribeApiKey } from '@/services/apiKeyStore';
import { getStatus, subscribeStatus } from '@/services/geminiStatus';

/** Truthy when AI calls can be made now (an unlocked key or a configured proxy). Empty while locked or missing. */
export function useApiKey(): string {
  return useSyncExternalStore(subscribeApiKey, getAiAccess);
}

export function useGeminiStatus() {
  return useSyncExternalStore(subscribeStatus, getStatus);
}
