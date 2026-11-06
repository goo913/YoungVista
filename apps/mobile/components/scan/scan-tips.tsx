/**
 * Four short tips before the first scan (lib/scan-tips.ts): good light, start facing a wall, aim
 * where the wall meets the floor, and the top edge when furniture is in the way.
 *
 * - `ScanTips` goes over the scan screen, once per phone: the camera starts behind it.
 * - `ScanTipsSheet` shows them again, from Settings.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LuArrowUpToLine, LuBrickWall, LuCrosshair, LuLightbulb, LuX } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  SCAN_TIPS,
  SCAN_TIPS_KEY,
  shouldShowTips,
  tipsSeenText,
  type ScanTipId,
} from '@/lib/scan-tips';

const TIP_ICONS: Record<ScanTipId, IconType> = {
  light: LuLightbulb,
  wall: LuBrickWall,
  edge: LuCrosshair,
  top: LuArrowUpToLine,
};

/** The tips, one under the other. */
export function ScanTipsList() {
  return (
    <View className="gap-4">
      {SCAN_TIPS.map((tip, i) => (
        <View
          key={tip.id}
          className="flex-row items-start gap-3"
          accessible
          accessibilityLabel={`Tip ${i + 1}: ${tip.title}. ${tip.detail}`}
        >
          <View className="bg-muted size-9 items-center justify-center rounded-full">
            <Icon as={TIP_ICONS[tip.id]} size={18} className="text-foreground" />
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-sm font-semibold">{tip.title}</Text>
            <Text className="text-muted-foreground text-sm">{tip.detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Over the scan screen before this phone's first scan; "Got it" puts it away for good. */
export function ScanTips() {
  const insets = useSafeAreaInsets();
  // undefined while reading the flag, then the stored value (null: never seen).
  const [stored, setStored] = useState<string | null | undefined>(undefined);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(SCAN_TIPS_KEY).then(
      (value) => live && setStored(value),
      () => live && setStored(null),
    );
    return () => {
      live = false;
    };
  }, []);

  if (closed || !shouldShowTips(stored)) return null;

  const close = () => {
    setClosed(true);
    AsyncStorage.setItem(SCAN_TIPS_KEY, tipsSeenText(Date.now())).catch(() => {
      // Not remembered: the tips show once more next time, which does no harm.
    });
  };

  return (
    <View
      className="absolute inset-0 justify-end bg-black/60 px-3"
      style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }}
    >
      <View className="bg-background max-h-full rounded-2xl" accessibilityViewIsModal>
        <ScrollView contentContainerClassName="gap-5 p-5" bounces={false}>
          <View className="gap-1">
            <Text className="text-lg font-semibold" role="heading">
              Before you scan
            </Text>
            <Text className="text-muted-foreground text-sm">Four tips for a good floor plan.</Text>
          </View>
          <ScanTipsList />
          <View className="gap-2">
            <Button size="lg" onPress={close}>
              <Text>Got it</Text>
            </Button>
            <Text className="text-muted-foreground text-center text-xs">
              You can see these tips again in Settings.
            </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

/** The tips as a sheet, from Settings. */
export function ScanTipsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="bg-background flex-1" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between gap-2 px-4 pb-2 pt-3">
          <Text className="flex-1 text-lg font-semibold" role="heading">
            Scanning tips
          </Text>
          <Button variant="ghost" size="icon" onPress={onClose} accessibilityLabel="Close">
            <Icon as={LuX} size={20} />
          </Button>
        </View>
        <ScrollView contentContainerClassName="gap-6 p-4">
          <ScanTipsList />
          <Button size="lg" onPress={onClose}>
            <Text>Done</Text>
          </Button>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
