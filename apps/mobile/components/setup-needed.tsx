import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LuSettings } from 'react-icons/lu';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Text } from '@/components/ui/text';

/** Shown by a build made without apps/mobile/.env: lists the missing names, never values. */
export function SetupNeeded({ names }: { names: string[] }) {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return (
    <SafeAreaView className="bg-background flex-1 justify-center p-6">
      <Alert icon={LuSettings}>
        <AlertTitle>This build is missing its Firebase settings</AlertTitle>
        <AlertDescription>
          Copy apps/mobile/.env.example to apps/mobile/.env, fill it in, and build the app again.
        </AlertDescription>
        <View className="gap-1 pb-2 pl-6 pt-2">
          {names.map((name) => (
            <Text key={name} className="font-mono text-xs">
              {name}
            </Text>
          ))}
        </View>
      </Alert>
    </SafeAreaView>
  );
}
