import { FirebaseError } from 'firebase/app';

/**
 * A message to show for a failed sign-in, sign-up or reset, or null when there is nothing to
 * say (the user closed the Google window).
 */
export function authErrorMessage(error: unknown): string | null {
  const code = error instanceof FirebaseError ? error.code : '';
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null;
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password do not match an account.';
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return 'Enter a valid email address.';
    case 'auth/missing-password':
      return 'Enter your password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'Choose a stronger password (at least 6 characters).';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google window. Allow pop-ups for this site and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'This email already signs in another way. Use email and password instead.';
    case 'auth/user-disabled':
      return 'This account has been turned off.';
    case 'auth/operation-not-allowed':
    case 'auth/unauthorized-domain':
      return 'Signing in this way is not available on this site yet.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
