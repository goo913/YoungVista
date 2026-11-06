import '../global.css';

import { PortalHost } from '@rn-primitives/portal';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SetupNeeded } from '@/components/setup-needed';
import { AuthProvider, useAuth } from '@/lib/auth';
import { missingFirebaseSettings } from '@/lib/firebase';
import { NAV_THEME } from '@/lib/theme';
import { UnitsProvider } from '@/lib/units';

export { ErrorBoundary } from 'expo-router';

// Keep the splash screen up until Firebase has restored (or ruled out) a signed-in user.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  return (
    // Drags and two-finger turns in the plan, the 3D view and the room editor need this root.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={NAV_THEME[scheme]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {missingFirebaseSettings.length > 0 ? (
          <SetupNeeded names={missingFirebaseSettings} />
        ) : (
          <AuthProvider>
            <UnitsProvider>
              <Routes />
            </UnitsProvider>
          </AuthProvider>
        )}
        <PortalHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/** Signed-out users only reach the (auth) screens, signed-in users only the (app) screens. */
function Routes() {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);
  if (loading) return null;
  return (
    // Every screen says its orientation (one that does not turns freely): upright, except the
    // camera screens in app/(app)/_layout.tsx.
    <Stack screenOptions={{ headerShown: false, orientation: 'portrait_up' }}>
      <Stack.Protected guard={user !== null}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={user === null}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
