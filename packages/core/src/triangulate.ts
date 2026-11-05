import type { Vec2 } from './types';
import type { Point } from './polygon';
import { signedArea } from './polygon';

const toVec = (p: Point | Vec2): Vec2 => (Array.isArray(p) ? { x: p[0], z: p[1] } : p);

/** Positive when a → b → c turns counter-clockwise seen from above (same sign as `signedArea`). */
const turnAt = (a: Vec2, b: Vec2, c: Vec2): number =>
  (b.z - a.z) * (c.x - b.x) - (b.x - a.x) * (c.z - b.z);

/** True if p is inside or on the edge of the counter-clockwise triangle a, b, c. */
function inTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2, eps: number): boolean {
  return turnAt(a, b, p) >= -eps && turnAt(b, c, p) >= -eps && turnAt(c, a, p) >= -eps;
}

/**
 * Triangulates a simple polygon (convex or not, either winding) by ear clipping.
 *
 * Returns three indices into `points` per triangle, each triangle counter-clockwise seen from
 * above, so lifted onto the floor (x, 0, z) it faces +Y. Repeated and collinear corners are
 * allowed; they produce no zero-area triangles.
 */
export function triangulatePolygon(points: readonly (Point | Vec2)[]): number[] {
  const pts = points.map(toVec);
  if (pts.length < 3) return [];

  // Work counter-clockwise; drop corners that repeat their predecessor.
  let order = pts.map((_, i) => i);
  if (signedArea(pts) < 0) order.reverse();
  order = order.filter((idx, k) => {
    const prev = pts[order[(k - 1 + order.length) % order.length]!]!;
    const p = pts[idx]!;
    return Math.abs(p.x - prev.x) > 1e-12 || Math.abs(p.z - prev.z) > 1e-12;
  });

  // Tolerance for turn tests, scaled to the polygon size (turnAt is in m²).
  let size = 0;
  for (const p of pts) size = Math.max(size, Math.abs(p.x), Math.abs(p.z));
  const eps = 1e-12 * Math.max(1, size * size);

  const out: number[] = [];
  const ring = [...order];
  let guard = ring.length * ring.length + 10;
  while (ring.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let k = 0; k < ring.length; k++) {
      const ia = ring[(k - 1 + ring.length) % ring.length]!;
      const ib = ring[k]!;
      const ic = ring[(k + 1) % ring.length]!;
      const a = pts[ia]!;
      const b = pts[ib]!;
      const c = pts[ic]!;
      const t = turnAt(a, b, c);
      if (Math.abs(t) <= eps) {
        // A straight corner adds no area. Remove it if it lies between its neighbours.
        const between = (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z) >= 0;
        if (between) {
          ring.splice(k, 1);
          clipped = true;
          break;
        }
        continue;
      }
      if (t < 0) continue; // reflex corner
      // An ear: no other remaining corner inside or on the triangle.
      let blocked = false;
      for (const j of ring) {
        if (j === ia || j === ib || j === ic) continue;
        const p = pts[j]!;
        if ((p.x === a.x && p.z === a.z) || (p.x === c.x && p.z === c.z)) continue;
        if (inTriangle(p, a, b, c, eps)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      out.push(ia, ib, ic);
      ring.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      // Not a simple polygon (or numerically awkward): clip the most convex corner so the loop ends.
      let best = 0;
      let bestTurn = -Infinity;
      for (let k = 0; k < ring.length; k++) {
        const t = turnAt(
          pts[ring[(k - 1 + ring.length) % ring.length]!]!,
          pts[ring[k]!]!,
          pts[ring[(k + 1) % ring.length]!]!,
        );
        if (t > bestTurn) {
          bestTurn = t;
          best = k;
        }
      }
      if (bestTurn > eps) {
        out.push(
          ring[(best - 1 + ring.length) % ring.length]!,
          ring[best]!,
          ring[(best + 1) % ring.length]!,
        );
      }
      ring.splice(best, 1);
    }
  }
  if (ring.length === 3) {
    const [ia, ib, ic] = ring as [number, number, number];
    if (turnAt(pts[ia]!, pts[ib]!, pts[ic]!) > eps) out.push(ia, ib, ic);
  }
  return out;
}
