/**
 * The room editor: drag corners, type a wall's length, add doors, windows and openings and move
 * them along their wall, change the ceiling height. Saved to `rooms/{id}.room` about a second
 * after each change. What an edit did to doors and windows, or why it is not possible, is shown in
 * plain words.
 */
import {
  findOpening,
  formatLength,
  wallLength,
  type Opening,
  type OpeningType,
  type Room,
  type UnitSystem,
} from '@youngvista/core';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LuPlus, LuTrash2, LuTriangleAlert, LuUndo2 } from 'react-icons/lu';
import { EditorPlan } from '@/components/room-edit/editor-plan';
import { SaveIndicator } from '@/components/save-indicator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import {
  formatLengthInput,
  parseCeilingHeightInput,
  parseOpeningSizeInput,
  parseWallLengthInput,
  type LengthInputResult,
} from '@/lib/length-input';
import type { PendingEdits, RoomSummary } from '@/lib/room-doc';
import { saveRoomShape, useRoom } from '@/lib/rooms';
import { useUnits } from '@/lib/units';
import { useAutosave } from '@/lib/use-autosave';
import {
  canUndo,
  initialEditorState,
  openingName,
  reduceEditor,
  type RoomEditorAction,
} from '@/room-edit/editor-state';

const asPending = (room: Room): PendingEdits => ({ room });

/** Height of the panel under the plan (dp, without the bottom inset). */
const PANEL_HEIGHT = 250;

export default function EditRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const room = useRoom(String(id));
  const router = useRouter();
  // The editor starts from the room as Firestore has it (not an older copy from the phone).
  if (room.status === 'ready' && room.settled && room.data.room) {
    return <Editor summary={room.data} room={room.data.room} online={room.online} />;
  }
  if (room.status === 'loading' || (room.status === 'ready' && !room.settled)) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <View className="bg-background flex-1 gap-4 p-4">
      <Alert variant="destructive" icon={LuTriangleAlert}>
        <AlertTitle>Cannot edit this room</AlertTitle>
        <AlertDescription>
          {room.status === 'error'
            ? room.message
            : room.status === 'missing'
              ? 'This room does not exist or belongs to another account.'
              : 'This room has no floor plan yet.'}
        </AlertDescription>
      </Alert>
      <Button variant="outline" onPress={() => router.back()}>
        <Text>Back</Text>
      </Button>
    </View>
  );
}

