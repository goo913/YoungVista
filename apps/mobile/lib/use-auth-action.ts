import { useCallback, useState } from 'react';
import { authErrorMessage } from '@/lib/auth-errors';

/**
 * Runs a sign-in style action, tracking `busy` and a friendly `error`. On success the route
 * guard replaces the screen, so `busy` stays on to avoid a flash of the form.
 */
export function useAuthAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      const result = await action();
      // A Google sign-in the user closed resolves false: nothing to report.
      if (result === false) setBusy(false);
      return result !== false;
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(false);
      return false;
    }
  }, []);
  return { busy, error, run, setBusy };
}
