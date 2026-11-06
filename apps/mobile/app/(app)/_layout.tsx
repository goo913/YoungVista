import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { ToastHost } from '@/components/toast-host';
import { useAuth } from '@/lib/auth';
import { pictureUploads } from '@/lib/pictures';
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

  // Pictures not uploaded yet (taken offline, or the app was closed): upload them, and try again
  // whenever the app comes back to the front.
  useEffect(() => {
    void pictureUploads.start(uid);
  }, [uid]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') pictureUploads.retryNow();
    });
    return () => sub.remove();
  }, []);

  // Signing out: the root guard swaps these screens for sign-in; render nothing meanwhile so no
  // screen runs without a user.
  if (!user) return null;
  return (
    // Short confirmations (lib/toast.ts) show over every screen of the stack.
    <View style={{ flex: 1 }}>
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
      <ToastHost />
    </View>
  );
}
