import {
  formatArea,
  formatLength,
  roomArea,
  roomPerimeter,
  type Room,
  type UnitSystem,
} from '@youngvista/core';
import { View } from 'react-native';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

/** Area, walls and ceiling height of a room. */
export function RoomFacts({ room, units }: { room: Room; units: UnitSystem }) {
  const facts: [string, string][] = [
    ['Floor area', formatArea(roomArea(room), units)],
    ['Walls', `${room.walls.length}, ${formatLength(roomPerimeter(room), units)} around`],
    ['Ceiling height', formatLength(room.ceilingHeight, units)],
  ];
  return (
    <Card className="py-4">
      <CardContent className="gap-3">
        {facts.map(([label, value]) => (
          <View key={label} className="flex-row items-center justify-between gap-4">
            <Text className="text-muted-foreground text-sm">{label}</Text>
            <Text className="text-sm font-medium">{value}</Text>
          </View>
        ))}
      </CardContent>
    </Card>
  );
}
