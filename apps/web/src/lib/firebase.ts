import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const settings = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Names (never values) of Firebase settings missing from the environment. */
export const missingFirebaseSettings: string[] = Object.entries(settings)
  .filter(([, value]) => !value)
  .map(([name]) => name);

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

export function firebaseApp(): FirebaseApp {
  app ??= initializeApp({
    apiKey: settings.VITE_FIREBASE_API_KEY,
    authDomain: settings.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: settings.VITE_FIREBASE_PROJECT_ID,
    storageBucket: settings.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: settings.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: settings.VITE_FIREBASE_APP_ID,
  });
  return app;
}

export function firebaseAuth(): Auth {
  auth ??= getAuth(firebaseApp());
  return auth;
}
