import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LuBug, LuCheck, LuPlus, LuUndo2, LuX } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { ScanSnapshot } from '@/scan/controller';

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

/** The one thing to do now: coaching, or the way to the next wall, or that the room is closed. */
export function CoachingBanner({ snapshot }: { snapshot: ScanSnapshot }) {
  const { coaching, coverage, turn } = snapshot.derived;
  let title = coaching.title;
  let detail = coaching.detail;
  if (coaching.kind === 'aim-at-wall') {
    if (coverage?.closed) {
      title = 'The walls go all the way round';
      detail = 'Joining them into a room. If nothing happens, tap Done.';
    } else if (turn) {
      detail = turn.text;
    }
  }
  return (
    <View
      className="items-center gap-1 rounded-2xl bg-black/60 px-4 py-3"
      accessibilityLiveRegion="polite"
    >
      <Text className="text-center text-base font-semibold text-white">{title}</Text>
      <Text className="text-center text-sm text-white/85">{detail}</Text>
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

/** The dot in the middle of the screen: taps mark where its ray meets the floor. */
export function Reticle({ onFloor }: { onFloor: boolean }) {
  return (
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
      <View
        className={cn(
          'size-8 items-center justify-center rounded-full border-2',
          onFloor ? 'border-white' : 'border-white/40',
        )}
      >
        <View className={cn('size-2 rounded-full', onFloor ? 'bg-white' : 'bg-white/40')} />
      </View>
    </View>
  );
}

export function ScanControls({
  snapshot,
  onMark,
  onCancelTap,
  onUndo,
  onDone,
}: {
  snapshot: ScanSnapshot;
  onMark: () => void;
  onCancelTap: () => void;
  onUndo: () => void;
  onDone: () => void;
}) {
  const { state, derived } = snapshot;
  const pending = state.pendingTap !== null;
  const floorFound = derived.floor !== null;
  const walls = derived.coverage?.wallCount ?? 0;
  return (
    <View className="flex-1 gap-2">
      <Text className="text-xs text-white/85">
        {floorFound
          ? `${walls} wall${walls === 1 ? '' : 's'} found${state.tapWalls.length ? `, ${state.tapWalls.length} marked` : ''}`
          : 'Find the floor first'}
      </Text>
      {pending ? (
        <Text className="text-xs text-yellow-300">
          Now aim the dot at the other end of the wall's bottom and tap again.
        </Text>
      ) : null}
      <Button
        variant="secondary"
        onPress={onMark}
        disabled={!floorFound}
        accessibilityHint="Marks the spot under the dot at the bottom of a wall. Two spots make a wall."
      >
        <Icon as={LuPlus} size={16} />
        <Text>{pending ? 'Mark the other end' : 'Mark wall'}</Text>
      </Button>
      <View className="flex-row gap-2">
        {pending ? (
          <Button
            variant="outline"
            className="flex-1 border-white/40 bg-black/40"
            onPress={onCancelTap}
          >
            <Text className="text-white">Cancel</Text>
          </Button>
        ) : state.tapWalls.length > 0 ? (
          <Button
            variant="outline"
            className="flex-1 border-white/40 bg-black/40"
            onPress={onUndo}
            accessibilityLabel="Undo the last marked wall"
          >
            <Icon as={LuUndo2} size={16} className="text-white" />
            <Text className="text-white">Undo</Text>
          </Button>
        ) : null}
        <Button className="flex-1" onPress={onDone} disabled={!floorFound}>
          <Icon as={LuCheck} size={16} />
          <Text>Done</Text>
        </Button>
      </View>
    </View>
  );
}
