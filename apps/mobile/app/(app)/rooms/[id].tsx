import { formatArea, roomArea } from '@youngvista/core';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { LuInfo, LuTriangleAlert } from 'react-icons/lu';
import { FloorPlan } from '@/components/floor-plan';
import { RoomFacts } from '@/components/room-facts';
import { UnitsToggle } from '@/components/units-toggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { formatDate } from '@/lib/format';
import { useRoom } from '@/lib/rooms';
import { useUnits } from '@/lib/units';

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const room = useRoom(String(id));
  const [units, setUnits] = useUnits();
  const router = useRouter();

  if (room.status === 'loading') {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (room.status !== 'ready') {
    return (
      <View className="bg-background flex-1 gap-4 p-4">
        <Alert variant="destructive" icon={LuTriangleAlert}>
          <AlertTitle>{room.status === 'missing' ? 'Room not found' : 'Could not load'}</AlertTitle>
          <AlertDescription>
            {room.status === 'missing'
              ? 'This room does not exist or belongs to another account.'
              : room.message}
          </AlertDescription>
        </Alert>
        <Button variant="outline" onPress={() => router.back()}>
          <Text>Back to your rooms</Text>
        </Button>
      </View>
    );
  }

  const { name, updatedAt } = room.data;
  return (
    <ScrollView className="bg-background flex-1" contentContainerClassName="gap-4 p-4 pb-10">
      <Stack.Screen options={{ title: name }} />
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-muted-foreground flex-1 text-sm">
          Updated {formatDate(updatedAt)}
        </Text>
        <UnitsToggle value={units} onChange={setUnits} />
      </View>
      {room.data.room ? (
        <>
          <Card className="px-4">
            <FloorPlan
              room={room.data.room}
              units={units}
              title={`Floor plan of ${name}, ${formatArea(roomArea(room.data.room), units)}`}
            />
          </Card>
          <RoomFacts room={room.data.room} units={units} />
          <Text className="text-muted-foreground text-xs">
            Sizes are approximate: check with a tape for tight gaps.
          </Text>
        </>
      ) : (
        <Alert icon={LuInfo}>
          <AlertDescription>This room has no floor plan yet.</AlertDescription>
        </Alert>
      )}
    </ScrollView>
  );
}
