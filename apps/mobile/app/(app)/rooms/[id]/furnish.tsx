/**
 * Furnishing a room: the room in 3D (or as a plan, for precise moves), a picker to add real-size
 * furniture, and a panel to turn, copy, recolour or remove the selected piece. Every change is
 * saved to `rooms/{id}.design` about a second later.
 */
import {
  isFlatProduct,
  itemFootprint,
  type CatalogDimensions,
  type CatalogItem,
  type Design,
  type Room,
} from '@youngvista/core';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LuPlus, LuSquare, LuTriangleAlert } from 'react-icons/lu';
import { FurniturePicker } from '@/components/furnish/furniture-picker';
import { ItemPanel } from '@/components/furnish/item-panel';
import { PlanEditor, type PlanEditorItem } from '@/components/furnish/plan-editor';
import { Room3D, type Room3DHandle } from '@/components/furnish/room-3d';
import type { SceneItem } from '@/components/furnish/room-scene';
import { SaveIndicator } from '@/components/save-indicator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { noticeText, placementProblem } from '@/furnish/describe';
import {
  displayedItems,
  initialDesignState,
  itemChecks,
  reduceDesign,
  selectedItem,
  type DesignAction,
  type DesignContext,
  type DesignState,
} from '@/furnish/design-state';
import { newItemId } from '@/furnish/ids';
import type { PickBox } from '@/furnish/orbit';
import { models, retryCatalog, useCatalog } from '@/lib/catalog';
import { modelUrl, type CatalogIndex } from '@/lib/catalog-data';
import type { PendingEdits, RoomSummary } from '@/lib/room-doc';
import { saveDesign, useRoom } from '@/lib/rooms';
import { useUnits } from '@/lib/units';
import { useAutosave } from '@/lib/use-autosave';

/** Size used for pieces whose product is not in the catalog any more. */
const UNKNOWN_SIZE: CatalogDimensions = { w: 0.5, d: 0.5, h: 0.5 };

const asPending = (design: Design): PendingEdits => ({ design });

/** Height of the panel under the view (dp, without the bottom inset): fits the tallest panel. */
const PANEL_HEIGHT = 200;

export default function FurnishScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const roomId = String(id);
  const room = useRoom(roomId);
  const catalog = useCatalog();
  const router = useRouter();

  // The editor starts from the room as Firestore has it (not an older copy from the phone).
  if (room.status === 'ready' && room.settled && room.data.room && catalog.status === 'ready') {
    return (
      <FurnishEditor
        summary={room.data}
        room={room.data.room}
        online={room.online}
        catalog={catalog.data}
      />
    );
  }

  const problem =
    room.status === 'missing'
      ? { title: 'Room not found', text: 'This room does not exist or belongs to another account.' }
      : room.status === 'error'
        ? { title: 'Could not load', text: room.message }
        : room.status === 'ready' && !room.data.room
          ? { title: 'No floor plan', text: 'This room has no floor plan to furnish yet.' }
          : catalog.status === 'error'
            ? { title: 'No furniture list', text: catalog.message }
            : null;
  return (
    <View className="bg-background flex-1 items-center justify-center gap-4 p-6">
      <Stack.Screen options={{ title: 'Furnish' }} />
      {problem ? (
        <>
          <Alert variant="destructive" icon={LuTriangleAlert}>
            <AlertTitle>{problem.title}</AlertTitle>
            <AlertDescription>{problem.text}</AlertDescription>
          </Alert>
          {catalog.status === 'error' ? (
            <Button onPress={retryCatalog}>
              <Text>Try again</Text>
            </Button>
          ) : null}
          <Button variant="outline" onPress={() => router.back()}>
            <Text>Back</Text>
          </Button>
        </>
      ) : (
        <ActivityIndicator />
      )}
    </View>
  );
}

function useDesign(room: Room, catalog: CatalogIndex, initial: Design) {
  const ctx = useMemo<DesignContext>(
    () => ({ room, product: catalog.product, newId: () => newItemId() }),
    [room, catalog],
  );
  // The reducer reads this render's room and catalog (React runs the latest reducer).
  const [state, dispatch] = useReducer(
    (s: DesignState, action: DesignAction) => reduceDesign(s, action, ctx),
    initial.items,
    initialDesignState,
  );
  return { state, dispatch, ctx };
}

