import { describe, expect, it } from 'vitest';
import {
  applyMat3,
  describePlane,
  eulerFromRotationMatrix,
  multiplyMat3,
  rotationMatrixFromEuler,
  wallFromPlane,
  wallFromTaps,
  type EulerOrder,
  type Mat3,
  type Vec3,
} from '../src';
import { mulberry32 } from './helpers';

const ORDERS: EulerOrder[] = ['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'];

function expectVec(actual: Vec3, expected: [number, number, number], digits = 9) {
  expect(actual.x).toBeCloseTo(expected[0], digits);
  expect(actual.y).toBeCloseTo(expected[1], digits);
  expect(actual.z).toBeCloseTo(expected[2], digits);
}

function expectMat(actual: Mat3, expected: Mat3, digits = 9) {
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, digits));
}

// Independent check with quaternions: R(order) = q(A) ⊗ q(B) ⊗ q(C) applied to a vector.
type Quat = [number, number, number, number]; // w, x, y, z
const axisQuat = (axis: 'X' | 'Y' | 'Z', deg: number): Quat => {
  const h = (deg * Math.PI) / 360;
  const s = Math.sin(h);
  return [Math.cos(h), axis === 'X' ? s : 0, axis === 'Y' ? s : 0, axis === 'Z' ? s : 0];
};
const qmul = (a: Quat, b: Quat): Quat => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
const qrotate = (q: Quat, v: [number, number, number]): [number, number, number] => {
  const r = qmul(qmul(q, [0, ...v]), [q[0], -q[1], -q[2], -q[3]]);
  return [r[1], r[2], r[3]];
};

