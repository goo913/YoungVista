import type { User } from 'firebase/auth';
import { useAuth } from './auth';

/** The signed-in user, for pages behind `RequireAuth`. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser() needs a signed-in user (use it under RequireAuth).');
  return user;
}
