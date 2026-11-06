/**
 * YoungVista's Cloud Functions (2nd gen). Every function is a callable that needs a signed-in
 * user; secrets and AI credentials stay on the server. Deployed by GitHub Actions with the
 * website (firebase.json "functions").
 */
import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

/** A signed-in user's uid, or a refusal. */
export function requireUser(auth: { uid: string } | undefined): string {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  return auth.uid;
}

/** Says the server is reachable (the app checks it before offering server features). */
export const ping = onCall((request) => {
  requireUser(request.auth);
  return { ok: true, time: new Date().toISOString() };
});
