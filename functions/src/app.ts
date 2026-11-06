/**
 * Runs before any function is defined (index.ts imports it first): the Admin SDK and the options
 * every function shares. Options set later would miss functions defined in other files.
 */
import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });
