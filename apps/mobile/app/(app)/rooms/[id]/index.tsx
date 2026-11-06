import { formatArea, isFlatProduct, itemFootprint, roomArea } from '@youngvista/core';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { LuArmchair, LuCloudOff, LuInfo, LuPencilRuler, LuTriangleAlert } from 'react-icons/lu';
import { FloorPlan, type PlanFurniture } from '@/components/floor-plan';
import { RoomFacts } from '@/components/room-facts';
import { UnitsToggle } from '@/components/units-toggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useCatalog } from '@/lib/catalog';
import { formatDate } from '@/lib/format';
import { useRoom } from '@/lib/rooms';
import { useUnits } from '@/lib/units';

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const roomId = String(id);
  const room = useRoom(roomId);
  const catalog = useCatalog();
  const [units, setUnits] = useUnits();
  const router = useRouter();

  const design = room.status === 'ready' ? room.data.design : null;
  const furniture = useMemo<PlanFurniture[]>(() => {
    if (!design || catalog.status !== 'ready') return [];
    return design.items.flatMap((it) => {
      const product = catalog.data.byId.get(it.productId);
      if (!product) return [];
      return [
        {
          id: it.id,
          footprint: itemFootprint(it, product.dimensions),
          flat: isFlatProduct(product),
        },
      ];
    });
  }, [design, catalog]);

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
  const count = room.data.design.items.length;
  return (
    <ScrollView className="bg-background flex-1" contentContainerClassName="gap-4 p-4 pb-10">
      <Stack.Screen options={{ title: name }} />
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-muted-foreground flex-1 text-sm">
          Updated {formatDate(updatedAt)}
        </Text>
        <UnitsToggle value={units} onChange={setUnits} />
      </View>
      {!room.online ? (
        <Alert icon={LuCloudOff}>
          <AlertDescription>
            Offline: showing the copy on this phone. Changes are saved when the connection is back.
          </AlertDescription>
        </Alert>
      ) : null}
      {room.data.room ? (
        <>
          <Card className="px-4">
            <FloorPlan
              room={room.data.room}
              units={units}
              furniture={furniture}
              title={`Floor plan of ${name}, ${formatArea(roomArea(room.data.room), units)}`}
            />
          </Card>
          <View className="gap-3">
            <Button
              size="lg"
              onPress={() =>
                router.push({ pathname: '/rooms/[id]/furnish', params: { id: roomId } })
              }
            >
              <Icon as={LuArmchair} size={18} />
              <Text>{count === 0 ? 'Furnish in 3D' : 'Furniture and 3D'}</Text>
            </Button>
            <Button
              variant="outline"
              onPress={() => router.push({ pathname: '/rooms/[id]/edit', params: { id: roomId } })}
            >
              <Icon as={LuPencilRuler} size={16} />
              <Text>Edit walls, doors and windows</Text>
            </Button>
          </View>
          <RoomFacts room={room.data.room} units={units} />
          <Text className="text-muted-foreground text-sm">
            {count === 0
              ? 'No furniture yet.'
              : `${count} ${count === 1 ? 'piece' : 'pieces'} of furniture, shown at real size.`}
          </Text>
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
