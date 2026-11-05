import { Suspense, lazy, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppLayout } from '@/components/app-layout';
import { AuthProvider } from '@/components/auth-provider';
import { PageSpinner } from '@/components/page-spinner';
import { GuestOnly, RequireAuth } from '@/components/route-guards';
import { missingFirebaseSettings } from '@/lib/firebase';
import { ConfigMissingPage } from '@/pages/config-missing-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { ResetPasswordPage } from '@/pages/reset-password-page';
import { SignInPage } from '@/pages/sign-in-page';
import { SignUpPage } from '@/pages/sign-up-page';

// Signed-in pages load Firestore, so they are split into their own chunk.
const RoomsPage = lazy(() => import('@/pages/rooms-page').then((m) => ({ default: m.RoomsPage })));
const RoomRoute = lazy(() => import('@/pages/room-page').then((m) => ({ default: m.RoomRoute })));

const suspended = (element: ReactNode) => <Suspense fallback={<PageSpinner />}>{element}</Suspense>;

const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/sign-up', element: <SignUpPage /> },
    ],
  },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: suspended(<RoomsPage />) },
          { path: '/rooms/:roomId', element: suspended(<RoomRoute />) },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);

export function App() {
  if (missingFirebaseSettings.length > 0)
    return <ConfigMissingPage missing={missingFirebaseSettings} />;
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
