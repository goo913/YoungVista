import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { sendLeftoverEdits } from '@/lib/rooms';

export const unstable_settings = { anchor: 'index' };

export default function AppRoutes() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  // Edits made offline before the app was last closed: send them (Firestore holds them until the
  // connection is back).
  useEffect(() => {
    if (uid) void sendLeftoverEdits(uid);
  }, [uid]);

  // Signing out: the root guard swaps these screens for sign-in; render nothing meanwhile so no
  // screen runs without a user.
  if (!user) return null;
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Your rooms' }} />
      <Stack.Screen name="rooms/[id]/index" options={{ title: 'Room' }} />
      <Stack.Screen
        name="rooms/[id]/furnish"
        options={{ title: 'Furnish', gestureEnabled: false }}
      />
      <Stack.Screen
        name="rooms/[id]/edit"
        options={{ title: 'Edit room', gestureEnabled: false }}
      />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="credits" options={{ title: '3D model credits' }} />
      <Stack.Screen
        name="scan"
        options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
      />
      <Stack.Screen
        name="rooms/[id]/ar"
        options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
      />
      <Stack.Screen
        name="place"
        options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
      />
    </Stack>
  );
}
