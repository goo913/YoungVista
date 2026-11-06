import { formatLength, type UnitSystem } from '@youngvista/core';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LuCheck, LuCrosshair, LuSkipForward, LuUndo2, LuX } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { useLandscape } from '@/components/camera-hud';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { Message } from '@/scan/coaching';
import type { ScanSnapshot } from '@/scan/controller';
import { AIM_LABELS, type ScanDerived } from '@/scan/session';

/** A round icon button over the camera view. */
export function RoundButton({
  icon,
  label,
  onPress,
  active,
}: {
  icon: IconType;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className={cn('rounded-full bg-black/45', active && 'bg-white')}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
    >
      <Icon as={icon} size={20} className={active ? 'text-black' : 'text-white'} />
    </Button>
  );
}

/**
 * The one thing to do now. In landscape the text is a size smaller, so that two messages at the
 * top still end above the dot in the middle.
 */
export function GuidanceBanner({ message }: { message: Message }) {
  const landscape = useLandscape();
  return (
    <View
      className={cn('items-center gap-1 rounded-2xl bg-black/60 px-4', landscape ? 'py-2' : 'py-3')}
      accessibilityLiveRegion="polite"
    >
      <Text
        className={cn('text-center font-semibold text-white', landscape ? 'text-sm' : 'text-base')}
      >
        {message.title}
      </Text>
      <Text className={cn('text-center text-white/85', landscape ? 'text-xs' : 'text-sm')}>
        {message.detail}
      </Text>
    </View>
  );
}

export function Notice({
  tone,
  children,
  onDismiss,
}: {
  tone: 'info' | 'error';
  children: ReactNode;
  onDismiss: () => void;
}) {
  const landscape = useLandscape();
  return (
    <View
      className={cn(
        'flex-row items-start gap-2 rounded-2xl px-4',
        landscape ? 'py-2' : 'py-3',
        tone === 'error' ? 'bg-red-600/90' : 'bg-black/70',
      )}
      accessibilityRole="alert"
    >
      <Text className="flex-1 text-sm text-white">{children}</Text>
      <Button
        size="icon"
        variant="ghost"
        className="size-6"
        onPress={onDismiss}
        accessibilityLabel="Dismiss"
      >
        <Icon as={LuX} size={16} className="text-white" />
      </Button>
    </View>
  );
}

/** What the dot would mark: "Bottom edge · 5′ 3″", or what is wrong with the aim. */
export function aimLabel(derived: ScanDerived, units: UnitSystem): string {
  const { aim, step } = derived;
  if (!aim.ok) return AIM_LABELS[aim.error];
  if (step === 'ceiling' && aim.ceilingHeight !== null) {
    return `Top of the wall · ${formatLength(aim.ceilingHeight, units)} high`;
  }
  return `${aim.edge === 'floor' ? 'Bottom edge' : 'Top edge'} · ${formatLength(aim.distance, units)}`;
}

/**
 * The dot in the middle of the screen, and what tapping Mark would mark there. It is the middle
 * of the camera view whichever way the phone is held: the aim is the camera's forward ray
 * (scan/geometry.ts `rayFromCamera`), which turning the phone in the hand does not move.
 */
