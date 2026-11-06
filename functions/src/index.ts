/**
 * YoungVista's Cloud Functions (2nd gen). Every function is a callable that needs a signed-in
 * user; secrets and AI credentials stay on the server. Deployed by GitHub Actions with the
 * website (firebase.json "functions").
 */
import './app';
import { onCall } from 'firebase-functions/v2/https';
import { requireUser } from './auth';

export { requireUser };

/** Says the server is reachable (the app checks it before offering server features). */
export const ping = onCall((request) => {
  requireUser(request.auth);
  return { ok: true, time: new Date().toISOString() };
});

export { aiImage } from './ai-image';
