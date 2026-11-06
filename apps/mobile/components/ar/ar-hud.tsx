/**
 * Pieces of the AR screens drawn over the camera: the close button, the dot in the middle with
 * what it is on, messages, and the card with the controls. components/camera-hud.tsx places
 * them, upright or in landscape.
 */
import { formatLength, type UnitSystem } from '@youngvista/core';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LuX } from 'react-icons/lu';
import { useLandscape } from '@/components/camera-hud';
import { RoundButton } from '@/components/scan/scan-hud';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { FloorAim } from '@/ar/controller';
import { cn } from '@/lib/utils';
import { STEP_MESSAGES, type Message } from '@/scan/coaching';
import type { FloorStatus } from '@/scan/floor';

/** The scan's floor messages: "Point at the floor", or "That looks like furniture". */
export function floorMessage(status: FloorStatus): Message | null {
  if (status === 'found') return null;
  return status === 'too-high' ? STEP_MESSAGES['too-high'] : STEP_MESSAGES.searching;
}

/** The round button that leaves the camera view. */
export function CloseButton({
  onClose,
  label = 'Close the camera view',
}: {
  onClose: () => void;
  label?: string;
}) {
  return <RoundButton icon={LuX} label={label} onPress={onClose} />;
}

/** What the dot is on: "Floor · 2′ 3″ away", or what to do instead. */
export function aimLabel(aim: FloorAim, units: UnitSystem, what = 'Floor'): string {
  if (aim.ok) return `${what} · ${formatLength(aim.distance, units)} away`;
  switch (aim.reason) {
    case 'no-camera':
      return 'Starting…';
    case 'no-floor':
      return 'Find the floor first';
    case 'aim-lower':
      return 'Aim lower, at the floor';
    case 'too-far':
      return 'Too far away';
  }
}

/**
 * The dot in the middle of the screen, and a label below it: the camera's forward ray, the
 * middle of the view whichever way the phone is held. The label is narrow enough to stay clear
 * of the controls at the side in landscape (a long one wraps).
 */
export function ArReticle({ ok, label }: { ok: boolean; label: string | null }) {
  return (
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
      <View
        className={cn(
          'size-8 items-center justify-center rounded-full border-2',
          ok ? 'border-white' : 'border-white/40',
        )}
      >
        <View className={cn('size-2 rounded-full', ok ? 'bg-green-400' : 'bg-white/40')} />
      </View>
      {label ? (
        <View className="absolute top-1/2 mt-6 max-w-[260px] rounded-full bg-black/60 px-3 py-1">
          <Text
            className={cn('text-center text-xs font-medium', ok ? 'text-white' : 'text-amber-300')}
          >
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export interface BannerAction {
  label: string;
  onPress: () => void;
}

/**
 * A message over the camera view: what to do now, or what just happened. In landscape the text
 * is a size smaller, so that two messages at the top still end above the dot in the middle.
 */
export function ArBanner({
  tone = 'info',
  title,
  detail,
  action,
  onDismiss,
}: {
  tone?: 'info' | 'error' | 'success';
  title: string;
  detail?: string | null;
  action?: BannerAction;
  onDismiss?: () => void;
}) {
  const landscape = useLandscape();
  return (
    <View
      className={cn(
        'flex-row items-center gap-3 rounded-2xl px-4',
        landscape ? 'py-2' : 'py-3',
        tone === 'error' ? 'bg-red-600/90' : tone === 'success' ? 'bg-green-700/90' : 'bg-black/60',
      )}
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
    >
      <View className="flex-1 gap-0.5">
        <Text className={cn('font-semibold text-white', landscape ? 'text-sm' : 'text-base')}>
          {title}
        </Text>
        {detail ? (
          <Text className={cn('text-white/85', landscape ? 'text-xs' : 'text-sm')}>{detail}</Text>
        ) : null}
      </View>
      {action ? (
        <Button size="sm" variant="secondary" onPress={action.onPress}>
          <Text>{action.label}</Text>
        </Button>
      ) : null}
      {onDismiss ? (
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onPress={onDismiss}
          accessibilityLabel="Dismiss"
        >
          <Icon as={LuX} size={16} className="text-white" />
        </Button>
      ) : null}
    </View>
  );
}

/** The card at the bottom of the AR screens. */
export function ArCard({ children }: { children: ReactNode }) {
  return <View className="bg-background gap-3 rounded-2xl p-4">{children}</View>;
}
