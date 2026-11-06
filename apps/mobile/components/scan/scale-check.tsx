import { formatLength, wallLengths, type Room, type UnitSystem } from '@youngvista/core';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { parseTapeLengthInput } from '@/lib/length-input';

/**
 * "Measured a wall with a tape?": the user picks the wall and types its length, and the whole
 * plan is rescaled to match (the scan's scale can be off by a few percent).
 */
export function ScaleCheck({
  room,
  units,
  scaleFactor,
  onRescale,
  disabled,
}: {
  room: Room;
  units: UnitSystem;
  /** The correction applied so far (1 = none). */
  scaleFactor: number;
  onRescale: (factor: number) => void;
  disabled?: boolean;
}) {
  const lengths = wallLengths(room);
  const [wall, setWall] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rescale = () => {
    if (wall === null) return setError('Pick the wall you measured.');
    const result = parseTapeLengthInput(text, units, lengths[wall]!);
    if (!result.ok) return setError(result.message);
    setError(null);
    setText('');
    onRescale(result.factor);
  };

  return (
    <Card className="py-4">
      <CardContent className="gap-3">
        <View className="gap-1">
          <Label nativeID="tape-length">Measured a wall with a tape? Type its length</Label>
          <Text className="text-muted-foreground text-xs">
            Optional. Pick the wall, type what the tape says, and the plan is rescaled to match.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {lengths.map((length, i) => (
            <Button
              key={room.walls[i]!.id}
              size="sm"
              variant={wall === i ? 'default' : 'outline'}
              onPress={() => {
                setWall(i);
                setError(null);
              }}
              disabled={disabled}
              accessibilityState={{ selected: wall === i }}
            >
              <Text>{formatLength(length, units)}</Text>
            </Button>
          ))}
        </View>
        <View className="flex-row gap-2">
          <Input
            className="flex-1"
            aria-labelledby="tape-length"
            value={text}
            onChangeText={(value) => {
              setText(value);
              setError(null);
            }}
            placeholder={units === 'metric' ? '3.12 m' : `10' 3"`}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={rescale}
            editable={!disabled}
          />
          <Button variant="secondary" onPress={rescale} disabled={disabled}>
            <Text>Rescale</Text>
          </Button>
        </View>
        {error ? (
          <Text className="text-destructive text-sm">{error}</Text>
        ) : scaleFactor !== 1 ? (
          <Text className="text-muted-foreground text-xs">
            Rescaled by {((scaleFactor - 1) * 100).toFixed(1)}% to match your tape.
          </Text>
        ) : null}
      </CardContent>
    </Card>
  );
}
