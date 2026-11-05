// `firebase/auth` resolves to its React Native build on the phone (Metro picks the
// "react-native" export of @firebase/auth), but TypeScript always reads the web typings, which
// leave out the React Native persistence. This declares it, with the signature from
// node_modules/firebase/node_modules/@firebase/auth/dist/rn/index.rn.d.ts.
import type { Persistence, ReactNativeAsyncStorage } from 'firebase/auth';

declare module 'firebase/auth' {
  /** Keeps the signed-in user in AsyncStorage across app restarts (React Native only). */
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