describe('rotationMatrixFromEuler', () => {
  it('rotates about single axes the right-handed way (Y up)', () => {
    expectVec(applyMat3(rotationMatrixFromEuler([0, 90, 0]), [1, 0, 0]), [0, 0, -1]);
    expectVec(applyMat3(rotationMatrixFromEuler([90, 0, 0]), [0, 1, 0]), [0, 0, 1]);
    expectVec(applyMat3(rotationMatrixFromEuler([0, 0, 90]), [1, 0, 0]), [0, 1, 0]);
  });

  it('composes in the given order', () => {
    const angles: [number, number, number] = [30, 50, -20];
    const Rx = rotationMatrixFromEuler([30, 0, 0]);
    const Ry = rotationMatrixFromEuler([0, 50, 0]);
    const Rz = rotationMatrixFromEuler([0, 0, -20]);
    expectMat(rotationMatrixFromEuler(angles, 'YXZ'), multiplyMat3(multiplyMat3(Ry, Rx), Rz));
    expectMat(rotationMatrixFromEuler(angles, 'XYZ'), multiplyMat3(multiplyMat3(Rx, Ry), Rz));
    expectMat(rotationMatrixFromEuler(angles, 'ZYX'), multiplyMat3(multiplyMat3(Rz, Ry), Rx));
  });

  it('defaults to YXZ', () => {
    expectMat(rotationMatrixFromEuler([10, 20, 30]), rotationMatrixFromEuler([10, 20, 30], 'YXZ'));
  });

  it('agrees with quaternion composition and stays orthonormal for every order', () => {
    const rand = mulberry32(42);
    for (const order of ORDERS) {
      for (let k = 0; k < 20; k++) {
        const deg = [rand() * 360 - 180, rand() * 180 - 90, rand() * 360 - 180] as [
          number,
          number,
          number,
        ];
        const R = rotationMatrixFromEuler(deg, order);
        const byAxis = { X: deg[0], Y: deg[1], Z: deg[2] };
        const [a, b, c] = order.split('') as ('X' | 'Y' | 'Z')[];
        const q = qmul(
          qmul(axisQuat(a!, byAxis[a!]), axisQuat(b!, byAxis[b!])),
          axisQuat(c!, byAxis[c!]),
        );
        for (const v of [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
          [0.3, -0.5, 0.8],
        ] as [number, number, number][]) {
          expectVec(applyMat3(R, v), qrotate(q, v));
        }
        // R · Rᵀ = I and det = 1.
        const Rt: Mat3 = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
        expectMat(multiplyMat3(R, Rt), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
        const det =
          R[0] * (R[4] * R[8] - R[5] * R[7]) -
          R[1] * (R[3] * R[8] - R[5] * R[6]) +
          R[2] * (R[3] * R[7] - R[4] * R[6]);
        expect(det).toBeCloseTo(1, 9);
      }
    }
  });

  it('round-trips through eulerFromRotationMatrix for every order', () => {
    const rand = mulberry32(7);
    for (const order of ORDERS) {
      for (let k = 0; k < 20; k++) {
        const R = rotationMatrixFromEuler(
          [rand() * 360 - 180, rand() * 360 - 180, rand() * 360 - 180],
          order,
        );
        expectMat(rotationMatrixFromEuler(eulerFromRotationMatrix(R, order), order), R);
      }
    }
  });

  it('gives different results for different orders', () => {
    const a = rotationMatrixFromEuler([90, 30, 0], 'YXZ');
    const b = rotationMatrixFromEuler([90, 30, 0], 'XYZ');
    expect(Math.max(...a.map((v, i) => Math.abs(v - b[i]!)))).toBeGreaterThan(0.1);
  });
});

/**
 * A wall plane as ARKit/ARCore would report it: local X along the wall (horizontal), local Y the
 * normal, local Z vertical. Built as R = Ry(yaw) · Rx(tilt) with tilt ±90°.
 */
function wallRotation(yawDeg: number, tiltDeg = 90): Mat3 {
  return multiplyMat3(
    rotationMatrixFromEuler([0, yawDeg, 0]),
    rotationMatrixFromEuler([tiltDeg, 0, 0]),
  );
}

describe('wallFromPlane', () => {
  const position: [number, number, number] = [1.2, 1.1, -2.5];

  for (const order of ['YXZ', 'XYZ', 'ZYX'] as EulerOrder[]) {
    describe(`with Euler order ${order}`, () => {
      for (const yaw of [0, 25, 90, 143, -60]) {
        for (const tilt of [90, -90]) {
          it(`finds the floor line of a wall at yaw ${yaw}°, tilt ${tilt}°`, () => {
            const R = wallRotation(yaw, tilt);
            const rotationDeg = eulerFromRotationMatrix(R, order);
            const center: [number, number, number] = [0.4, 0, -0.2];
            const obs = wallFromPlane(
              { id: 'anchor-1', position, rotationDeg, center, width: 2, height: 1.5 },
              0,
              { eulerOrder: order },
            );
            expect(obs).not.toBeNull();
            const worldCenter = applyMat3(R, center);
            const cx = position[0] + worldCenter.x;
            const cz = position[2] + worldCenter.z;
            const yawRad = (yaw * Math.PI) / 180;
            const u = { x: Math.cos(yawRad), z: -Math.sin(yawRad) }; // Ry(yaw) applied to +X
            expect(obs!.id).toBe('anchor-1');
            expect(obs!.source).toBe('plane');
            expect(obs!.a.x).toBeCloseTo(cx - u.x, 9);
            expect(obs!.a.z).toBeCloseTo(cz - u.z, 9);
            expect(obs!.b.x).toBeCloseTo(cx + u.x, 9);
            expect(obs!.b.z).toBeCloseTo(cz + u.z, 9);
          });
        }
      }

      it('misreads the same angles under another order', () => {
        const rotationDeg = eulerFromRotationMatrix(wallRotation(40), order);
        // For a wall, XYZ angles come out as (±90, 0, -yaw), where XYZ and YXZ coincide.
        const other: EulerOrder = order === 'XYZ' ? 'ZYX' : 'XYZ';
        const plane = {
          position,
          rotationDeg,
          center: [0.5, 0, 0.3] as const,
          width: 2,
          height: 2,
        };
        const right = wallFromPlane(plane, 0, { eulerOrder: order });
        const wrong = wallFromPlane(plane, 0, { eulerOrder: other });
        expect(right).not.toBeNull();
        if (wrong) {
          const d = Math.hypot(wrong.a.x - right!.a.x, wrong.a.z - right!.a.z);
          expect(d).toBeGreaterThan(0.1);
        }
      });
    });
  }

  it("reads a wall (no roll) the same under 'YXZ' and 'ZYX', but not 'XYZ'", () => {
    // Ry·Rx·Rz(0) equals Rz(0)·Ry·Rx, so these two orders only differ once there is roll.
    const plane = {
      position,
      rotationDeg: [90, 35, 0] as const,
      center: [0.2, 0, 0.4] as const,
      width: 2,
      height: 2,
    };
    const yxz = wallFromPlane(plane, 0, { eulerOrder: 'YXZ' })!;
    const zyx = wallFromPlane(plane, 0, { eulerOrder: 'ZYX' })!;
    const xyz = wallFromPlane(plane, 0, { eulerOrder: 'XYZ' })!;
    expect(zyx.a.x).toBeCloseTo(yxz.a.x, 9);
    expect(zyx.b.z).toBeCloseTo(yxz.b.z, 9);
    expect(Math.hypot(xyz.a.x - yxz.a.x, xyz.a.z - yxz.a.z)).toBeGreaterThan(0.1);
  });

  it('rejects floors, tilted planes and narrow planes', () => {
    const floor = describePlane(
      { position: [0, 0, 0], rotationDeg: [0, 0, 0], width: 3, height: 3 },
      0,
    );
    expect(floor.observation).toBeNull();
    expect(floor.rejected).toBe('not-vertical');
    expect(floor.tiltDeg).toBeCloseTo(90, 9);

    const leaning = eulerFromRotationMatrix(wallRotation(10, 70));
    expect(wallFromPlane({ position, rotationDeg: leaning, width: 2, height: 2 }, 0)).toBeNull();
    const slight = eulerFromRotationMatrix(wallRotation(10, 80));
    expect(wallFromPlane({ position, rotationDeg: slight, width: 2, height: 2 }, 0)).not.toBeNull();

    const narrow = describePlane(
      { position, rotationDeg: eulerFromRotationMatrix(wallRotation(0)), width: 0.1, height: 2 },
      0,
    );
    expect(narrow.rejected).toBe('too-narrow');
  });

  it("picks the more horizontal axis with horizontalAxis: 'auto'", () => {
    // A plane whose local Z runs along the floor and local X is vertical.
    const R = multiplyMat3(wallRotation(30), rotationMatrixFromEuler([0, 90, 0]));
    const rotationDeg = eulerFromRotationMatrix(R);
    const plane = { position, rotationDeg, width: 1.5, height: 3 };
    expect(describePlane(plane, 0).rejected).toBe('axis-not-horizontal');
    const obs = wallFromPlane(plane, 0, { horizontalAxis: 'auto' });
    expect(obs).not.toBeNull();
    expect(Math.hypot(obs!.b.x - obs!.a.x, obs!.b.z - obs!.a.z)).toBeCloseTo(3, 9);
  });

  it('lowers the confidence of planes that float above the floor', () => {
    const rotationDeg = eulerFromRotationMatrix(wallRotation(0));
    const low = wallFromPlane({ position: [0, 1, 0], rotationDeg, width: 2, height: 2 }, 0);
    const high = wallFromPlane({ position: [0, 2, 0], rotationDeg, width: 2, height: 1 }, 0);
    expect(low!.confidence).toBe(1);
    expect(high!.confidence).toBeCloseTo(0.25, 9);
  });

  it('returns the raw plane for a debug overlay', () => {
    const R = wallRotation(0);
    const d = describePlane(
      { position: [0, 1, -2], rotationDeg: eulerFromRotationMatrix(R), width: 2, height: 1 },
      0,
    );
    expectVec(d.center, [0, 1, -2]);
    expectVec(d.normal, [0, 0, 1]);
    expectVec(d.xAxis, [1, 0, 0]);
    expect(d.tiltDeg).toBeCloseTo(0, 9);
    expect(d.corners).toHaveLength(4);
    expectVec(d.corners[0], [-1, 1.5, -2]);
    expectVec(d.corners[2], [1, 0.5, -2]);
  });

  it('rejects non-finite input', () => {
    const d = describePlane(
      { position: [Number.NaN, 0, 0], rotationDeg: [90, 0, 0], width: 2, height: 2 },
      0,
    );
    expect(d.observation).toBeNull();
    expect(d.rejected).toBe('invalid-input');
  });
});

describe('wallFromTaps', () => {
  it('uses the XZ of two floor taps', () => {
    expect(wallFromTaps([1, 0.02, 2], [3, 0.01, 2.5], 'tap-1')).toEqual({
      id: 'tap-1',
      source: 'tap',
      a: { x: 1, z: 2 },
      b: { x: 3, z: 2.5 },
      confidence: 1,
    });
    expect(wallFromTaps({ x: 0, z: 1 }, { x: 2, z: 1 }, 't').b).toEqual({ x: 2, z: 1 });
  });
});
