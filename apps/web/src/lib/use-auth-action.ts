import { useCallback, useState } from 'react';
import { authErrorMessage } from './auth-errors';

/**
 * Runs a sign-in style action, tracking `busy` and a friendly `error`. On success the page is
 * usually replaced by a redirect, so `busy` stays on to avoid a flash of the form.
 */
export function useAuthAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(false);
      return false;
    }
  }, []);
  return { busy, error, run, setBusy };
}
