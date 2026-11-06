/**
 * Furnishing a room: the room in 3D (or as a plan, for precise moves), a picker to add real-size
 * furniture, and a panel to turn, copy, recolour or remove the selected piece. Every change is
 * saved to `rooms/{id}.design` about a second later, and changes made elsewhere (the website,
 * another phone) show up here while the user is not in the middle of one of their own
 * (furnish/design-follow.ts). "Take picture" captures the 3D view as it is (the final picture):
 * it goes to Photos and to the room's pictures (lib/pictures.ts). "AI picture" sends the same
 * capture to AI, which makes it photo-real and adds it to the room's pictures (components/ai).
 */
import {
  isFlatProduct,
  itemFootprint,
  type CatalogItem,
  type Design,
  type Room,
} from '@youngvista/core';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LuBox, LuCamera, LuPlus, LuSparkles, LuSquare, LuTriangleAlert } from 'react-icons/lu';
import { useAiPicture } from '@/components/ai/use-ai-picture';
import { ConnectionBanner } from '@/components/connection-banner';
import { FurniturePicker } from '@/components/furnish/furniture-picker';
import { ItemPanel } from '@/components/furnish/item-panel';
import { PlanEditor, type PlanEditorItem } from '@/components/furnish/plan-editor';
import { Room3D, type Room3DHandle } from '@/components/furnish/room-3d';
import type { SceneItem } from '@/components/furnish/room-scene';
import { ShotNotice, type Shot } from '@/components/pictures/shot-notice';
import { SaveIndicator } from '@/components/save-indicator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { noticeText, noticeTone, placementProblem } from '@/furnish/describe';
import { displayedItems, itemChecks, selectedItem } from '@/furnish/design-state';
import type { PickBox } from '@/furnish/orbit';
import { pickBoxFor, sceneItem, UNKNOWN_SIZE } from '@/furnish/scene-items';
import { useDesignFollower, useFollowServerDesign } from '@/furnish/design-follow';
import { useDesign } from '@/furnish/use-design';
import { useUser } from '@/lib/auth';
import { models, retryCatalog, useCatalog } from '@/lib/catalog';
import { modelUrl, type CatalogIndex } from '@/lib/catalog-data';
import {
  forgetCapture,
  pictureUploads,
  saveToPhotos,
  usePictureUploads,
  useUploadWhenOnline,
} from '@/lib/pictures';
import type { PendingEdits, RoomSummary } from '@/lib/room-doc';
import { saveDesign, useRoom, type ServerDesign } from '@/lib/rooms';
import { useUnits } from '@/lib/units';
import { useAutosave } from '@/lib/use-autosave';
import { sceneCaptureAvailable } from '@/modules/scene-capture';

const asPending = (design: Design): PendingEdits => ({ design });

/** Height of the panel under the view (dp, without the bottom inset): fits the tallest panel. */
const PANEL_HEIGHT = 200;

/** Longest wait for models still loading before a picture is taken anyway (ms). */
const MODELS_WAIT_MS = 10_000;
/** After hiding the selection marks, the scene draws a few frames before the picture (ms). */
const SETTLE_MS = 350;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
        server={room.server}
        pendingDesign={room.pendingDesign}
      />
    );
  }

  const problem =
    room.status === 'missing' && room.deleted
      ? { title: 'This room was deleted', text: 'It is no longer on this phone or the website.' }
      : room.status === 'missing'
        ? {
            title: 'Room not found',
            text: 'This room does not exist or belongs to another account.',
          }
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
          <Button
            variant="outline"
            onPress={() => (room.status === 'missing' ? router.dismissTo('/') : router.back())}
          >
            <Text>{room.status === 'missing' ? 'Back to your rooms' : 'Back'}</Text>
          </Button>
        </>
      ) : (
        <ActivityIndicator />
      )}
    </View>
  );
}

