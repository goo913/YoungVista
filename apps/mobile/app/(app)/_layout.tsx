import { Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';

export const unstable_settings = { anchor: 'index' };

export default function AppRoutes() {
  const { user } = useAuth();
  // Signing out: the root guard swaps these screens for sign-in; render nothing meanwhile so no
  // screen runs without a user.
  if (!user) return null;
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Your rooms' }} />
      <Stack.Screen name="rooms/[id]" options={{ title: 'Room' }} />
      <Stack.Screen
        name="scan"
        options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
      />
      <Stack.Screen
        name="review"
        options={{ title: 'Review room', headerBackVisible: false, gestureEnabled: false }}
      />
    </Stack>
  );
}
