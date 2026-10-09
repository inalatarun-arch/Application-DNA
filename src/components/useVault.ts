import { useSyncExternalStore } from 'react';
import { getVaultSnapshot, subscribeVault, type VaultSlot } from '../lib/vault';

/** Reactive state of one provider's key vault (locked / unlocked / mode). */
export function useVault(slot: VaultSlot = 'gemini') {
  return useSyncExternalStore(subscribeVault, () => getVaultSnapshot(slot), () => getVaultSnapshot(slot));
}
