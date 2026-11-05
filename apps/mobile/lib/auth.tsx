import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { firebaseAuth } from './firebase';
import { signOutOfGoogle } from './google';

export interface AuthState {
  user: User | null;
  /** True until Firebase has restored (or ruled out) a signed-in session. */
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });
  useEffect(
    () => onAuthStateChanged(firebaseAuth(), (user) => setState({ user, loading: false })),
    [],
  );
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthState => useContext(AuthContext);

/** The signed-in user. Only for screens behind the signed-in route guard. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser() needs a signed-in user');
  return user;
}

export async function signOut(): Promise<void> {
  await signOutOfGoogle();
  await firebaseSignOut(firebaseAuth());
}
