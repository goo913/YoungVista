import {
  DEFAULT_CEILING_HEIGHT,
  formatArea,
  formatLength,
  roomArea,
  type BuildRoomSuccess,
  type UnitSystem,
} from '@youngvista/core';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { FloorPlan } from '@/components/floor-plan';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { formatLengthInput, parseCeilingHeightInput } from '@/scan/length-input';

/**
 * After the walls close: shows the outline and asks for the ceiling height (8 ft unless typed
 * otherwise). The AR session keeps running underneath, so "Keep scanning" loses nothing.
 */
export function CeilingStep({
  built,
  units,
  onBack,
  onNext,
}: {
  built: BuildRoomSuccess;
  units: UnitSystem;
  onBack: () => void;
  onNext: (ceilingHeight: number) => void;
}) {
  const [text, setText] = useState(() => formatLengthInput(DEFAULT_CEILING_HEIGHT, units));
  const [error, setError] = useState<string | null>(null);
  const filled = built.inferredWalls.length;

  const next = () => {
    const result = parseCeilingHeightInput(text, units);
    if (!result.ok) return setError(result.message);
    onNext(result.meters);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 justify-end"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="max-h-full grow-0"
        contentContainerClassName="p-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">The walls go all the way around</CardTitle>
            <CardDescription>
              {formatArea(roomArea(built.room), units)}, {built.room.walls.length} walls
              {filled > 0
                ? `. ${filled} wall${filled === 1 ? ' was' : 's were'} not seen and ${filled === 1 ? 'is' : 'are'} drawn dashed.`
                : '.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="bg-muted/40 h-44 rounded-lg p-3">
              <FloorPlan
                room={built.room}
                units={units}
                labels={false}
                inferredWalls={built.inferredWalls}
                layout="fill"
              />
            </View>
            <View className="gap-2">
              <Label nativeID="ceiling-height">How high is the ceiling?</Label>
              <Input
                aria-labelledby="ceiling-height"
                value={text}
                onChangeText={(value) => {
                  setText(value);
                  setError(null);
                }}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                autoCorrect={false}
                autoCapitalize="none"
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={next}
              />
              <Text
                className={error ? 'text-destructive text-sm' : 'text-muted-foreground text-xs'}
              >
                {error ??
                  `Most rooms are ${formatLength(DEFAULT_CEILING_HEIGHT, units)}. Type feet and inches (8' 6") or metres (2.6 m).`}
              </Text>
            </View>
            <View className="flex-row gap-3">
              <Button variant="outline" className="flex-1" onPress={onBack}>
                <Text>Keep scanning</Text>
              </Button>
              <Button className="flex-1" onPress={next}>
                <Text>Next</Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
