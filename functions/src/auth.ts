import { HttpsError } from 'firebase-functions/v2/https';

/** A signed-in user's uid, or a refusal. */
export function requireUser(auth: { uid: string } | undefined): string {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  return auth.uid;
}
