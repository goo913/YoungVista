/**
 * The turn-around scan's controls and cards, for the bottom right of the camera view
 * (components/camera-hud.tsx): the turning buttons, the sending-and-measuring card, the card for
 * the room the server found, and the buttons for marking a wall by hand.
 */
import { ActivityIndicator, View } from 'react-native';
import {
  LuCheck,
  LuCrosshair,
  LuHourglass,
  LuRefreshCw,
  LuRotateCw,
  LuSkipForward,
  LuSplit,
  LuTriangleAlert,
  LuUndo2,
} from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { CaptureSnapshot } from '@/scan/turn/capture';
import { fitMessage, progressLine, type FitStage } from '@/scan/turn/coach';
import { MAX_SPOTS } from '@/scan/turn/plan';
import type { UploadSnapshot } from '@/scan/turn/upload';
import { ProgressBar } from './capture-hud';

/** A ring can be left with gaps once this share of it has pictures ("Next turn"). */
export const SKIP_RING_SHARE = 0.75;

/** "Mark walls instead": always there, small, under the main buttons. */
function MarkInstead({ onPress }: { onPress: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="self-stretch bg-black/40" onPress={onPress}>
      <Text className="text-white">Mark walls instead</Text>
    </Button>
  );
}

/** While finding the floor and turning. */
export function CaptureControls({
  floorFound,
  capture,
  starting,
  onStart,
  onNextRing,
  onSecondSpot,
  onMeasure,
  onMarkInstead,
}: {
  floorFound: boolean;
  capture: CaptureSnapshot;
  starting: boolean;
  onStart: () => void;
  onNextRing: () => void;
  onSecondSpot: () => void;
  onMeasure: () => void;
  onMarkInstead: () => void;
}) {
  const { phase } = capture;
  const canSkip =
    capture.ringTotal > 0 && capture.ringFilled >= capture.ringTotal * SKIP_RING_SHARE;
  return (
    <View className="gap-2">
      {phase === 'turning' || phase === 'spot-done' ? (
        <Text className="text-xs text-white/85">{progressLine(capture)}</Text>
      ) : null}
      {phase === 'idle' ? (
        <Button size="lg" onPress={onStart} disabled={!floorFound || starting}>
          <Icon as={LuRotateCw} size={18} />
          <Text>{starting ? 'Starting…' : 'Start turning'}</Text>
        </Button>
      ) : null}
      {phase === 'turning' && canSkip ? (
        <Button variant="secondary" onPress={onNextRing}>
          <Icon as={LuSkipForward} size={16} />
          <Text>{capture.ring < 2 ? 'Next turn' : 'Finish turning'}</Text>
        </Button>
      ) : null}
      {phase === 'spot-done' ? (
        <>
          <Button size="lg" onPress={onMeasure}>
            <Icon as={LuCheck} size={18} />
            <Text>Measure the room</Text>
          </Button>
          {capture.spot + 1 < MAX_SPOTS ? (
            <Button variant="secondary" onPress={onSecondSpot}>
              <Icon as={LuSplit} size={16} />
              <Text>Add a second spot</Text>
            </Button>
          ) : null}
        </>
      ) : null}
      <MarkInstead onPress={onMarkInstead} />
    </View>
  );
}

