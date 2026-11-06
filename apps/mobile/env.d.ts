/// <reference types="expo/types" />

// Firebase and Google settings, inlined by Expo at build time from apps/mobile/.env.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_FIREBASE_API_KEY?: string;
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
    EXPO_PUBLIC_FIREBASE_PROJECT_ID?: string;
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
    EXPO_PUBLIC_FIREBASE_APP_ID?: string;
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?: string;
    /** Development runs only: use the Firebase emulators on this host (lib/emulator.ts). */
    EXPO_PUBLIC_FIREBASE_EMULATOR_HOST?: string;
  }
}
