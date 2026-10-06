import { useSyncExternalStore } from 'react';
import { getVaultSnapshot, subscribeVault } from '../lib/vault';
import type { VaultState } from '../lib/vault';

/** Reactive view of the key vault: { hasVault, unlocked, mode }. */
export function useVault(): VaultState {
  return useSyncExternalStore(subscribeVault, getVaultSnapshot, getVaultSnapshot);
}
