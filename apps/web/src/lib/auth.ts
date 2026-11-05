import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';

export interface AuthState {
  user: User | null;
  /** True until Firebase has restored (or ruled out) a signed-in session. */
  loading: boolean;
}

export const AuthContext = createContext<AuthState>({ user: null, loading: true });

export const useAuth = (): AuthState => useContext(AuthContext);
