import { useSyncExternalStore } from 'react';

// The session's state, redrawing the component whenever it changes
export function useSession(session) {
  return useSyncExternalStore(session.subscribe, session.getState);
}
