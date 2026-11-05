import { Link, Stack } from 'expo-router';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: true }} />
      <View className="bg-background flex-1 items-center justify-center gap-4 p-6">
        <Text className="text-lg font-semibold">This screen does not exist.</Text>
        <Link href="/" asChild replace>
          <Button>
            <Text>Go to your rooms</Text>
          </Button>
        </Link>
      </View>
    </>
  );
}