const megabytes = (bytes: number) =>
  `${Math.max(0, bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;

/** Sending the pictures and waiting for the server, with what to do if either stops. */
export function MeasuringCard({
  stage,
  error,
  upload,
  onRetry,
  onKeepWaiting,
  onMarkInstead,
}: {
  stage: FitStage;
  error: string | null;
  upload: UploadSnapshot | null;
  onRetry: () => void;
  onKeepWaiting: () => void;
  onMarkInstead: () => void;
}) {
  const message = fitMessage(stage, error);
  const stopped = stage === 'upload-failed' || stage === 'request-failed' || stage === 'failed';
  const busy =
    stage === 'uploading' || stage === 'asking' || stage === 'queued' || stage === 'running';
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <View className="flex-row items-center gap-2">
          {busy ? <ActivityIndicator /> : null}
          {stopped ? <Icon as={LuTriangleAlert} size={16} className="text-destructive" /> : null}
          {stage === 'timeout' ? <Icon as={LuHourglass} size={16} /> : null}
          <CardTitle className="flex-1 text-base">{message.title}</CardTitle>
        </View>
        <CardDescription className="text-xs">{message.detail}</CardDescription>
      </CardHeader>
      <CardContent className="gap-2 px-4">
        {stage === 'uploading' && upload ? (
          <View className="gap-1.5">
            <ProgressBar
              value={upload.totalBytes > 0 ? upload.sentBytes / upload.totalBytes : 0}
              label="Pictures sent"
            />
            <Text className="text-muted-foreground text-xs">
              {upload.sentFiles} of {upload.totalFiles} files · {megabytes(upload.sentBytes)} of{' '}
              {megabytes(upload.totalBytes)}
              {upload.slow ? ' · Slow connection…' : ''}
            </Text>
          </View>
        ) : null}
        {stopped ? (
          <Button onPress={onRetry}>
            <Icon as={LuRefreshCw} size={16} />
            <Text>Try again</Text>
          </Button>
        ) : null}
        {stage === 'timeout' ? (
          <Button variant="secondary" onPress={onKeepWaiting}>
            <Icon as={LuHourglass} size={16} />
            <Text>Keep waiting</Text>
          </Button>
        ) : null}
        <Button
          variant={stopped || stage === 'timeout' ? 'default' : 'outline'}
          onPress={onMarkInstead}
        >
          <Text>Mark the walls instead</Text>
        </Button>
      </CardContent>
    </Card>
  );
}

/** The room the server found, over its walls in the camera view. */
export function FittedCard({
  size,
  walls,
  unsure,
  closed,
  onMark,
  onAccept,
  onMarkInstead,
}: {
  /** "10′ 3″ × 11′ 6″" once the walls close a room. */
  size: string | null;
  walls: number;
  unsure: number;
  closed: boolean;
  onMark: () => void;
  onAccept: () => void;
  onMarkInstead: () => void;
}) {
  const title = closed ? `Room found: ${size}` : `${walls} wall${walls === 1 ? '' : 's'} found`;
  const detail = !closed
    ? 'They do not close the room yet. Mark the walls that are missing: aim at each one’s bottom edge (or its top edge behind furniture).'
    : unsure > 0
      ? `${unsure === 1 ? 'The amber wall is' : `The ${unsure} amber walls are`} unsure. Mark ${unsure === 1 ? 'it' : 'each'} once for a better fit, or go on.`
      : 'Check that the lines sit on your walls. A wall that is off can be marked by hand.';
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-xs">{detail}</CardDescription>
      </CardHeader>
      <CardContent className="gap-2 px-4">
        {closed ? (
          <Button onPress={unsure > 0 ? onMark : onAccept}>
            <Icon as={unsure > 0 ? LuCrosshair : LuCheck} size={16} />
            <Text>{unsure > 0 ? 'Mark the amber walls' : 'Looks right'}</Text>
          </Button>
        ) : (
          <Button onPress={onMark}>
            <Icon as={LuCrosshair} size={16} />
            <Text>Mark the missing walls</Text>
          </Button>
        )}
        {closed ? (
          <Button variant="secondary" onPress={unsure > 0 ? onAccept : onMark}>
            <Text>{unsure > 0 ? 'Go on without' : 'Mark a wall by hand'}</Text>
          </Button>
        ) : null}
        <Button variant="ghost" onPress={onMarkInstead}>
          <Text>Mark every wall instead</Text>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Marking walls by hand over the server's: Mark, Undo, Done. */
export function MarkControls({
  progress,
  canMark,
  canUndo,
  onMarkPressIn,
  onMark,
  onUndo,
  onDone,
}: {
  progress: string;
  canMark: boolean;
  canUndo: boolean;
  onMarkPressIn: () => void;
  onMark: () => void;
  onUndo: () => void;
  onDone: () => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-xs text-white/85">{progress}</Text>
      <Button
        size="lg"
        onPressIn={onMarkPressIn}
        onPress={onMark}
        disabled={!canMark}
        accessibilityHint="Marks the wall's edge under the dot in the middle of the screen."
      >
        <Icon as={LuCrosshair} size={18} />
        <Text>Mark wall</Text>
      </Button>
      <View className="flex-row flex-wrap gap-2">
        {canUndo ? (
          <Button
            variant="outline"
            className={cn('grow border-white/40 bg-black/40')}
            onPress={onUndo}
            accessibilityLabel="Undo the last mark"
          >
            <Icon as={LuUndo2} size={16} className="text-white" />
            <Text className="text-white">Undo</Text>
          </Button>
        ) : null}
        <Button variant="secondary" className="grow" onPress={onDone}>
          <Icon as={LuCheck} size={16} />
          <Text>Done</Text>
        </Button>
      </View>
    </View>
  );
}
