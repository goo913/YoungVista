import { Stack } from 'expo-router';

export const unstable_settings = { anchor: 'sign-in' };

export default function AuthRoutes() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
