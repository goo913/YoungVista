interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** Local development only: use the Firebase emulators on this host (e.g. `127.0.0.1`). */
  readonly VITE_FIREBASE_EMULATOR_HOST?: string;
  /** Local development only: the emulators' ports, when not the defaults (9099, 8080, 9199). */
  readonly VITE_FIREBASE_EMULATOR_AUTH_PORT?: string;
  readonly VITE_FIREBASE_EMULATOR_FIRESTORE_PORT?: string;
  readonly VITE_FIREBASE_EMULATOR_STORAGE_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
