import { useSyncExternalStore } from 'react';
import { account } from '../session/account.js';

/** Who is signed in (src/session/account.js), kept up to date */
export function useAccount() {
  return useSyncExternalStore(account.subscribe, account.getState);
}
