import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/lib/auth';
import { PageSpinner } from './page-spinner';

interface FromState {
  from?: string;
}

/** Shows its routes only to signed-in users; others go to sign in and come back afterwards. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageSpinner />;
  if (!user) {
    return (
      <Navigate to="/sign-in" replace state={{ from: location.pathname } satisfies FromState} />
    );
  }
  return <Outlet />;
}

/** Sign-in and sign-up pages: once signed in, continue to where the user was going. */
export function GuestOnly() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageSpinner />;
  if (user) {
    const from = (location.state as FromState | null)?.from;
    return <Navigate to={from && from.startsWith('/') ? from : '/'} replace />;
  }
  return <Outlet />;
}
