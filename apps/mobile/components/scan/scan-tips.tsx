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
import { useLandscape } from '@/components/camera-hud';
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
import { cn } from '@/lib/utils';

const TIP_ICONS: Record<ScanTipId, IconType> = {
  light: LuLightbulb,
  wall: LuBrickWall,
  edge: LuCrosshair,
  top: LuArrowUpToLine,
};

/** The tips, one under the other, or two side by side (in rows, read left to right). */
export function ScanTipsList({ columns = 1 }: { columns?: 1 | 2 }) {
  return (
    <View className={cn('gap-4', columns === 2 && 'flex-row flex-wrap gap-x-0')}>
      {SCAN_TIPS.map((tip, i) => (
        <View
          key={tip.id}
          className={cn(
            'flex-row items-start gap-3',
            columns === 2 && (i % 2 === 0 ? 'w-1/2 pr-3' : 'w-1/2 pl-3'),
          )}
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

/**
 * Over the scan screen before this phone's first scan; "Got it" puts it away for good. In
 * landscape (the scan's way) the tips stand in two columns, so they fit without scrolling.
 */
export function ScanTips() {
  const insets = useSafeAreaInsets();
  const landscape = useLandscape();
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
      className={cn(
        'absolute inset-0 bg-black/60',
        landscape ? 'items-center justify-center' : 'justify-end px-3',
      )}
      style={
        landscape
          ? {
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 12,
              paddingLeft: insets.left + 12,
              paddingRight: insets.right + 12,
            }
          : { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }
      }
    >
      <View
        className={cn('bg-background max-h-full rounded-2xl', landscape && 'w-full max-w-2xl')}
        accessibilityViewIsModal
      >
        <ScrollView
          contentContainerClassName={landscape ? 'gap-4 p-4' : 'gap-5 p-5'}
          bounces={false}
        >
          <View className="gap-1">
            <Text className="text-lg font-semibold" role="heading">
              Before you scan
            </Text>
            <Text className="text-muted-foreground text-sm">Four tips for a good floor plan.</Text>
          </View>
          <ScanTipsList columns={landscape ? 2 : 1} />
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