function FurnishEditor({
  summary,
  room,
  online,
  catalog,
  server,
  pendingDesign,
}: {
  summary: RoomSummary;
  room: Room;
  online: boolean;
  catalog: CatalogIndex;
  /** The design as the server has it, to follow changes made elsewhere. */
  server: ServerDesign | null;
  /** A design edit made on this phone is not on the server yet. */
  pendingDesign: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useUser();
  const [units] = useUnits();
  const { state, dispatch, ctx } = useDesign(room, catalog, summary.design);
  const [mode, setMode] = useState<'3d' | 'plan'>('3d');
  const [picking, setPicking] = useState(false);
  const view3d = useRef<Room3DHandle>(null);
  // The final picture: while taking it the selection marks are hidden, then a card says how it
  // went (Photos, upload).
  const [capturing, setCapturing] = useState(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const uploads = usePictureUploads();
  useUploadWhenOnline(online);
  const [flash] = useState(() => new Animated.Value(0));
  // Changes made elsewhere show up here when the user is not in the middle of their own.
  const follower = useDesignFollower(summary.design, server);
  const { status, change } = useAutosave({
    roomId: summary.id,
    online,
    write: saveDesign,
    asPending,
    onSaved: follower.saved,
  });
  useFollowServerDesign(follower, {
    server,
    items: state.items,
    busy: state.gesture !== null || pendingDesign || status !== 'saved',
    onAdopt: (d) => dispatch({ type: 'load', items: d.items, elsewhere: true }),
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
      capturing
        ? 'none'
        : checks.get(itemId)?.valid === false
          ? 'invalid'
          : itemId === state.selectedId
            ? 'selected'
            : 'none',
    [checks, state.selectedId, capturing],
  );

  const sceneItems = useMemo<SceneItem[]>(
    () => shown.map((it) => sceneItem(it, product(it.productId), highlight(it.id))),
    [shown, product, highlight],
  );
  const boxes = useMemo<PickBox[]>(
    () => shown.map((it) => pickBoxFor(it, product(it.productId))),
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

  const dismissShot = useCallback(() => setShot(null), []);

  // "AI picture": the 3D view, taken as "Take picture" takes it, made photo-real by AI
  // (components/ai/use-ai-picture.tsx).
  const ai = useAiPicture({ roomId: summary.id, online });
  const aiPicture = () => {
    const view = view3d.current;
    if (capturing || !view) return;
    void ai.start({
      use: 'render',
      source: async () => {
        if (!sceneCaptureAvailable) throw new Error('This build cannot take pictures.');
        setCapturing(true);
        try {
          await view.whenModelsReady(MODELS_WAIT_MS);
          await wait(SETTLE_MS);
          return (await view.capture()).uri;
        } finally {
          setCapturing(false);
        }
      },
    });
  };

  /**
   * "Take picture": waits for the models still loading, hides the selection marks for a moment,
   * captures the 3D view, keeps the picture in the upload queue and saves it to Photos.
   */
  const takePicture = async () => {
    const view = view3d.current;
    if (capturing || !view) return;
    if (!sceneCaptureAvailable) {
      setShot({
        phase: 'failed',
        message: 'This copy of the app cannot take pictures. Install the latest build.',
      });
      return;
    }
    setCapturing(true);
    setShot({ phase: 'taking' });
    try {
      const complete = await view.whenModelsReady(MODELS_WAIT_MS);
      await wait(SETTLE_MS);
      const capture = await view.capture();
      Animated.sequence([
        Animated.timing(flash, { toValue: 0.85, duration: 70, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start();
      const picture = await pictureUploads.add({
        uid: user.uid,
        roomId: summary.id,
        capture,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      });
      setCapturing(false);
      setShot({
        phase: 'taken',
        pictureId: picture.id,
        file: picture.file,
        photos: 'saving',
        incomplete: !complete,
      });
      const photos = await saveToPhotos(capture.uri);
      forgetCapture(capture.uri);
      setShot((s) => (s?.phase === 'taken' && s.pictureId === picture.id ? { ...s, photos } : s));
    } catch {
      setShot({ phase: 'failed', message: 'The picture could not be taken. Try again.' });
    } finally {
      setCapturing(false);
    }
  };

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
            <Button
              size="sm"
              variant="outline"
              className="px-2.5"
              onPress={() => view3d.current?.show('top')}
              accessibilityHint="Looks straight down at the room."
            >
              <Icon as={LuSquare} size={14} />
              <Text>Top view</Text>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="px-2.5"
              onPress={() => view3d.current?.show('corner')}
              accessibilityHint="Looks at the room from a corner, from above."
            >
              <Icon as={LuBox} size={14} />
              <Text>Corner view</Text>
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
        {/* The camera flash: the picture was taken. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: 'white', opacity: flash }]}
        />
        <View className="absolute inset-x-3 top-3 gap-2" pointerEvents="box-none">
          <ConnectionBanner online={online} className="bg-muted/90" />
          {live ? <Banner tone="error" text={live} /> : null}
          {!live && misplaced > 0 ? (
            <Banner
              tone="error"
              text={`${misplaced === 1 ? 'A piece is' : `${misplaced} pieces are`} outside the room or on top of another. Drag ${misplaced === 1 ? 'it' : 'them'} somewhere free.`}
            />
          ) : null}
        </View>
        {shot || state.notice || ai.card ? (
          <View className="absolute inset-x-3 bottom-3 gap-2" pointerEvents="box-none">
            {ai.card}
            {shot ? (
              <ShotNotice
                shot={shot}
                queue={uploads.queue}
                active={uploads.active}
                online={online}
                onDismiss={dismissShot}
              />
            ) : null}
            {state.notice ? (
              <Banner
                tone={noticeTone(state.notice)}
                text={noticeText(state.notice, nameOf, productName)}
                action={
                  state.notice.kind === 'removed'
                    ? { label: 'Undo', onPress: () => dispatch({ type: 'undo-remove' }) }
                    : undefined
                }
                onDismiss={() => dispatch({ type: 'dismiss-notice' })}
              />
            ) : null}
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
            <Button size="lg" className="px-4" onPress={() => setPicking(true)}>
              <Icon as={LuPlus} size={18} />
              <Text>Add furniture</Text>
            </Button>
            {mode === '3d' ? (
              <View className="flex-row gap-3">
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1 px-4"
                  onPress={() => void takePicture()}
                  disabled={capturing}
                  accessibilityHint="Takes a picture of the room as the 3D view shows it, and saves it to Photos and to the room."
                >
                  <Icon as={LuCamera} size={18} />
                  <Text>{capturing && !ai.busy ? 'Taking…' : 'Take picture'}</Text>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1 px-4"
                  onPress={aiPicture}
                  disabled={capturing || ai.busy}
                  accessibilityHint="AI makes a photo-real picture of the 3D view, with the same room and furniture, and saves it to the room."
                >
                  <Icon as={LuSparkles} size={18} />
                  <Text>{ai.busy ? 'AI working…' : 'AI picture'}</Text>
                </Button>
              </View>
            ) : null}
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
        onPlaceFreely={() => {
          setPicking(false);
          router.push('/place');
        }}
        onPick={(item) => {
          setPicking(false);
          dispatch({ type: 'add', productId: item.id });
        }}
      />
      {ai.modals}
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
