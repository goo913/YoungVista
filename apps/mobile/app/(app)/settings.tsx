import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert as NativeAlert, Pressable, ScrollView, View } from 'react-native';
import { LuChevronRight, LuFlaskConical, LuLogOut } from 'react-icons/lu';
import { ScanTipsSheet } from '@/components/scan/scan-tips';
import { UnitsToggle } from '@/components/units-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { signOut, useUser } from '@/lib/auth';
import { emulatorHost } from '@/lib/firebase';
import { useUnits } from '@/lib/units';

export default function SettingsScreen() {
  const user = useUser();
  const router = useRouter();
  const [units, setUnits] = useUnits();
  const [tips, setTips] = useState(false);

  const confirmSignOut = () => {
    NativeAlert.alert('Sign out?', user.email ? `You are signed in as ${user.email}.` : undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <ScrollView className="bg-background flex-1" contentContainerClassName="gap-4 p-4 pb-10">
      {emulatorHost ? (
        <Alert icon={LuFlaskConical}>
          <AlertDescription>
            Development run: using the Firebase emulators on {emulatorHost}, not the live project.
          </AlertDescription>
        </Alert>
      ) : null}
      <Card className="py-2">
        <CardContent className="px-4">
          <View className="flex-row items-center justify-between gap-4 py-3">
            <View className="flex-1">
              <Text className="text-sm font-medium">Units</Text>
              <Text className="text-muted-foreground text-xs">Feet and inches, or metres</Text>
            </View>
            <UnitsToggle value={units} onChange={setUnits} />
          </View>
          <Separator />
          <Pressable
            onPress={() => setTips(true)}
            accessibilityRole="button"
            className="flex-row items-center justify-between gap-4 py-3 active:opacity-70"
          >
            <View className="flex-1">
              <Text className="text-sm font-medium">Scanning tips</Text>
              <Text className="text-muted-foreground text-xs">
                The four tips shown before your first scan
              </Text>
            </View>
            <Icon as={LuChevronRight} size={18} className="text-muted-foreground" />
          </Pressable>
          <Separator />
          <Pressable
            onPress={() => router.push('/credits')}
            accessibilityRole="button"
            className="flex-row items-center justify-between gap-4 py-3 active:opacity-70"
          >
            <View className="flex-1">
              <Text className="text-sm font-medium">3D model credits</Text>
              <Text className="text-muted-foreground text-xs">
                Who made the furniture models, and their licences
              </Text>
            </View>
            <Icon as={LuChevronRight} size={18} className="text-muted-foreground" />
          </Pressable>
        </CardContent>
      </Card>
      <View className="gap-2">
        <Text className="text-muted-foreground text-xs">
          Signed in as {user.email ?? 'an account without an email'}
        </Text>
        <Button variant="outline" onPress={confirmSignOut}>
          <Icon as={LuLogOut} size={16} />
          <Text>Sign out</Text>
        </Button>
      </View>
      <ScanTipsSheet visible={tips} onClose={() => setTips(false)} />
    </ScrollView>
  );
}
