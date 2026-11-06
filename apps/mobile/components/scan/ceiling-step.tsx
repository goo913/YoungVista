import {
  DEFAULT_CEILING_HEIGHT,
  describeRoomSize,
  formatArea,
  formatLength,
  rectangleSides,
  roomArea,
  type UnitSystem,
} from '@youngvista/core';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useHudPadding, useLandscape } from '@/components/camera-hud';
import { FloorPlan } from '@/components/floor-plan';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { formatLengthInput, parseCeilingHeightInput } from '@/lib/length-input';
import { cn } from '@/lib/utils';
import type { FinishResult } from '@/scan/session';

type Built = Extract<FinishResult, { ok: true }>;

const CEILING_NOTE: Record<Built['ceiling']['source'], (units: UnitSystem) => string> = {
  measured: () => 'Measured at the top of the first wall. Change it if it looks wrong.',
  detected: () => 'The phone found the ceiling. Change it if it looks wrong.',
  default: (units) =>
    `Not measured: most rooms are ${formatLength(DEFAULT_CEILING_HEIGHT, units)}. Type feet and inches (8' 6") or metres (2.6 m).`,
};

/** Landscape: the plan's card and the form's card (points). */
const PLAN_SIZE = 200;
const FORM_WIDTH = 340;

/** "10′ 3″ × 11′ 6″, 118 sq ft" for a rectangle, "254 sq ft, 6 walls" otherwise. */
export function roomSummary(built: Built, units: UnitSystem): string {
  const size = describeRoomSize(built.room, units);
  return rectangleSides(built.room) ? `${size}, ${formatArea(roomArea(built.room), units)}` : size;
}

/**
 * The room is closed: shows its size and outline, and the ceiling height (measured at the top of
 * the first wall, or 8 ft), which can be changed. The AR session keeps running underneath, so
 * "Keep scanning" loses nothing. Upright: one card at the bottom. Landscape: the plan at the
 * bottom left and the form at the bottom right, the camera view between them; the form scrolls
 * the height into view above the keyboard.
 */
export function CeilingStep({
  built,
  units,
  onBack,
  onNext,
}: {
  built: Built;
  units: UnitSystem;
  onBack: () => void;
  onNext: (ceilingHeight: number) => void;
}) {
  const landscape = useLandscape();
  const padding = useHudPadding(landscape);
  const [text, setText] = useState(() => formatLengthInput(built.ceiling.height, units));
  const [error, setError] = useState<string | null>(null);
  const filled = built.inferredWalls.length;
  const notes = [
    filled > 0
      ? `${filled} wall${filled === 1 ? ' was' : 's were'} not marked and ${filled === 1 ? 'is' : 'are'} drawn dashed.`
      : null,
    built.leftOutMarks > 0
      ? `${built.leftOutMarks} mark${built.leftOutMarks === 1 ? '' : 's'} did not fit and ${built.leftOutMarks === 1 ? 'was' : 'were'} left out.`
      : null,
  ].filter(Boolean);

  const next = () => {
    const result = parseCeilingHeightInput(text, units);
    if (!result.ok) return setError(result.message);
    onNext(result.meters);
  };

  const plan = (
    <FloorPlan
      room={built.room}
      units={units}
      labels={false}
      inferredWalls={built.inferredWalls}
      layout="fill"
    />
  );
  const header = (
    <CardHeader className={cn(landscape && 'px-4')}>
      <CardTitle className="text-lg">Room found</CardTitle>
      <CardDescription>
        {roomSummary(built, units)}
        {notes.length ? `. ${notes.join(' ')}` : ''}
      </CardDescription>
    </CardHeader>
  );
  const form = (
    <>
      <View className="gap-2">
        <Label nativeID="ceiling-height">Ceiling height</Label>
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
        <Text className={error ? 'text-destructive text-sm' : 'text-muted-foreground text-xs'}>
          {error ?? CEILING_NOTE[built.ceiling.source](units)}
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
    </>
  );

  if (landscape) {
    return (
      <View
        className="absolute inset-0 flex-row items-end gap-3"
        style={padding}
        pointerEvents="box-none"
      >
        <Card className="p-3" style={{ width: PLAN_SIZE, height: PLAN_SIZE }}>
          {plan}
        </Card>
        <View className="flex-1" pointerEvents="none" />
        <View className="justify-end self-stretch" style={{ width: FORM_WIDTH }}>
          <ScrollView
            className="max-h-full grow-0"
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <Card className="gap-4 py-4">
              {header}
              <CardContent className="gap-4 px-4">{form}</CardContent>
            </Card>
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View className="absolute inset-0" style={padding} pointerEvents="box-none">
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
            {header}
            <CardContent className="gap-4">
              <View className="bg-muted/40 h-44 rounded-lg p-3">{plan}</View>
              {form}
            </CardContent>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
