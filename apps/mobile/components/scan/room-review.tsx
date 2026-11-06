/**
 * Reviewing a scanned room before saving it: the plan, its sizes, an optional tape-measure
 * correction, and its name. Shown by the scan screen over its AR session, which keeps running
 * underneath so that the saved room can be shown in the camera view straight away, lined up
 * from the scan (see app/(app)/scan.tsx).
 */
import {
  describeRoomSize,
  formatArea,
  roomArea,
  scaleRoom,
  type CapturePlatform,
  type Room,
} from '@youngvista/core';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloorPlan } from '@/components/floor-plan';
import { FormError } from '@/components/form-error';
import { RoomFacts } from '@/components/room-facts';
import { ScaleCheck } from '@/components/scan/scale-check';
import { UnitsToggle } from '@/components/units-toggle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { saveErrorMessage, saveScannedRoom } from '@/lib/rooms';
import { useUnits } from '@/lib/units';

/** A scanned room on its way to being saved. */
export interface RoomDraft {
  room: Room;
  /** Indices into `room.walls` of walls no mark was on (they were filled in). */
  inferredWalls: number[];
  platform: CapturePlatform;
}

/** What the review has made of the draft so far (for the scan log when the user leaves). */
export interface ReviewProgress {
  room: Room;
  scaleFactor: number;
  error: string | null;
}

export interface SavedRoom {
  id: string;
  name: string;
  /** The room as saved (after any tape-measure correction). */
  room: Room;
  /** The tape-measure correction (1 = none). */
  scaleFactor: number;
}

export function RoomReview({
  draft,
  ownerId,
  onProgress,
  onSaved,
  onScanAgain,
  onDiscard,
}: {
  draft: RoomDraft;
  ownerId: string;
  onProgress: (progress: ReviewProgress) => void;
  onSaved: (saved: SavedRoom) => void;
  onScanAgain: () => void;
  onDiscard: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [units, setUnits] = useUnits();
  const [room, setRoom] = useState(draft.room);
  const [scaleFactor, setScaleFactor] = useState(1);
  const [name, setName] = useState('My room');
  const [saving, setSaving] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onProgress({ room, scaleFactor, error });
  }, [onProgress, room, scaleFactor, error]);

  // A save waits for the server: say so when the connection is slow instead of spinning quietly.
  useEffect(() => {
    if (!saving) return;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [saving]);

  const save = async () => {
    setSaving(true);
    setSlow(false);
    setError(null);
    try {
      const id = await saveScannedRoom({
        ownerId,
        name,
        units,
        room,
        platform: draft.platform,
        scaleFactor,
      });
      onSaved({ id, name: name.trim() || 'Untitled room', room, scaleFactor });
    } catch (e) {
      setError(saveErrorMessage(e));
      setSaving(false);
    }
  };

  const rescale = (factor: number) => {
    setRoom(scaleRoom(room, factor));
    setScaleFactor((f) => f * factor);
  };

  const filled = draft.inferredWalls.length;
  return (
    <KeyboardAvoidingView
      className="bg-background absolute inset-0"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerClassName="gap-4 p-4"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-xl font-semibold">Review room</Text>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-muted-foreground flex-1 text-sm">
            Check the plan, then name the room and save it.
          </Text>
          <UnitsToggle value={units} onChange={setUnits} />
        </View>
        <Card className="px-4">
          <FloorPlan
            room={room}
            units={units}
            inferredWalls={draft.inferredWalls}
            title={`Floor plan, ${describeRoomSize(room, units)}, ${formatArea(roomArea(room), units)}`}
          />
        </Card>
        {filled > 0 ? (
          <Text className="text-muted-foreground text-xs">
            Dashed: {filled === 1 ? 'a wall' : `${filled} walls`} with no mark on{' '}
            {filled === 1 ? 'it' : 'them'}, filled in from the walls around{' '}
            {filled === 1 ? 'it' : 'them'}.
          </Text>
        ) : null}
        <RoomFacts room={room} units={units} />
        <ScaleCheck
          room={room}
          units={units}
          scaleFactor={scaleFactor}
          onRescale={rescale}
          disabled={saving}
        />
        <View className="gap-2">
          <Label nativeID="room-name">Room name</Label>
          <Input
            aria-labelledby="room-name"
            value={name}
            onChangeText={setName}
            placeholder="Living room"
            selectTextOnFocus
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
          />
        </View>
        <FormError message={error} />
        {saving && slow ? (
          <Text className="text-muted-foreground text-sm">
            Still saving. Check the phone's internet connection and keep the app open.
          </Text>
        ) : null}
        <Button size="lg" onPress={() => void save()} disabled={saving || !name.trim()}>
          <Text>{saving ? 'Saving…' : 'Save room'}</Text>
        </Button>
        <View className="flex-row gap-3">
          <Button variant="outline" className="flex-1" onPress={onScanAgain} disabled={saving}>
            <Text>Scan again</Text>
          </Button>
          <Button variant="ghost" className="flex-1" onPress={onDiscard} disabled={saving}>
            <Text>Discard</Text>
          </Button>
        </View>
        <Text className="text-muted-foreground text-xs">
          Sizes are approximate: check with a tape for tight gaps.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
