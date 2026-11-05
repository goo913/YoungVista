import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { AuthContext, type AuthState } from '@/lib/auth';
import { firebaseAuth } from '@/lib/firebase';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });
  useEffect(
    () => onAuthStateChanged(firebaseAuth(), (user) => setState({ user, loading: false })),
    [],
  );
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
