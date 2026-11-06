/**
 * `aiImage`: makes an AI picture of one of the caller's rooms (core's ai-picture.ts says what
 * the apps send and get back; make-picture.ts how it is made). A signed-in user only, for a room
 * they own, within a daily limit.
 *
 * Its options are set here, not taken from `setGlobalOptions`: index.ts imports this module
 * before it sets them. The model can take a minute, so the function may run 5 minutes; images
 * are held in memory, so each instance takes a few requests at a time.
 */
import { onCall } from 'firebase-functions/v2/https';
import { firebaseDeps } from './firebase';
import { aiError, makeAiPicture } from './make-picture';

export const aiImage = onCall(
  {
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 300,
    concurrency: 8,
    maxInstances: 10,
  },
  (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw aiError('signed-out', 'unauthenticated', 'Sign in first.');
    return makeAiPicture(uid, request.data, firebaseDeps());
  },
);
