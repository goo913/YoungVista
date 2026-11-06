/**
 * Flying through a room with the keys, Minecraft's spectator mode: the pure half of the website 3D
 * view's Fly mode. Level W A S D where the head is turned, Space up, Shift (or C) down, a
 * double-tapped W twice as fast, the wheel picks the pace; getting going and stopping with a short
 * glide; through anything, kept round the room and above its floor. Plus the hand-offs between a
 * flight and the orbit camera (take off where the orbit camera is, land back on it).
 *
 * Ported from the team's closet designer (TAKEOFFPRIME, branch avena/closet-ux): the fly logic of
 * `src/brands/avena/tools/measurement/components/Closet3DView.jsx` (`advanceFly`, `flyClamp`,
 * the wheel's pace, `flyFromOrbit`, `orbitFromFly`) and the fly settings of `closet/look3d.js`,
 * with every constant converted from inches to metres.
 */

/** Metres in an inch: the closet's constants are in inches. */
const IN = 0.0254;

export interface FlyConfig {
  /** Flying pace (m/s), and how much faster a double-tapped W makes it. */
  speed: number;
  sprintFactor: number;
  /** The paces the wheel picks from (× `speed`), as Minecraft's spectator wheel does. */
  speeds: readonly number[];
  /** The share of the way to the pace wanted made good a second: quick, with a short glide. */
  response: number;
  /** W pressed twice this close together (ms) sprints. */
  doubleTapMs: number;
  /** Wheel delta, in pixels, that is one step of the pace. */
  wheelStepPx: number;
  /** How far past the room a flight may go (m), and how low the eyes may come: never under the floor. */
  roam: number;
  minEye: number;
  /** How far a click reaches flying (m): across the room and well beyond. */
  reach: number;
  /** A step ahead or back (m), for zoom buttons. */
  zoomStep: number;
}

/** The closet's fly settings, inch for inch, in metres. */
export const FLY: FlyConfig = {
  speed: 66 * IN,
  sprintFactor: 2,
  speeds: [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4],
  response: 9,
  doubleTapMs: 320,
  wheelStepPx: 60,
  roam: 480 * IN,
  minEye: 3 * IN,
  reach: 1400 * IN,
  zoomStep: 24 * IN,
};

/** Where a flight is (m) and how it looks and moves: yaw from +z toward +x, pitch up. */
export interface Flight {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  vx: number;
  vy: number;
  vz: number;
}

/** A box a flight stays in (m). */
export interface FlyBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** The keys held: W/S, D/A and Space/Shift as −1…1, a sprint, and the wheel's pace (× speed). */
export interface FlyInput {
  fwd?: number;
  right?: number;
  up?: number;
  sprint?: boolean;
  pace?: number;
}

/** The box round the room's parts that a flight may roam: `roam` past it every way. */
export function flyBox(
  bounds: { min: readonly number[]; max: readonly number[] },
  cfg: Pick<FlyConfig, 'roam'> = FLY,
): FlyBox {
  const r = cfg.roam;
  return {
    min: { x: bounds.min[0]! - r, y: bounds.min[1]! - r, z: bounds.min[2]! - r },
    max: { x: bounds.max[0]! + r, y: bounds.max[1]! + r, z: bounds.max[2]! + r },
  };
}

/** Keeps a point round the room (`box`) and its eyes over the floor. */
export function flyClamp(
  x: number,
  y: number,
  z: number,
  box: FlyBox | null,
  cfg: Pick<FlyConfig, 'minEye'> = FLY,
): { x: number; y: number; z: number } {
  const lo = cfg.minEye;
  if (!box) return { x, y: Math.max(lo, y), z };
  return {
    x: Math.max(box.min.x, Math.min(box.max.x, x)),
    y: Math.max(lo, Math.min(box.max.y, y)),
    z: Math.max(box.min.z, Math.min(box.max.z, z)),
  };
}

/**
 * One frame of a flight, `dt` seconds long. `moved` is false when nothing is held and the glide
 * has run out (the flight then stops dead, and no frame is due).
 */
