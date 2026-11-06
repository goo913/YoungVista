/**
 * Data for the scan's debug overlay, so the team can check the AR maths on real phones.
 *
 * Viro's anchor rotation is R = Rz·Ry·Rx (core's 'ZYX', read from ViroCore's source; see
 * viro-anchor.ts). The overlay still draws, for each wall plane, the floor line each of three
 * Euler orders gives, so whoever holds the phone can see that the green (ZYX) line runs along the
 * bottom of the real wall. `centerGap` checks the other finding: the middle of a plane's vertices
 * should match its centre as Viro reports it (world space on iPhone, the origin on Android).
 */
import type { EulerOrder, Vec2, Vec3, Vec3Tuple } from '@youngvista/core';
import {
  planeExtentCorners,
  planeTiltDeg,
  planeWallLine,
  planeWorldCenter,
  planeWorldVertices,
} from './planes';
import type { PlaneWallVerdict, ScanDerived, ScanState } from './session';
import type { PlaneAlignment } from './viro-anchor';

/** ZYX first: it is Viro's own. */
export const DEBUG_EULER_ORDERS: readonly EulerOrder[] = ['ZYX', 'YXZ', 'XYZ'];

/** Line colours per order, used in AR and in the list. */
export const EULER_ORDER_COLORS: Record<EulerOrder, string> = {
  ZYX: '#22c55e',
  YXZ: '#ef4444',
  XYZ: '#3b82f6',
  XZY: '#a855f7',
  YZX: '#f59e0b',
  ZXY: '#14b8a6',
};

export interface DebugWallLine {
  order: EulerOrder;
  /** Where the plane meets the floor with this order, or null when it is not upright with it. */
  line: { a: Vec2; b: Vec2 } | null;
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
  /** `center` as Viro sent it. */
  center: Vec3Tuple;
  width: number;
  height: number;
  /** Centre in the world, with the scan's Euler order and centre convention. */
  worldCenter: Vec3;
  vertexCount: number;
  /** Distance from the middle of the vertices to `worldCenter` (m); small when the convention is right. */
  centerGap: number | null;
  /** The plane's outline in the world (its vertices, or its extent rectangle). */
  outline: Vec3[];
  /** One line per order in DEBUG_EULER_ORDERS (vertical planes only). */
  lines: DebugWallLine[];
  /** What "Use detected walls (test)" made of it. */
  verdict: PlaneWallVerdict | null;
}

export const shortId = (id: string): string => (id.length > 6 ? id.slice(-6) : id);

export function planeDebugRows(state: ScanState, derived: ScanDerived): PlaneDebugRow[] {
  const { eulerOrder, centerSpace } = state.options;
  return Object.values(state.planes)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((plane) => {
      const vertices = planeWorldVertices(plane, eulerOrder);
      const worldCenter = planeWorldCenter(plane, eulerOrder, centerSpace);
      let centerGap: number | null = null;
      if (vertices.length >= 3) {
        const m = vertices.reduce((s, v) => ({ x: s.x + v.x, y: s.y + v.y, z: s.z + v.z }), {
          x: 0,
          y: 0,
          z: 0,
        });
        const n = vertices.length;
        centerGap = Math.hypot(
          m.x / n - worldCenter.x,
          m.y / n - worldCenter.y,
          m.z / n - worldCenter.z,
        );
      }
      const lines =
        plane.alignment === 'Vertical'
          ? DEBUG_EULER_ORDERS.map((order): DebugWallLine => {
              const l = planeWallLine(plane, order, centerSpace);
              const at = (s: number) =>
                l ? { x: l.point.x + l.direction.x * s, z: l.point.z + l.direction.z * s } : null;
              return {
                order,
                line: l ? { a: at(l.from)!, b: at(l.to)! } : null,
                tiltDeg: planeTiltDeg(plane, order),
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
        center: plane.anchor.center,
        width: plane.anchor.width,
        height: plane.anchor.height,
        worldCenter,
        vertexCount: plane.vertices.length / 3,
        centerGap,
        outline:
          vertices.length >= 3 ? vertices : planeExtentCorners(plane, eulerOrder, centerSpace),
        lines,
        verdict: derived.planeWalls.find((c) => c.planeId === plane.id)?.verdict ?? null,
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
export function formatLine(l: { a: Vec2; b: Vec2 } | null): string {
  if (!l) return '—';
  return `(${fixed(l.a.x)}, ${fixed(l.a.z)}) → (${fixed(l.b.x)}, ${fixed(l.b.z)})`;
}
