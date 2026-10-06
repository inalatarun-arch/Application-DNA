import { useSyncExternalStore } from 'react';
import { getApiKey, subscribeApiKey } from '@/services/apiKeyStore';
import { getStatus, subscribeStatus } from '@/services/geminiStatus';

export function useApiKey(): string {
  return useSyncExternalStore(subscribeApiKey, getApiKey);
}

export function useGeminiStatus() {
  return useSyncExternalStore(subscribeStatus, getStatus);
}