export function advanceFlight(
  f: Flight,
  input: FlyInput,
  dt: number,
  box: FlyBox | null,
  cfg: FlyConfig = FLY,
): { flight: Flight; moved: boolean } {
  if (!(dt > 0)) return { flight: f, moved: false };
  const fwd = input.fwd || 0;
  const right = input.right || 0;
  const up = input.up || 0;
  const pace = cfg.speed * (input.pace ?? 1) * (input.sprint && fwd > 0 ? cfg.sprintFactor : 1);
  const sx = Math.sin(f.yaw);
  const cz = Math.cos(f.yaw);
  let wx = sx * fwd - cz * right;
  let wz = cz * fwd + sx * right;
  const n = Math.hypot(wx, wz);
  if (n > 1) {
    wx /= n;
    wz /= n;
  }
  const a = 1 - Math.exp(-cfg.response * dt);
  const vx = f.vx + (wx * pace - f.vx) * a;
  const vy = f.vy + (up * pace - f.vy) * a;
  const vz = f.vz + (wz * pace - f.vz) * a;
  if (!fwd && !right && !up && Math.hypot(vx, vy, vz) < 1.5 * IN) {
    const still = f.vx || f.vy || f.vz ? { ...f, vx: 0, vy: 0, vz: 0 } : f;
    return { flight: still, moved: false };
  }
  return {
    flight: {
      ...f,
      ...flyClamp(f.x + vx * dt, f.y + vy * dt, f.z + vz * dt, box, cfg),
      vx,
      vy,
      vz,
    },
    moved: true,
  };
}

/**
 * Flies `fwd` m ahead (where the head points, up and down too), `right` to the side and `up`
 * straight up: through anything, kept round the room and over its floor.
 */
export function flyBy(
  f: Flight,
  fwd: number,
  right = 0,
  up = 0,
  box: FlyBox | null = null,
): Flight {
  const cp = Math.cos(f.pitch);
  const sx = Math.sin(f.yaw);
  const cz = Math.cos(f.yaw);
  return {
    ...f,
    ...flyClamp(
      f.x + sx * cp * fwd - cz * right,
      f.y + Math.sin(f.pitch) * fwd + up,
      f.z + cz * cp * fwd + sx * right,
      box,
    ),
  };
}

/** The wheel's next flying pace: a step up (`dir` 1) or down (−1) the list of paces. */
export function nextFlySpeed(current: number, dir: number, cfg: Pick<FlyConfig, 'speeds'> = FLY) {
  const i = cfg.speeds.indexOf(current);
  const from = i < 0 ? cfg.speeds.indexOf(1) : i;
  return cfg.speeds[Math.max(0, Math.min(cfg.speeds.length - 1, from + Math.sign(dir)))]!;
}

/**
 * The wheel while flying: travel adds up until it is one step of the pace (`wheelStepPx`). Returns
 * the new travel and the step (+1 faster, −1 slower, 0 none yet). Rolling forward (negative delta)
 * flies faster, as in Minecraft.
 */
export function flyWheel(
  travel: number,
  deltaY: number,
  cfg: Pick<FlyConfig, 'wheelStepPx'> = FLY,
): { travel: number; step: number } {
  const t = travel + deltaY;
  if (Math.abs(t) < cfg.wheelStepPx) return { travel: t, step: 0 };
  return { travel: 0, step: t < 0 ? 1 : -1 };
}

/** Into the air where the orbit camera is, looking where it looks. */
export function flightFromCamera(
  position: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
): Flight {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const dz = target.z - position.z;
  return {
    x: position.x,
    y: position.y,
    z: position.z,
    yaw: Math.atan2(dx, dz),
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
    vx: 0,
    vy: 0,
    vz: 0,
  };
}

/**
 * …and back down: the orbit camera where the flight is, turning about a point ahead of it as far
 * off as the room's middle (`mid`, with `radius` the room's size), between 24″ and 7 radii.
 */
export function orbitFromFlight(
  f: Pick<Flight, 'x' | 'y' | 'z' | 'yaw' | 'pitch'>,
  mid: { x: number; y: number; z: number },
  radius: number,
): { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } {
  const d = Math.max(
    24 * IN,
    Math.min(radius * 7, Math.hypot(f.x - mid.x, f.y - mid.y, f.z - mid.z)),
  );
  const cp = Math.cos(f.pitch);
  return {
    position: { x: f.x, y: f.y, z: f.z },
    target: {
      x: f.x + Math.sin(f.yaw) * cp * d,
      y: f.y + Math.sin(f.pitch) * d,
      z: f.z + Math.cos(f.yaw) * cp * d,
    },
  };
}

/**
 * Where the eyes of a flight or a walk look: a point one metre ahead along yaw and pitch, for a
 * camera's `lookAt`.
 */
export function lookTarget(p: { x: number; y: number; z: number; yaw: number; pitch: number }): {
  x: number;
  y: number;
  z: number;
} {
  const cp = Math.cos(p.pitch);
  return {
    x: p.x + Math.sin(p.yaw) * cp,
    y: p.y + Math.sin(p.pitch),
    z: p.z + Math.cos(p.yaw) * cp,
  };
}
