import { formatArea, roomArea } from '@youngvista/core';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { LuInfo } from 'react-icons/lu';
import { FloorPlan } from '@/components/floor-plan';
import { FormError } from '@/components/form-error';
import { RoomFacts } from '@/components/room-facts';
import { UnitsToggle } from '@/components/units-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { useUser } from '@/lib/auth';
import { saveErrorMessage, saveScannedRoom } from '@/lib/rooms';
import { useUnits } from '@/lib/units';
import { clearRoomDraft, getRoomDraft } from '@/scan/draft';

export default function ReviewScreen() {
  const router = useRouter();
  const user = useUser();
  const [units, setUnits] = useUnits();
  const [draft] = useState(getRoomDraft);
  const [name, setName] = useState('My room');
  const [saving, setSaving] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A save waits for the server: say so when the connection is slow instead of spinning quietly.
  useEffect(() => {
    if (!saving) return;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [saving]);

  const scanAgain = () => {
    clearRoomDraft();
    router.replace('/scan');
  };
  const discard = () => {
    clearRoomDraft();
    router.replace('/');
  };

  if (!draft) {
    return (
      <View className="bg-background flex-1 gap-4 p-4">
        <Alert icon={LuInfo}>
          <AlertDescription>There is no scanned room to review.</AlertDescription>
        </Alert>
        <Button onPress={scanAgain}>
          <Text>Scan a room</Text>
        </Button>
        <Button variant="ghost" onPress={discard}>
          <Text>Back to your rooms</Text>
        </Button>
      </View>
    );
  }

  const save = async () => {
    setSaving(true);
    setSlow(false);
    setError(null);
    try {
      const id = await saveScannedRoom({
        ownerId: user.uid,
        name,
        units,
        room: draft.room,
        platform: draft.platform,
      });
      clearRoomDraft();
      router.replace({ pathname: '/rooms/[id]', params: { id } });
    } catch (e) {
      setError(saveErrorMessage(e));
      setSaving(false);
    }
  };

  const filled = draft.inferredWalls.length;
  return (
    <KeyboardAvoidingView
      className="bg-background flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-muted-foreground flex-1 text-sm">
            Check the plan, then name the room and save it.
          </Text>
          <UnitsToggle value={units} onChange={setUnits} />
        </View>
        <Card className="px-4">
          <FloorPlan
            room={draft.room}
            units={units}
            inferredWalls={draft.inferredWalls}
            title={`Floor plan, ${formatArea(roomArea(draft.room), units)}`}
          />
        </Card>
        {filled > 0 ? (
          <Text className="text-muted-foreground text-xs">
            Dashed: {filled === 1 ? 'a wall' : `${filled} walls`} the scan did not see, filled in
            from the walls around {filled === 1 ? 'it' : 'them'}.
          </Text>
        ) : null}
        <RoomFacts room={draft.room} units={units} />
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
            Still saving. Check the phone's internet connection and keep the app open until the room
            page appears.
          </Text>
        ) : null}
        <Button size="lg" onPress={() => void save()} disabled={saving || !name.trim()}>
          <Text>{saving ? 'Saving…' : 'Save room'}</Text>
        </Button>
        <View className="flex-row gap-3">
          <Button variant="outline" className="flex-1" onPress={scanAgain} disabled={saving}>
            <Text>Scan again</Text>
          </Button>
          <Button variant="ghost" className="flex-1" onPress={discard} disabled={saving}>
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
