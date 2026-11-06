import { formatLength, type UnitSystem } from '@youngvista/core';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LuBug, LuCheck, LuCrosshair, LuSkipForward, LuUndo2, LuX } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { ScanSnapshot } from '@/scan/controller';
import { AIM_LABELS, type ScanDerived } from '@/scan/session';

export function TopBar({
  debug,
  onClose,
  onToggleDebug,
}: {
  debug: boolean;
  onClose: () => void;
  onToggleDebug: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <RoundButton icon={LuX} label="Stop scanning" onPress={onClose} />
      <Text className="text-base font-semibold text-white">Scan a room</Text>
      <RoundButton
        icon={LuBug}
        label={debug ? 'Hide debug overlay' : 'Show debug overlay'}
        onPress={onToggleDebug}
        active={debug}
      />
    </View>
  );
}

function RoundButton({
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

/** The one thing to do now. */
export function GuidanceBanner({ derived }: { derived: ScanDerived }) {
  const { message } = derived;
  return (
    <View
      className="items-center gap-1 rounded-2xl bg-black/60 px-4 py-3"
      accessibilityLiveRegion="polite"
    >
      <Text className="text-center text-base font-semibold text-white">{message.title}</Text>
      <Text className="text-center text-sm text-white/85">{message.detail}</Text>
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
  return (
    <View
      className={cn(
        'flex-row items-start gap-2 rounded-2xl px-4 py-3',
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

/** The dot in the middle of the screen, and what tapping Mark would mark there. */
export function Reticle({ derived, units }: { derived: ScanDerived; units: UnitSystem }) {
  if (derived.step === 'floor') {
    return (
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="size-8 rounded-full border-2 border-white/40" />
      </View>
    );
  }
  const ok = derived.aim.ok;
  return (
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
      <View
        className={cn(
          'size-8 items-center justify-center rounded-full border-2',
          ok ? 'border-white' : 'border-amber-400',
        )}
      >
        <View className={cn('size-2 rounded-full', ok ? 'bg-green-400' : 'bg-amber-400')} />
      </View>
      {/* Below the dot, so it never covers what is being aimed at. */}
      <View className="absolute top-1/2 mt-6 rounded-full bg-black/60 px-3 py-1">
        <Text className={cn('text-xs font-medium', ok ? 'text-white' : 'text-amber-300')}>
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
  const { state, derived } = snapshot;
  const step = derived.step;
  return (
    <View className="flex-1 gap-2">
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
      <View className="flex-row gap-2">
        {state.history.length > 0 ? (
          <Button
            variant="outline"
            className="flex-1 border-white/40 bg-black/40"
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
            className="flex-1"
            onPress={onSkipCeiling}
            accessibilityLabel="Skip measuring the ceiling and use 8 feet"
          >
            <Icon as={LuSkipForward} size={16} />
            <Text>Skip, use 8 ft</Text>
          </Button>
        ) : null}
        {step === 'walls' ? (
          <Button variant="secondary" className="flex-1" onPress={onDone}>
            <Icon as={LuCheck} size={16} />
            <Text>Done</Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