function FurnishEditor({
  summary,
  room,
  online,
  catalog,
}: {
  summary: RoomSummary;
  room: Room;
  online: boolean;
  catalog: CatalogIndex;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [units] = useUnits();
  const { state, dispatch, ctx } = useDesign(room, catalog, summary.design);
  const [mode, setMode] = useState<'3d' | 'plan'>('3d');
  const [picking, setPicking] = useState(false);
  const view3d = useRef<Room3DHandle>(null);
  const { status, change } = useAutosave({
    roomId: summary.id,
    online,
    write: saveDesign,
    asPending,
  });

  // Save after every change the user makes (not after loading).
  useEffect(() => {
    if (state.version > 0) change({ items: state.items });
  }, [state.version, state.items, change]);

  // Start fetching every model this room uses, so the 3D view fills in quickly.
  useEffect(() => {
    models.prefetch(
      summary.design.items.flatMap((it) => {
        const product = catalog.byId.get(it.productId);
        return product ? [modelUrl(product, it.variant)] : [];
      }),
    );
  }, [summary, catalog]);

  // Notices fade by themselves.
  useEffect(() => {
    if (!state.notice) return;
    const t = setTimeout(
      () => dispatch({ type: 'dismiss-notice' }),
      state.notice.kind === 'removed' ? 6000 : 4500,
    );
    return () => clearTimeout(t);
  }, [state.notice, dispatch]);

  const product = useCallback(
    (productId: string): CatalogItem | null => catalog.byId.get(productId) ?? null,
    [catalog],
  );
  const shown = useMemo(() => displayedItems(state), [state]);
  const checks = useMemo(() => itemChecks(state, ctx), [state, ctx]);
  const nameOf = useCallback(
    (itemId: string) => {
      const it = state.items.find((i) => i.id === itemId);
      return (it && product(it.productId)?.name) ?? 'piece';
    },
    [state.items, product],
  );
  const productName = useCallback(
    (productId: string) => product(productId)?.name ?? 'piece',
    [product],
  );

  const highlight = useCallback(
    (itemId: string): SceneItem['highlight'] =>
      checks.get(itemId)?.valid === false
        ? 'invalid'
        : itemId === state.selectedId
          ? 'selected'
          : 'none',
    [checks, state.selectedId],
  );

  const sceneItems = useMemo<SceneItem[]>(
    () =>
      shown.map((it) => {
        const p = product(it.productId);
        return {
          id: it.id,
          x: it.x,
          y: it.y ?? 0,
          z: it.z,
          rotationY: it.rotationY,
          size: p?.dimensions ?? UNKNOWN_SIZE,
          modelUrl: p ? modelUrl(p, it.variant) : null,
          label: p ? `${p.name} (model not available)` : 'Unknown piece',
          highlight: highlight(it.id),
        };
      }),
    [shown, product, highlight],
  );
  const boxes = useMemo<PickBox[]>(
    () =>
      shown.map((it) => {
        const size = product(it.productId)?.dimensions ?? UNKNOWN_SIZE;
        return { id: it.id, footprint: itemFootprint(it, size), y: it.y ?? 0, height: size.h };
      }),
    [shown, product],
  );
  const planItems = useMemo<PlanEditorItem[]>(
    () =>
      shown.map((it) => {
        const p = product(it.productId);
        return {
          id: it.id,
          footprint: itemFootprint(it, p?.dimensions ?? UNKNOWN_SIZE),
          flat: p ? isFlatProduct(p) : false,
          rotationY: it.rotationY,
          highlight: highlight(it.id),
        };
      }),
    [shown, product, highlight],
  );

  const gestures = {
    onTap: (itemId: string | null) => dispatch({ type: 'select', id: itemId }),
    onDragStart: (itemId: string) => dispatch({ type: 'drag-start', id: itemId }),
    onDragMove: (x: number, z: number) => dispatch({ type: 'drag-move', x, z }),
    onRotateStart: (itemId: string) => dispatch({ type: 'rotate-start', id: itemId }),
    onRotateMove: (rotationY: number) => dispatch({ type: 'rotate-move', rotationY }),
    onGestureEnd: () => dispatch({ type: 'gesture-end' }),
  };

  const selected = selectedItem(state);
  const live =
    state.gesture?.moved && !state.gesture.preview.valid
      ? placementProblem(state.gesture.preview, nameOf)
      : null;
  const misplaced = state.gesture
    ? 0
    : [...checks.values()].filter((c) => !c.valid && !c.reasons.includes('unknown-product')).length;

  return (
    <View className="bg-background flex-1">
      <Stack.Screen
        options={{
          title: summary.name,
          headerRight: () => <SaveIndicator status={status} />,
        }}
      />
      <View className="flex-row items-center justify-between gap-2 px-4 py-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={mode}
          onValueChange={(v) => {
            if (v === '3d' || v === 'plan') setMode(v);
          }}
          accessibilityLabel="View"
        >
          <ToggleGroupItem value="3d" isFirst accessibilityLabel="3D view" className="px-3">
            <Text>3D</Text>
          </ToggleGroupItem>
          <ToggleGroupItem value="plan" isLast accessibilityLabel="Plan view" className="px-3">
            <Text>Plan</Text>
          </ToggleGroupItem>
        </ToggleGroup>
        {mode === '3d' ? (
          <View className="flex-row gap-2">
            <Button size="sm" variant="outline" onPress={() => view3d.current?.show('top')}>
              <Icon as={LuSquare} size={14} />
              <Text>Top view</Text>
            </Button>
            <Button size="sm" variant="outline" onPress={() => view3d.current?.show('corner')}>
              <Text>3D</Text>
            </Button>
          </View>
        ) : (
          <Text className="text-muted-foreground text-xs">Drag to move, two fingers to turn</Text>
        )}
      </View>

      <View className="border-border flex-1 border-y">
        {mode === '3d' ? (
          <Room3D
            ref={view3d}
            room={room}
            items={sceneItems}
            boxes={boxes}
            selectedId={state.selectedId}
            {...gestures}
          />
        ) : (
          <PlanEditor room={room} items={planItems} selectedId={state.selectedId} {...gestures} />
        )}
        <View className="absolute inset-x-3 top-3 gap-2" pointerEvents="box-none">
          {live ? <Banner tone="error" text={live} /> : null}
          {!live && misplaced > 0 ? (
            <Banner
              tone="error"
              text={`${misplaced === 1 ? 'A piece is' : `${misplaced} pieces are`} outside the room or on top of another. Drag ${misplaced === 1 ? 'it' : 'them'} somewhere free.`}
            />
          ) : null}
        </View>
        {state.notice ? (
          <View className="absolute inset-x-3 bottom-3" pointerEvents="box-none">
            <Banner
              tone={state.notice.kind === 'removed' ? 'info' : 'error'}
              text={noticeText(state.notice, nameOf, productName)}
              action={
                state.notice.kind === 'removed'
                  ? { label: 'Undo', onPress: () => dispatch({ type: 'undo-remove' }) }
                  : undefined
              }
              onDismiss={() => dispatch({ type: 'dismiss-notice' })}
            />
          </View>
        ) : null}
      </View>

      {/*
        A fixed height, whatever is shown: if the panel grew when a piece is selected, the view
        above would resize in the middle of a drag and the piece would jump.
      */}
      <View
        className={selected ? 'px-4 pt-3' : 'justify-center px-4 pt-3'}
        style={{ height: PANEL_HEIGHT + insets.bottom, paddingBottom: insets.bottom + 12 }}
      >
        {selected ? (
          <ItemPanel
            item={selected}
            product={product(selected.productId)}
            units={units}
            onRotate={(degrees) => dispatch({ type: 'rotate-by', id: selected.id, degrees })}
            onDuplicate={() => dispatch({ type: 'duplicate', id: selected.id })}
            onRemove={() => dispatch({ type: 'remove', id: selected.id })}
            onVariant={(variant) => dispatch({ type: 'set-variant', id: selected.id, variant })}
            onClose={() => dispatch({ type: 'select', id: null })}
          />
        ) : (
          <View className="gap-2">
            <Text className="text-muted-foreground text-center text-xs">
              {state.items.length === 0
                ? 'Add a piece, then drag it where you want it. It snaps to walls.'
                : `${state.items.length} ${state.items.length === 1 ? 'piece' : 'pieces'}. Tap one to move, turn or remove it.`}
            </Text>
            <Button size="lg" onPress={() => setPicking(true)}>
              <Icon as={LuPlus} size={18} />
              <Text>Add furniture</Text>
            </Button>
          </View>
        )}
      </View>

      <FurniturePicker
        visible={picking}
        catalog={catalog}
        units={units}
        onClose={() => setPicking(false)}
        onCredits={() => {
          setPicking(false);
          router.push('/credits');
        }}
        onPick={(item) => {
          setPicking(false);
          dispatch({ type: 'add', productId: item.id });
        }}
      />
    </View>
  );
}

function Banner({
  tone,
  text,
  action,
  onDismiss,
}: {
  tone: 'info' | 'error';
  text: string;
  action?: { label: string; onPress: () => void };
  onDismiss?: () => void;
}) {
  return (
    <View
      className={
        tone === 'error'
          ? 'bg-destructive flex-row items-center gap-2 rounded-lg px-3 py-2'
          : 'bg-primary flex-row items-center gap-2 rounded-lg px-3 py-2'
      }
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text
        className={
          tone === 'error' ? 'flex-1 text-sm text-white' : 'text-primary-foreground flex-1 text-sm'
        }
        onPress={onDismiss}
      >
        {text}
      </Text>
      {action ? (
        <Button size="sm" variant="secondary" onPress={action.onPress}>
          <Text>{action.label}</Text>
        </Button>
      ) : null}
    </View>
  );
}