export function Reticle({ derived, units }: { derived: ScanDerived; units: UnitSystem }) {
  const landscape = useLandscape();
  if (derived.step === 'floor') {
    return (
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="size-8 rounded-full border-2 border-white/40" />
      </View>
    );
  }
  const ok = derived.aim.ok;
  // Short level lines either side of the ring: laying them along the edge where the wall meets
  // the floor or the ceiling puts the dot exactly on it. Longer in landscape, where the view is
  // wide: easier to lay along the edge.
  const bar = cn(
    'h-0.5 rounded-full',
    landscape ? 'w-16' : 'w-10',
    ok ? 'bg-white/80' : 'bg-amber-400/80',
  );
  return (
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
      <View className="flex-row items-center gap-1.5">
        <View className={bar} />
        <View
          className={cn(
            'size-8 items-center justify-center rounded-full border-2',
            ok ? 'border-white' : 'border-amber-400',
          )}
        >
          <View className={cn('size-2 rounded-full', ok ? 'bg-green-400' : 'bg-amber-400')} />
        </View>
        <View className={bar} />
      </View>
      {/* Below the dot, so it never covers what is being aimed at; narrow enough to stay clear
          of the controls at the side in landscape (a long label wraps). */}
      <View className="absolute top-1/2 mt-6 max-w-[260px] rounded-full bg-black/60 px-3 py-1">
        <Text
          className={cn('text-center text-xs font-medium', ok ? 'text-white' : 'text-amber-300')}
        >
          {aimLabel(derived, units)}
        </Text>
      </View>
    </View>
  );
}

const MARK_TEXT: Record<ScanDerived['step'], string> = {
  floor: 'Mark',
  'first-wall': 'Mark',
  'second-mark': 'Mark again',
  ceiling: 'Mark the top',
  walls: 'Mark wall',
};

function progressText(derived: ScanDerived): string {
  switch (derived.step) {
    case 'floor':
      return 'Finding the floor';
    case 'first-wall':
      return 'First wall: 0 of 2 marks';
    case 'second-mark':
      return 'First wall: 1 of 2 marks';
    case 'ceiling':
      return 'Ceiling height';
    case 'walls': {
      const n = derived.grouped?.walls.length ?? 0;
      return `${n} wall${n === 1 ? '' : 's'} marked${derived.closed ? ' · room closed' : ''}`;
    }
  }
}

export function ScanControls({
  snapshot,
  onMarkPressIn,
  onMark,
  onUndo,
  onSkipCeiling,
  onDone,
}: {
  snapshot: ScanSnapshot;
  /** The finger touched Mark: the aim is taken from just before (see ScanController.holdAim). */
  onMarkPressIn: () => void;
  onMark: () => void;
  onUndo: () => void;
  onSkipCeiling: () => void;
  onDone: () => void;
}) {
  const landscape = useLandscape();
  const { state, derived } = snapshot;
  const step = derived.step;
  // Upright: Undo and Skip or Done side by side under Mark. Landscape (a narrow column at the
  // right): side by side when they fit, else "Skip, use 8 ft" on a row of its own.
  const each = landscape ? 'grow' : 'flex-1';
  return (
    <View className={cn('gap-2', !landscape && 'flex-1')}>
      <Text className="text-xs text-white/85">{progressText(derived)}</Text>
      <Button
        size="lg"
        onPressIn={onMarkPressIn}
        onPress={onMark}
        disabled={step === 'floor'}
        accessibilityHint="Marks the spot under the dot in the middle of the screen."
      >
        <Icon as={LuCrosshair} size={18} />
        <Text>{MARK_TEXT[step]}</Text>
      </Button>
      <View className={cn('flex-row gap-2', landscape && 'flex-wrap')}>
        {state.history.length > 0 ? (
          <Button
            variant="outline"
            className={cn(each, 'border-white/40 bg-black/40')}
            onPress={onUndo}
            accessibilityLabel="Undo the last mark"
          >
            <Icon as={LuUndo2} size={16} className="text-white" />
            <Text className="text-white">Undo</Text>
          </Button>
        ) : null}
        {step === 'ceiling' ? (
          <Button
            variant="secondary"
            className={each}
            onPress={onSkipCeiling}
            accessibilityLabel="Skip measuring the ceiling and use 8 feet"
          >
            <Icon as={LuSkipForward} size={16} />
            <Text>Skip, use 8 ft</Text>
          </Button>
        ) : null}
        {step === 'walls' ? (
          <Button variant="secondary" className={each} onPress={onDone}>
            <Icon as={LuCheck} size={16} />
            <Text>Done</Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
