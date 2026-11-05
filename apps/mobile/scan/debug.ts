/**
 * Data for the scan's debug overlay, so the team can check the wall maths on real phones.
 *
 * ViroReact sends each anchor's rotation as Euler angles but does not say in which order they
 * apply. For wall planes core's 'YXZ' and 'ZYX' give the same line and 'XYZ' a different one.
 * The overlay draws the line from each order on the floor, next to the plane as Viro itself
 * places it, so whoever holds the phone can see which order matches the real wall.
 */
import {
  describePlane,
  type EulerOrder,
  type PlaneRejection,
  type Vec3,
  type Vec3Tuple,
  type WallObservation,
} from '@youngvista/core';
import type { ScanState } from './session';
import type { PlaneAlignment } from './viro-anchor';

export const DEBUG_EULER_ORDERS: readonly EulerOrder[] = ['YXZ', 'ZYX', 'XYZ'];

/** Line colours per order, used in AR and in the list. */
export const EULER_ORDER_COLORS: Record<EulerOrder, string> = {
  YXZ: '#ef4444',
  ZYX: '#22c55e',
  XYZ: '#3b82f6',
  XZY: '#a855f7',
  YZX: '#f59e0b',
  ZXY: '#14b8a6',
};

export interface DebugWallLine {
  order: EulerOrder;
  observation: WallObservation | null;
  rejected?: PlaneRejection;
  /** 0 for a perfectly vertical plane. */
  tiltDeg: number;
}

export interface PlaneDebugRow {
  id: string;
  /** Last characters of the id, for the list. */
  label: string;
  alignment: PlaneAlignment;
  classification: string | null;
  position: Vec3Tuple;
  rotationDeg: Vec3Tuple;
  localCenter: Vec3Tuple;
  width: number;
  height: number;
  /** Centre of the plane in the world, with the scan's current Euler order. */
  worldCenter: Vec3;
  vertexCount: number;
  /** One line per order in DEBUG_EULER_ORDERS (vertical planes only). */
  lines: DebugWallLine[];
}

export const shortId = (id: string): string => (id.length > 6 ? id.slice(-6) : id);

export function planeDebugRows(state: ScanState, floorY: number | null): PlaneDebugRow[] {
  const y = floorY ?? 0;
  return Object.values(state.planes)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((plane) => {
      const current = describePlane(plane.anchor, y, { eulerOrder: state.options.eulerOrder });
      const lines =
        plane.alignment === 'Vertical'
          ? DEBUG_EULER_ORDERS.map((order): DebugWallLine => {
              const d = describePlane(plane.anchor, y, {
                eulerOrder: order,
                horizontalAxis: state.options.horizontalAxis,
                id: plane.id,
              });
              return {
                order,
                observation: d.observation,
                tiltDeg: d.tiltDeg,
                ...(d.rejected ? { rejected: d.rejected } : {}),
              };
            })
          : [];
      return {
        id: plane.id,
        label: shortId(plane.id),
        alignment: plane.alignment,
        classification: plane.classification,
        position: plane.anchor.position,
        rotationDeg: plane.anchor.rotationDeg,
        localCenter: plane.anchor.center,
        width: plane.anchor.width,
        height: plane.anchor.height,
        worldCenter: current.center,
        vertexCount: plane.vertexCount,
        lines,
      };
    });
}

/** Fixed decimals without a "-0.00". */
function fixed(n: number, digits = 2): string {
  const s = n.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

/** `[1.20, -0.05, 3.00]` */
export const formatVec = (v: Vec3Tuple | Vec3, digits = 2): string => {
  const [x, y, z] = 'x' in v ? [v.x, v.y, v.z] : v;
  return `[${fixed(x, digits)}, ${fixed(y, digits)}, ${fixed(z, digits)}]`;
};

/** `(1.20, -2.00) → (3.10, -2.00)` */
export function formatLine(o: WallObservation | null): string {
  if (!o) return '—';
  return `(${fixed(o.a.x)}, ${fixed(o.a.z)}) → (${fixed(o.b.x)}, ${fixed(o.b.z)})`;
}
