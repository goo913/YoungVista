// Friendly messages for sign-in errors. Firebase codes as on the website (apps/web/src/lib/
// auth-errors.ts), plus the phone's Google sign-in errors, which lib/google.ts reports with the
// `google/...` codes below.

/** An error with a `code` the app chose, like Firebase's. */
export class AppError extends Error {
  readonly code: string;
  constructor(code: string, message = code) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code: unknown };
    if (typeof code === 'string') return code;
    if (typeof code === 'number') return String(code);
  }
  return '';
}

/**
 * A message to show for a failed sign-in, sign-up or reset, or null when there is nothing to
 * say (the user closed the Google window).
 */
export function authErrorMessage(error: unknown): string | null {
  switch (errorCode(error)) {
    case 'google/cancelled':
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
    case 'google/network':
      return 'No connection. Check your internet and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'This email already signs in another way. Use email and password instead.';
    case 'auth/user-disabled':
      return 'This account has been turned off.';
    case 'auth/operation-not-allowed':
    case 'google/not-configured':
      return 'Signing in this way is not set up in this version of the app yet. Use email and password.';
    case 'google/in-progress':
      return 'Google sign-in is already open.';
    case 'google/play-services':
      return 'Google Play services are missing or out of date on this phone. Update them and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
