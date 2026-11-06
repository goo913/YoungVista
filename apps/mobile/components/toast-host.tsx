/**
 * Draws the toast showing now (lib/toast.ts) at the bottom of the screen, above the home bar, over
 * the app's screens. Full-screen camera views have their own messages.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LuCircleCheck, LuInfo, LuTriangleAlert, LuX } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TOAST_MS, toasts, useToast, type ToastTone } from '@/lib/toast';
import { cn } from '@/lib/utils';

const ICON: Record<ToastTone, IconType> = {
  success: LuCircleCheck,
  info: LuInfo,
  error: LuTriangleAlert,
};

export function ToastHost() {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => toasts.dismiss(toast.id), TOAST_MS[toast.tone]);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 px-4"
      style={{ paddingBottom: insets.bottom + 16 }}
    >
      <View
        className={cn(
          'flex-row items-center gap-3 rounded-xl px-4 py-3 shadow-lg shadow-black/20',
          toast.tone === 'error' ? 'bg-destructive' : 'bg-foreground',
        )}
        accessible
        accessibilityRole={toast.tone === 'error' ? 'alert' : 'text'}
        accessibilityLiveRegion="polite"
        accessibilityLabel={toast.detail ? `${toast.title}. ${toast.detail}` : toast.title}
      >
        <Icon
          as={ICON[toast.tone]}
          size={20}
          className={toast.tone === 'success' ? 'text-green-400' : 'text-background'}
        />
        <View className="flex-1 gap-0.5">
          <Text
            className={cn(
              'text-sm font-semibold',
              toast.tone === 'error' ? 'text-white' : 'text-background',
            )}
          >
            {toast.title}
          </Text>
          {toast.detail ? (
            <Text
              className={cn(
                'text-xs',
                toast.tone === 'error' ? 'text-white/85' : 'text-background/80',
              )}
            >
              {toast.detail}
            </Text>
          ) : null}
        </View>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onPress={() => toasts.dismiss(toast.id)}
          accessibilityLabel="Dismiss"
        >
          <Icon
            as={LuX}
            size={16}
            className={toast.tone === 'error' ? 'text-white' : 'text-background'}
          />
        </Button>
      </View>
    </View>
  );
}
