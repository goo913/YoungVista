/**
 * The switch that points a development run of the app at the Firebase emulators instead of the
 * live project, for checks on an Android emulator or a test phone with throwaway accounts and data.
 *
 * Set EXPO_PUBLIC_FIREBASE_EMULATOR_HOST when starting Metro, for example
 * `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=10.0.2.2 npx expo start --dev-client` (10.0.2.2 is the
 * computer as seen from the Android emulator). It only works in development builds: a release
 * build (`__DEV__` false) ignores it, so it can never point at the emulators. With it on, the app
 * uses the demo project `demo-young-vista` and none of the live project's settings.
 */

/** The emulator host to use, or null for the live project. */
export function emulatorHostFor(dev: boolean, value: string | undefined): string | null {
  if (!dev) return null;
  const host = value?.trim();
  return host ? host : null;
}

/** The ports in firebase.emulators.json. */
export const EMULATOR_PORTS = { auth: 9099, firestore: 8080, storage: 9199 } as const;

/** A demo project: the emulators accept it and it can never reach a real one. */
export const EMULATOR_CONFIG = {
  apiKey: 'demo-api-key',
  authDomain: 'demo-young-vista.firebaseapp.com',
  projectId: 'demo-young-vista',
  storageBucket: 'demo-young-vista.appspot.com',
  messagingSenderId: '0',
  appId: '1:0:web:0',
} as const;
