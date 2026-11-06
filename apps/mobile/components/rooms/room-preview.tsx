/**
 * The room page's first sight of the room: the room in 3D with its furniture exactly where it was
 * left, straight from the saved design, with no camera, scan or line-up. It is a picture that
 * fingers do not move, so the page scrolls freely over it; "Top view" and "Corner view" turn it,
 * and a tap opens the full 3D view to move furniture. It follows the saved design as it changes
 * (here, in the camera view, on the website). Only drawn while the page is on screen, so there is
 * one 3D view at a time.
 */
import type { Design, Room } from '@youngvista/core';
import { useIsFocused } from 'expo-router';
import { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LuBox, LuSquare } from 'react-icons/lu';
import { Room3D, type Room3DHandle } from '@/components/furnish/room-3d';
import { SCENE_COLORS, type SceneItem } from '@/components/furnish/room-scene';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { sceneItem } from '@/furnish/scene-items';
import type { CatalogIndex } from '@/lib/catalog-data';

const NO_BOXES = [] as const;
const ignore = () => {};
const NO_GESTURES = {
  onTap: ignore,
  onDragStart: ignore,
  onDragMove: ignore,
  onRotateStart: ignore,
  onRotateMove: ignore,
  onGestureEnd: ignore,
};

export function RoomPreview({
  room,
  design,
  catalog,
  onOpen,
}: {
  room: Room;
  design: Design;
  /** The furniture list; null while it loads (the room shows without its furniture). */
  catalog: CatalogIndex | null;
  /** Opens the 3D view, where furniture is moved. */
  onOpen: () => void;
}) {
  const focused = useIsFocused();
  const view = useRef<Room3DHandle>(null);
  const items = useMemo<SceneItem[]>(
    () =>
      catalog
        ? design.items.map((it) => sceneItem(it, catalog.byId.get(it.productId) ?? null, 'none'))
        : [],
    [design, catalog],
  );
  const count = design.items.length;
  const caption =
    count === 0
      ? 'No furniture yet. Tap to furnish it in 3D.'
      : catalog
        ? `${count} ${count === 1 ? 'piece' : 'pieces'}, where you left ${count === 1 ? 'it' : 'them'}. Tap to move them.`
        : 'Loading the furniture…';

  return (
    <View
      className="border-border aspect-[4/3] w-full overflow-hidden rounded-xl border"
      style={{ backgroundColor: SCENE_COLORS.background }}
    >
      {focused ? (
        <Room3D
          ref={view}
          room={room}
          items={items}
          boxes={NO_BOXES}
          selectedId={null}
          interactive={false}
          {...NO_GESTURES}
        />
      ) : null}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`The room in 3D. ${caption}`}
        accessibilityHint="Opens the 3D view, where you add and move furniture."
      />
      <View className="absolute right-2 top-2 flex-row gap-2" pointerEvents="box-none">
        <Button
          size="sm"
          variant="secondary"
          className="bg-background/85 px-2.5"
          onPress={() => view.current?.show('top')}
          accessibilityHint="Looks straight down at the room."
        >
          <Icon as={LuSquare} size={14} />
          <Text>Top</Text>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="bg-background/85 px-2.5"
          onPress={() => view.current?.show('corner')}
          accessibilityHint="Looks at the room from a corner, from above."
        >
          <Icon as={LuBox} size={14} />
          <Text>Corner</Text>
        </Button>
      </View>
      <View
        className="absolute bottom-2 left-2 right-2 items-start"
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
      >
        <View className="rounded-full bg-black/60 px-3 py-1">
          <Text className="text-xs text-white" numberOfLines={1}>
            {caption}
          </Text>
        </View>
      </View>
    </View>
  );
}
