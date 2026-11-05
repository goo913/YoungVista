import type { EulerOrder } from '@youngvista/core';
import { Platform, ScrollView, Share, View } from 'react-native';
import { LuShare } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { trackingReasonName, trackingStateName } from '@/scan/coaching';
import type { ScanController, ScanSnapshot } from '@/scan/controller';
import {
  DEBUG_EULER_ORDERS,
  EULER_ORDER_COLORS,
  formatLine,
  formatVec,
  planeDebugRows,
} from '@/scan/debug';
import type { HorizontalAxis } from '@/scan/session';

const AXES: HorizontalAxis[] = ['auto', 'x', 'z'];

/**
 * The raw AR data behind the scan, for checking the wall maths on real phones: tracking, light,
 * floor, camera, and every plane with the wall line each Euler order gives. The order and axis
 * pickers change which line the scan uses; the coloured lines in AR match the list.
 */
export function DebugPanel({
  snapshot,
  controller,
}: {
  snapshot: ScanSnapshot;
  controller: ScanController;
}) {
  const { state, derived } = snapshot;
  const rows = planeDebugRows(state, derived.floor?.y ?? null);
  const camera = state.camera;

  const share = () => {
    const data = {
      platform: Platform.OS,
      options: state.options,
      tracking: state.tracking,
      lightIntensity: state.lightIntensity,
      floor: derived.floor,
      camera,
      planes: Object.values(state.planes),
      tapWalls: state.tapWalls,
      observations: derived.observations,
      coverage: derived.coverage,
    };
    void Share.share({ message: JSON.stringify(data, null, 1) });
  };

  return (
    <ScrollView className="rounded-2xl bg-black/75" contentContainerClassName="gap-3 p-3">
      <Section title="Session">
        <Mono>
          tracking:{' '}
          {state.tracking
            ? `${trackingStateName(state.tracking.state)} (${state.tracking.state}), reason ${trackingReasonName(state.tracking.reason)} (${state.tracking.reason})`
            : 'none yet'}
        </Mono>
        <Mono>light estimate: {state.lightIntensity?.toFixed(0) ?? 'none'}</Mono>
        <Mono>
          floor y:{' '}
          {derived.floor
            ? `${derived.floor.y.toFixed(3)} (plane …${derived.floor.planeId.slice(-6)})`
            : 'not found'}
        </Mono>
        <Mono>camera: {camera ? formatVec(camera.position) : 'none'}</Mono>
        <Mono>
          camera rotation: {camera ? formatVec(camera.rotation, 1) : '—'} heading:{' '}
          {derived.headingDeg?.toFixed(0) ?? '—'}°
        </Mono>
        <Mono>
          planes: {derived.planeCount} ({derived.verticalPlaneCount} vertical), walls merged:{' '}
          {derived.walls.length}, coverage:{' '}
          {derived.coverage ? `${Math.round(derived.coverage.fraction * 100)}%` : '—'}
          {derived.coverage?.closed ? ' (closed)' : ''}
        </Mono>
      </Section>

      <Section title="Euler order used for walls">
        <Choice
          options={DEBUG_EULER_ORDERS}
          value={state.options.eulerOrder}
          onChange={(eulerOrder: EulerOrder) => controller.setOptions({ eulerOrder })}
          color={(o) => EULER_ORDER_COLORS[o]}
        />
        <Text className="text-xs text-white/70">Along-floor axis of a wall plane</Text>
        <Choice
          options={AXES}
          value={state.options.horizontalAxis}
          onChange={(horizontalAxis: HorizontalAxis) => controller.setOptions({ horizontalAxis })}
        />
      </Section>

      <Section title={`Planes (${rows.length})`}>
        {rows.length === 0 ? <Mono>none yet</Mono> : null}
        {rows.map((row) => (
          <View key={row.id} className="gap-0.5 border-t border-white/15 pt-2">
            <Mono bold>
              …{row.label} {row.alignment}
              {row.classification && row.classification !== 'None'
                ? ` · ${row.classification}`
                : ''}
            </Mono>
            <Mono>
              size {row.width.toFixed(2)} × {row.height.toFixed(2)} m · centre{' '}
              {formatVec(row.worldCenter)}
            </Mono>
            <Mono>
              pos {formatVec(row.position)} rot {formatVec(row.rotationDeg, 1)}
            </Mono>
            <Mono>
              local centre {formatVec(row.localCenter)} · {row.vertexCount} vertices
            </Mono>
            {row.lines.map((line) => (
              <Text
                key={line.order}
                className="font-mono text-[11px]"
                style={{ color: EULER_ORDER_COLORS[line.order] }}
              >
                {line.order}:{' '}
                {line.observation ? formatLine(line.observation) : `no wall (${line.rejected})`}
                {` tilt ${line.tiltDeg.toFixed(0)}°`}
              </Text>
            ))}
          </View>
        ))}
      </Section>

      <Button variant="secondary" size="sm" onPress={share}>
        <Icon as={LuShare} size={14} />
        <Text>Share the raw data</Text>
      </Button>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-1">
      <Text className="text-xs font-semibold uppercase text-white/60">{title}</Text>
      {children}
    </View>
  );
}

function Mono({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return (
    <Text className={`font-mono text-[11px] text-white ${bold ? 'font-bold' : ''}`}>
      {children}
    </Text>
  );
}

function Choice<T extends string>({
  options,
  value,
  onChange,
  color,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  color?: (value: T) => string;
}) {
  return (
    <View className="flex-row gap-2">
      {options.map((option) => (
        <Button
          key={option}
          size="sm"
          variant={option === value ? 'default' : 'outline'}
          onPress={() => onChange(option)}
          accessibilityState={{ selected: option === value }}
        >
          {color ? (
            <View className="size-2.5 rounded-full" style={{ backgroundColor: color(option) }} />
          ) : null}
          <Text>{option}</Text>
        </Button>
      ))}
    </View>
  );
}
