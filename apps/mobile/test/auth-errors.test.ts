import { describe, expect, it } from 'vitest';
import { AppError, authErrorMessage, errorCode } from '@/lib/auth-errors';

describe('authErrorMessage', () => {
  it('says nothing when the user closed the Google window', () => {
    expect(authErrorMessage(new AppError('google/cancelled'))).toBeNull();
  });

  it('explains Firebase and Google errors in plain words', () => {
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toBe(
      'That email and password do not match an account.',
    );
    expect(authErrorMessage({ code: 'auth/email-already-in-use' })).toMatch(/Sign in instead/);
    expect(authErrorMessage(new AppError('google/play-services'))).toMatch(/Google Play services/);
    expect(authErrorMessage(new AppError('google/not-configured'))).toMatch(/not set up/);
    expect(authErrorMessage(new AppError('google/network'))).toMatch(/No connection/);
  });

  it('falls back to a generic message', () => {
    expect(authErrorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
    expect(authErrorMessage(undefined)).toBe('Something went wrong. Please try again.');
  });

  it('reads string and numeric codes', () => {
    expect(errorCode({ code: 10 })).toBe('10');
    expect(errorCode({ code: 'x' })).toBe('x');
    expect(errorCode('auth/x')).toBe('');
  });
});