function Editor({ summary, room, online }: { summary: RoomSummary; room: Room; online: boolean }) {
  const insets = useSafeAreaInsets();
  const [units] = useUnits();
  const [state, setState] = useState(() => initialEditorState(room));
  const dispatch = useCallback(
    (action: RoomEditorAction) => setState((s) => reduceEditor(s, action)),
    [],
  );
  const { status, change } = useAutosave({
    roomId: summary.id,
    online,
    write: saveRoomShape,
    asPending,
  });
  useEffect(() => {
    if (state.version > 0) change(state.room);
  }, [state.version, state.room, change]);

  // Info messages fade; errors stay until the next action.
  useEffect(() => {
    if (state.message?.tone !== 'info') return;
    const t = setTimeout(() => dispatch({ type: 'dismiss-message' }), 5000);
    return () => clearTimeout(t);
  }, [state.message, dispatch]);

  const sel = state.selection;
  return (
    <KeyboardAvoidingView
      className="bg-background flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <Stack.Screen
        options={{ title: 'Edit room', headerRight: () => <SaveIndicator status={status} /> }}
      />
      <View className="flex-row items-center justify-between gap-2 px-4 py-2">
        <Text className="text-muted-foreground flex-1 text-xs">
          Drag a corner, or tap a wall, door or window.
        </Text>
        <Button
          size="sm"
          variant="outline"
          disabled={!canUndo(state)}
          onPress={() => dispatch({ type: 'undo' })}
        >
          <Icon as={LuUndo2} size={14} />
          <Text>Undo</Text>
        </Button>
      </View>
      <View className="border-border flex-1 border-y">
        <EditorPlan
          room={state.room}
          units={units}
          selection={sel}
          dragging={state.drag !== null}
          dispatch={dispatch}
        />
        {state.message ? (
          <View className="absolute inset-x-3 top-3" pointerEvents="box-none">
            <View
              className={
                state.message.tone === 'error'
                  ? 'bg-destructive rounded-lg px-3 py-2'
                  : 'bg-primary rounded-lg px-3 py-2'
              }
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Text
                className={
                  state.message.tone === 'error'
                    ? 'text-sm text-white'
                    : 'text-primary-foreground text-sm'
                }
                onPress={() => dispatch({ type: 'dismiss-message' })}
              >
                {state.message.text}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      {/* A fixed height, so the plan above does not move when the selection changes. */}
      <ScrollView
        className="grow-0"
        style={{ height: PANEL_HEIGHT + insets.bottom }}
        contentContainerClassName="gap-3 px-4 pt-3"
        contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
        keyboardShouldPersistTaps="handled"
      >
        {sel?.kind === 'wall' ? (
          <WallPanel
            key={sel.id}
            room={state.room}
            wallId={sel.id}
            units={units}
            dispatch={dispatch}
          />
        ) : sel?.kind === 'opening' ? (
          <OpeningPanel
            key={sel.id}
            room={state.room}
            openingId={sel.id}
            units={units}
            dispatch={dispatch}
          />
        ) : sel?.kind === 'corner' ? (
          <Text className="text-muted-foreground text-sm">
            Corner {sel.index + 1}. Drag it to move it; walls snap straight when they are nearly
            straight.
          </Text>
        ) : (
          <CeilingPanel room={state.room} units={units} dispatch={dispatch} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A length typed into a field, checked when the user applies it. */
function LengthField({
  label,
  initial,
  units,
  parse,
  onApply,
  applyLabel = 'Apply',
}: {
  label: string;
  initial: number;
  units: UnitSystem;
  parse: (text: string, units: UnitSystem) => LengthInputResult;
  onApply: (meters: number) => void;
  applyLabel?: string;
}) {
  // Callers give the field a `key` with the value, so it starts over when the value changes.
  const [text, setText] = useState(() => formatLengthInput(initial, units));
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    const r = parse(text, units);
    if (!r.ok) return setError(r.message);
    setError(null);
    onApply(r.meters);
  };
  return (
    <View className="gap-1.5">
      <Label>{label}</Label>
      <View className="flex-row gap-2">
        <Input
          className="flex-1"
          value={text}
          onChangeText={(v) => {
            setText(v);
            setError(null);
          }}
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
          autoCorrect={false}
          autoCapitalize="none"
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={apply}
          accessibilityLabel={label}
        />
        <Button variant="secondary" onPress={apply}>
          <Text>{applyLabel}</Text>
        </Button>
      </View>
      {error ? <Text className="text-destructive text-sm">{error}</Text> : null}
    </View>
  );
}

function WallPanel({
  room,
  wallId,
  units,
  dispatch,
}: {
  room: Room;
  wallId: string;
  units: UnitSystem;
  dispatch: (action: RoomEditorAction) => void;
}) {
  const wall = room.walls.find((w) => w.id === wallId);
  if (!wall) return null;
  const length = wallLength(room, wallId);
  const add = (openingType: OpeningType) => dispatch({ type: 'add-opening', wallId, openingType });
  return (
    <View className="gap-3">
      <LengthField
        key={`${length}-${units}`}
        label={`Wall length (now ${formatLength(length, units)})`}
        initial={length}
        units={units}
        parse={parseWallLengthInput}
        onApply={(meters) => dispatch({ type: 'set-wall-length', wallId, meters })}
      />
      <View className="flex-row gap-2">
        {(['door', 'window', 'opening'] as const).map((type) => (
          <Button key={type} variant="outline" className="flex-1 px-0" onPress={() => add(type)}>
            <Icon as={LuPlus} size={14} />
            <Text>{type === 'door' ? 'Door' : type === 'window' ? 'Window' : 'Opening'}</Text>
          </Button>
        ))}
      </View>
      {wall.openings.length ? (
        <Text className="text-muted-foreground text-xs">
          On this wall: {wall.openings.map(openingName).join(', ')}. Tap one to change or remove it.
        </Text>
      ) : (
        <Text className="text-muted-foreground text-xs">
          The far end of the wall moves when you type a length; the next wall keeps its direction.
        </Text>
      )}
    </View>
  );
}

function OpeningPanel({
  room,
  openingId,
  units,
  dispatch,
}: {
  room: Room;
  openingId: string;
  units: UnitSystem;
  dispatch: (action: RoomEditorAction) => void;
}) {
  const found = findOpening(room, openingId);
  if (!found) return null;
  const o: Opening = found.opening;
  const update = (changes: Partial<Pick<Opening, 'width' | 'height' | 'sill'>>) =>
    dispatch({ type: 'update-opening', id: o.id, changes });
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="font-semibold">{openingName(o)}</Text>
        <Button
          size="sm"
          variant="outline"
          onPress={() => dispatch({ type: 'remove-opening', id: o.id })}
        >
          <Icon as={LuTrash2} size={14} className="text-destructive" />
          <Text className="text-destructive">Remove</Text>
        </Button>
      </View>
      <Text className="text-muted-foreground text-xs">Drag it along the wall to move it.</Text>
      <LengthField
        key={`w-${o.width}-${units}`}
        label="Width"
        initial={o.width}
        units={units}
        parse={(t, u) => parseOpeningSizeInput(t, u, 'width')}
        onApply={(width) => update({ width })}
      />
      <LengthField
        key={`h-${o.height}-${units}`}
        label="Height"
        initial={o.height}
        units={units}
        parse={(t, u) => parseOpeningSizeInput(t, u, 'height')}
        onApply={(height) => update({ height })}
      />
      {o.type === 'window' ? (
        <LengthField
          key={`s-${o.sill}-${units}`}
          label="Sill height above the floor"
          initial={o.sill}
          units={units}
          parse={(t, u) => parseOpeningSizeInput(t, u, 'sill')}
          onApply={(sill) => update({ sill })}
        />
      ) : null}
    </View>
  );
}

function CeilingPanel({
  room,
  units,
  dispatch,
}: {
  room: Room;
  units: UnitSystem;
  dispatch: (action: RoomEditorAction) => void;
}) {
  return (
    <LengthField
      key={`${room.ceilingHeight}-${units}`}
      label={`Ceiling height (now ${formatLength(room.ceilingHeight, units)})`}
      initial={room.ceilingHeight}
      units={units}
      parse={parseCeilingHeightInput}
      onApply={(meters) => dispatch({ type: 'set-ceiling', meters })}
    />
  );
}
