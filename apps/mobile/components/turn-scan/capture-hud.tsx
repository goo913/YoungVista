/**
 * The pieces over the camera view while turning: the ring targets (a dial that fills in as each
 * part of the turn gets its picture), the pitch guide (the line to keep the dot on), and a plain
 * progress bar.
 */
import { View } from 'react-native';
import { useSafeAreaFrame } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { CaptureSnapshot } from '@/scan/turn/capture';
import { BIN_DEG, PITCH_TOLERANCE_DEG, RING_NAMES, pointsPerDegree } from '@/scan/turn/plan';

const GREEN = '#4ade80';
const AMBER = '#f59e0b';
const EMPTY = 'rgba(255, 255, 255, 0.28)';

/**
 * The three rings as circles, seen from above, turning with the phone: the way it faces is always
 * at the top, so the part to turn to next is beside it. Inner: the low turn; middle: level; outer:
 * the high turn. The ring being turned is brighter; a part turned past without a picture is amber.
 */
export function RingDial({
  capture,
  size = 136,
}: {
  capture: Pick<CaptureSnapshot, 'coverage' | 'ring' | 'view' | 'gap' | 'phase'>;
  size?: number;
}) {
  const c = size / 2;
  const width = size * 0.075;
  const radii = [c * 0.42, c * 0.63, c * 0.84];
  const yaw = capture.view?.yawDeg ?? 0;
  // A heading on the dial: straight up for the way the phone faces, to the left for headings to
  // the user's left (turning left raises the heading).
  const at = (r: number, headingDeg: number) => {
    const a = ((90 + headingDeg - yaw) * Math.PI) / 180;
    return { x: c + r * Math.cos(a), y: c - r * Math.sin(a) };
  };
  const arc = (r: number, from: number, to: number) => {
    const p = at(r, from);
    const q = at(r, to);
    return `M ${p.x} ${p.y} A ${r} ${r} 0 0 0 ${q.x} ${q.y}`;
  };
  const turning = capture.phase === 'turning';
  const filled = capture.coverage[capture.ring]?.filter(Boolean).length ?? 0;
  const total = capture.coverage[capture.ring]?.length ?? 0;
  return (
    <View
      className="items-center justify-center rounded-full bg-black/55"
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={
        turning
          ? `Turn ${capture.ring + 1} of 3, ${RING_NAMES[capture.ring]}: ${filled} of ${total} parts done`
          : 'Turns done'
      }
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {capture.coverage.map((bins, ring) =>
          bins.map((has, bin) => {
            const active = turning && ring === capture.ring;
            const gap = active && capture.gap?.bin === bin;
            const from = bin * BIN_DEG + 1.5;
            const to = (bin + 1) * BIN_DEG - 1.5;
            return (
              <Path
                key={`${ring}-${bin}`}
                d={arc(radii[ring]!, from, to)}
                stroke={gap ? AMBER : has ? GREEN : EMPTY}
                strokeOpacity={active || !turning ? 1 : 0.55}
                strokeWidth={active ? width * 1.25 : width}
                strokeLinecap="butt"
                fill="none"
              />
            );
          }),
        )}
        {/* The way the phone faces. */}
        <Circle cx={c} cy={c - radii[2]! - width * 0.9} r={width * 0.5} fill="#ffffff" />
      </Svg>
      <Text className="text-xs font-semibold text-white">
        {turning ? `${capture.ring + 1}/3` : 'Done'}
      </Text>
    </View>
  );
}

/**
 * The line to keep the dot on: where the ring's tilt is in the camera view. Above the dot when the
 * phone points too low, below it when too high; green within the tolerance.
 */
export function PitchLine({ capture }: { capture: Pick<CaptureSnapshot, 'guide' | 'optics'> }) {
  const frame = useSafeAreaFrame();
  const guide = capture.guide;
  if (!guide) return null;
  const perDegree = capture.optics ? pointsPerDegree(frame, capture.optics) : 0;
  // About 11 points a degree on an iPhone held sideways, until the camera's own numbers arrive.
  const scale = perDegree > 0 ? perDegree : 11;
  const limit = frame.height / 2 - 36;
  const offset = Math.max(-limit, Math.min(limit, guide.offsetDeg * scale));
  const band = PITCH_TOLERANCE_DEG * scale;
  const on = guide.onTarget;
  return (
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
      {/* The band within the tolerance, and the line itself. */}
      <View
        className={cn('absolute inset-x-0', on ? 'bg-green-400/10' : 'bg-amber-400/10')}
        style={{ top: frame.height / 2 + offset - band, height: band * 2 }}
      />
      <View
        className={cn('absolute inset-x-0 h-0.5', on ? 'bg-green-400' : 'bg-amber-400')}
        style={{ top: frame.height / 2 + offset - 1 }}
      />
      <View
        className={cn(
          'size-9 items-center justify-center rounded-full border-2',
          on ? 'border-green-400' : 'border-white',
        )}
      >
        <View className={cn('size-2.5 rounded-full', on ? 'bg-green-400' : 'bg-white')} />
      </View>
    </View>
  );
}

/** A plain progress bar (0 to 1). */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const share = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View
      className="bg-primary/20 h-2 w-full overflow-hidden rounded-full"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
    >
      <View className="bg-primary h-full rounded-full" style={{ width: `${share * 100}%` }} />
    </View>
  );
}
