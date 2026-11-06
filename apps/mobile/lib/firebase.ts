import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { emulatorHostFor, EMULATOR_CONFIG, EMULATOR_PORTS } from './emulator';

// Expo inlines EXPO_PUBLIC_* from apps/mobile/.env at build time; each must be read by its full
// name. These are the Firebase web app settings (the app uses the Firebase JS SDK).
const settings = {
  EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Development runs only: the host of the Firebase emulators (see lib/emulator.ts), or null for
 * the live project. Release builds always get null.
 */
export const emulatorHost: string | null = emulatorHostFor(
  typeof __DEV__ !== 'undefined' && __DEV__,
  process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,
);

/** Names (never values) of Firebase settings missing from the build. */
export const missingFirebaseSettings: string[] = emulatorHost
  ? []
  : Object.entries(settings)
      .filter(([, value]) => !value)
      .map(([name]) => name);

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

export function firebaseApp(): FirebaseApp {
  app ??=
    getApps().length > 0
      ? getApp()
      : initializeApp(
          // With the emulators, nothing of the live project is used, not even its API key.
          emulatorHost
            ? EMULATOR_CONFIG
            : {
                apiKey: settings.EXPO_PUBLIC_FIREBASE_API_KEY,
                authDomain: settings.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
                projectId: settings.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
                storageBucket: settings.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
                messagingSenderId: settings.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
                appId: settings.EXPO_PUBLIC_FIREBASE_APP_ID,
              },
        );
  return app;
}

/** Firebase Auth that remembers the user between launches. */
export function firebaseAuth(): Auth {
  if (!auth) {
    try {
      auth = initializeAuth(firebaseApp(), {
        persistence: getReactNativePersistence(AsyncStorage),
      });
      if (emulatorHost) {
        connectAuthEmulator(auth, `http://${emulatorHost}:${EMULATOR_PORTS.auth}`, {
          disableWarnings: true,
        });
      }
    } catch {
      // Fast Refresh reloads this module while Firebase keeps its Auth instance (already
      // connected to the emulator if it should be).
      auth = getAuth(firebaseApp());
    }
  }
  return auth;
}

export function firestore(): Firestore {
  if (!db) {
    db = getFirestore(firebaseApp());
    if (emulatorHost) {
      try {
        connectFirestoreEmulator(db, emulatorHost, EMULATOR_PORTS.firestore);
      } catch {
        // Fast Refresh: this Firestore instance is already connected.
      }
    }
  }
  return db;
}
