import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { AppError } from './auth-errors';
import { firebaseAuth } from './firebase';

// Google sign-in through @react-native-google-signin's free "Original" API: the native Google
// window returns an ID token, which signs in to Firebase. Needs the web client ID (for the token)
// and, on iPhone, the iOS client ID plus its URL scheme in Info.plist (app.config.ts). On Android
// the build's signing SHA-1 must be registered in Firebase.

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

let configured = false;

function configure() {
  if (configured) return;
  if (!webClientId) throw new AppError('google/not-configured');
  GoogleSignin.configure({ webClientId, ...(iosClientId ? { iosClientId } : {}) });
  configured = true;
}

/** Turns the library's native error codes into the app's `google/...` codes. */
function translate(error: unknown): unknown {
  if (!isErrorWithCode(error)) return error;
  switch (error.code) {
    case statusCodes.SIGN_IN_CANCELLED:
      return new AppError('google/cancelled');
    case statusCodes.IN_PROGRESS:
      return new AppError('google/in-progress');
    case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
      return new AppError('google/play-services');
    case '7': // Android CommonStatusCodes.NETWORK_ERROR
      return new AppError('google/network');
    case '10': // Android DEVELOPER_ERROR: this build's SHA-1 or client ID is not registered
      return new AppError('google/not-configured', 'Google sign-in is not set up for this build');
    default:
      return error;
  }
}

/** Signs in with Google. Resolves false when the user closes the Google window. */
export async function signInWithGoogle(): Promise<boolean> {
  try {
    configure();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return false;
    const { idToken } = response.data;
    if (!idToken) throw new AppError('google/not-configured', 'Google returned no ID token');
    await signInWithCredential(firebaseAuth(), GoogleAuthProvider.credential(idToken));
    return true;
  } catch (error) {
    const translated = translate(error);
    if (translated instanceof AppError && translated.code === 'google/cancelled') return false;
    throw translated;
  }
}

/** Forgets the Google account so the next Google sign-in can pick another one. */
export async function signOutOfGoogle(): Promise<void> {
  try {
    if (configured || webClientId) {
      configure();
      if (GoogleSignin.hasPreviousSignIn()) await GoogleSignin.signOut();
    }
  } catch {
    // Not signed in with Google, or Google is not set up in this build: nothing to forget.
  }
}
