import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LuHouse } from 'react-icons/lu';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** Sign-in, sign-up and reset screens: the app name, then a card, scrolling above the keyboard. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="bg-background flex-1">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="grow justify-center gap-6 p-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center gap-2">
            <View className="bg-primary size-12 items-center justify-center rounded-xl">
              <Icon as={LuHouse} size={24} className="text-primary-foreground" />
            </View>
            <Text className="text-2xl font-semibold tracking-tight">YoungVista</Text>
            <Text className="text-muted-foreground text-center text-sm">
              Scan a room and see furniture in it at real size.
            </Text>
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
