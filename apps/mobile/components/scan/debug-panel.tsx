import { axesAngle, type EulerOrder } from '@youngvista/core';
import { ScrollView, Share, View } from 'react-native';
import { LuShare } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { trackingReasonName, trackingStateName } from '@/scan/coaching';
import type { ScanController, ScanSnapshot } from '@/scan/controller';
import {
  DEBUG_EULER_ORDERS,
  EULER_ORDER_COLORS,
  formatLine,
  formatVec,
  planeDebugRows,
} from '@/scan/debug';
import { deviceInfo } from '@/scan/log-writer';
import type { CenterSpace } from '@/scan/planes';
import { buildScanLog } from '@/scan/scan-log';

const CENTER_SPACES: CenterSpace[] = ['world', 'local'];

/**
 * The raw AR data behind the scan, for checking it on real phones: tracking, light, floor,
 * camera, marks, and every plane with the floor line each Euler order gives. "Use detected walls
 * (test)" lets planes that line up with the room join the marked walls.
 */
export function DebugPanel({
  snapshot,
  controller,
}: {
  snapshot: ScanSnapshot;
  controller: ScanController;
}) {
  const { state, derived } = snapshot;
  const rows = planeDebugRows(state, derived);
  const camera = state.camera;
  const floor = derived.floor;

  const share = () => {
    const doc = buildScanLog(controller.record(), '', deviceInfo(), { outcome: 'abandoned' });
    void Share.share({ message: JSON.stringify(doc) });
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
          {floor
            ? `${floor.y.toFixed(3)} (plane …${floor.planeId?.slice(-6) ?? 'gone'}${floor.classification ? `, ${floor.classification}` : ''})`
            : derived.floorStatus}
          {camera && floor ? ` · phone ${(camera.position[1] - floor.y).toFixed(2)} m up` : ''}
        </Mono>
        <Mono>camera: {camera ? formatVec(camera.position) : 'none'}</Mono>
        <Mono>
          camera rotation: {camera ? formatVec(camera.rotation, 1) : '—'} heading:{' '}
          {derived.headingDeg?.toFixed(0) ?? '—'}°
        </Mono>
        <Mono>
          step: {derived.step} · marks: {state.marks.length} · walls:{' '}
          {derived.grouped?.walls.length ?? 0}
          {derived.axes ? ` · axes ${((axesAngle(derived.axes) * 180) / Math.PI).toFixed(1)}°` : ''}
        </Mono>
        <Mono>
          ceiling:{' '}
          {derived.ceiling
            ? `${derived.ceiling.height.toFixed(3)} m (${derived.ceiling.source})`
            : 'not yet'}
          {derived.room
            ? ` · room: ${derived.room.ok ? 'closed' : `${derived.room.error}${derived.room.conflicting.length ? ` [${derived.room.conflicting.join(', ')}]` : ''}`}`
            : ''}
        </Mono>
        <Mono>
          planes: {derived.planeCount} ({derived.verticalPlaneCount} upright)
        </Mono>
      </Section>

      <Section title="Detected walls">
        <Toggle
          pressed={state.options.useDetectedWalls}
          onPressedChange={(useDetectedWalls) => controller.setOptions({ useDetectedWalls })}
          variant="outline"
          className="self-start border-white/40"
          accessibilityLabel="Use detected walls (test)"
        >
          <Text className="text-white">
            {state.options.useDetectedWalls ? 'On: ' : 'Off: '}Use detected walls (test)
          </Text>
        </Toggle>
        <Text className="text-xs text-white/70">
          Once the first wall is marked, upright planes within 7° of the room's directions, at least
          60 cm wide and not against a mark, become walls (blue).
        </Text>
      </Section>

      <Section title="Euler order (Viro's is ZYX)">
        <Choice
          options={DEBUG_EULER_ORDERS}
          value={state.options.eulerOrder}
          onChange={(eulerOrder: EulerOrder) => controller.setOptions({ eulerOrder })}
          color={(o) => EULER_ORDER_COLORS[o]}
        />
        <Text className="text-xs text-white/70">Plane centre as sent by Viro</Text>
        <Choice
          options={CENTER_SPACES}
          value={state.options.centerSpace}
          onChange={(centerSpace: CenterSpace) => controller.setOptions({ centerSpace })}
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
              {row.verdict ? ` · ${row.verdict}` : ''}
            </Mono>
            <Mono>
              size {row.width.toFixed(2)} × {row.height.toFixed(2)} m · centre{' '}
              {formatVec(row.worldCenter)}
            </Mono>
            <Mono>
              pos {formatVec(row.position)} rot {formatVec(row.rotationDeg, 1)}
            </Mono>
            <Mono>
              centre sent {formatVec(row.center)} · {row.vertexCount} vertices
              {row.centerGap !== null ? ` · gap ${(row.centerGap * 100).toFixed(0)} cm` : ''}
            </Mono>
            {row.lines.map((line) => (
              <Text
                key={line.order}
                className="font-mono text-[11px]"
                style={{ color: EULER_ORDER_COLORS[line.order] }}
              >
                {line.order}: {formatLine(line.line)} tilt {line.tiltDeg.toFixed(0)}°
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
