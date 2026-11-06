/**
 * THE HAND: Walk mode's first-person right hand, what makes a walk feel like being there, and
 * what shows what a click did. Games draw the player's hands in a pass of their own, with a fixed
 * field of view of their own, over the world (Source draws the world at 75° and the hands at 54°),
 * so a hand never sinks into a wall and keeps its size whatever field of view a person picks.
 *
 * Ported from the team's closet designer (TAKEOFFPRIME, branch avena/closet-ux):
 * `src/brands/avena/tools/measurement/components/closet3dHand.js`, unchanged in behaviour. The
 * hand is MakeHuman's (CC0, see `src/assets/hand3d/LICENSE.md`), rigged with the 25 joints of
 * the WebXR Hand Input spec. Its fingers bend at their real knuckles: a pose is a bend at each
 * joint, set bone by bone down each finger. It wears the person's skin tone and a sleeve. It
 * moves by itself:
 *
 *   idle      a slow breath
 *   walk      swinging with each step (the camera bobs less, so the step shows in the hand)
 *   look      trailing a turn of the head a moment, then catching up
 *
 * and acts when told (`play`):
 *
 *   press     a pointing tap: nothing in reach, or a piece put down where it was
 *   grab      reach, close round it, bring it back: a piece picked up
 *   yank      grab and pull away: a piece taken away
 *   release   open the hand forward: a piece put down
 *
 * and `setCarry(true)` keeps it closed and raised while a piece is held.
 *
 * The hand lives in a scene and a camera of its own, never in the room, so it keeps the closet's
 * own frame in INCHES: the wrist at the origin, the fingers along −z, the back of the hand up
 * (+y), the thumb on the −x side (a right hand, palm down). The arm group sits in the hand
 * camera's space (the camera at the origin, looking down −z).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WALK, type SkinTone } from '@youngvista/core';

const HAND_URL = new URL('../../assets/hand3d/right.glb', import.meta.url).href;
/** Its photographed skins (core's SKIN_TONES says which a tone wears). */
const SKIN_URLS: Record<string, string> = {
  light: new URL('../../assets/hand3d/skin-light.jpg', import.meta.url).href,
  dark: new URL('../../assets/hand3d/skin-dark.jpg', import.meta.url).href,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (t: number) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 → 1 over [a, b], smoothly. */
const ramp = (u: number, a: number, b: number) => smooth((u - a) / Math.max(1e-6, b - a));
/** Up over [a, b], held, back down over [c, d]. */
const hill = (u: number, a: number, b: number, c: number, d: number) =>
  ramp(u, a, b) * (1 - ramp(u, c, d));

// ── the model ───────────────────────────────────────────────────────────────────────────────
/** Metres in the file, inches here. */
const M_TO_IN = 39.3701;
/** The file's frame (fingers −y, back of the hand +x, thumb −z) to the hand's (fingers −z, back +y, thumb −x). */
const FROM_MODEL = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);

type ChainName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
/** Each chain of joints, base to tip; `from` is the first joint that bends. */
const CHAINS: { name: ChainName; from: number; joints: string[] }[] = [
  {
    name: 'thumb',
    from: 0,
    joints: ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  },
  ...(['index', 'middle', 'ring', 'pinky'] as const).map((f) => ({
    name: f,
    from: 1,
    joints: [
      `${f}-finger-metacarpal`,
      `${f}-finger-phalanx-proximal`,
      `${f}-finger-phalanx-intermediate`,
      `${f}-finger-phalanx-distal`,
      `${f}-finger-tip`,
    ],
  })),
];

type PoseName = 'rest' | 'point' | 'grip' | 'flat';
type Pose = Record<ChainName, [number, number, number]> & { swing: number };
/** How the hand stands: each chain's three bends (radians, toward the palm), and the thumb's swing. */
const POSES: Record<PoseName, Pose> = {
  rest: {
    thumb: [0.02, 0.16, 0.16],
    index: [0.14, 0.24, 0.12],
    middle: [0.2, 0.3, 0.15],
    ring: [0.26, 0.36, 0.18],
    pinky: [0.32, 0.42, 0.2],
    swing: -0.18,
  },
  point: {
    thumb: [0.3, 0.55, 0.45],
    index: [0.04, 0.04, 0.02],
    middle: [1.35, 1.6, 0.85],
    ring: [1.4, 1.62, 0.88],
    pinky: [1.45, 1.66, 0.9],
    swing: 0.45,
  },
  grip: {
    thumb: [0.32, 0.5, 0.42],
    index: [1.0, 1.22, 0.7],
    middle: [1.08, 1.3, 0.74],
    ring: [1.14, 1.36, 0.78],
    pinky: [1.2, 1.4, 0.82],
    swing: 0.5,
  },
  flat: {
    thumb: [-0.08, 0.05, 0.05],
    index: [0.05, 0.05, 0.03],
    middle: [0.04, 0.05, 0.03],
    ring: [0.06, 0.07, 0.04],
    pinky: [0.08, 0.09, 0.05],
    swing: -0.05,
  },
};

/** Where the arm rests in the hand camera's view, and how it is turned; `HOLD` with a piece in hand. */
const REST = { p: [5.3, -5.6, -12.4], r: [0.2, 0.42, 0.1] };
const HOLD = { p: [4.6, -4.7, -13.0], r: [0.32, 0.5, 0.16] };

export type HandAction = 'press' | 'grab' | 'yank' | 'release';
/** Each action's length, seconds. */
const ACTIONS: Record<HandAction, number> = { press: 0.32, grab: 0.46, yank: 0.5, release: 0.36 };

interface Chain {
  name: ChainName;
  from: number;
  nodes: THREE.Object3D[];
  p0: THREE.Vector3[];
  q0: THREE.Quaternion[];
  off: (THREE.Vector3 | null)[];
  rel: (THREE.Quaternion | null)[];
}

export interface Hand {
  setSkin: (tone: SkinTone) => void;
  setVisible: (on: boolean) => void;
  readonly visible: boolean;
  setAspect: (aspect: number) => void;
  play: (kind: HandAction) => void;
  setCarry: (on: boolean) => void;
  /** The head turned by (yaw, pitch) radians since the last frame. */
  look: (dYaw: number, dPitch: number) => void;
  /** One frame; the body's step cycle and the light's direction in the camera's frame. Returns whether the hand still moves. */
  update: (
    dt: number,
    frame?: { phase?: number; stride?: number; light?: THREE.Vector3 | null },
  ) => boolean;
  /** Draws the hand over the frame already on screen. */
  render: (renderer: THREE.WebGLRenderer) => void;
  dispose: () => void;
}

export function createHand(): Hand {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(WALK.handFovDeg, 1, 0.5, 200);
  // lit like the room: from the light's way (`update`), the sky above and the floor's bounce
  // below, a little cool fill from the side
  const hemi = new THREE.HemisphereLight(0xf4f1ec, 0x4a4038, 0.35);
  const key = new THREE.DirectionalLight(0xfff2e4, 1.5);
  const fill = new THREE.DirectionalLight(0xdfe7ff, 0.3);
  fill.position.set(-30, 10, 20);
  // the room behind, catching the hand's far edge
  const rim = new THREE.DirectionalLight(0xffffff, 0.5);
  rim.position.set(10, 14, -40);
  scene.add(hemi, key, key.target, fill, rim);

  const own: { dispose?: () => void }[] = [];
  const keep = <T extends { dispose?: () => void }>(x: T): T => {
    own.push(x);
    return x;
  };
  const skin = keep(
    new THREE.MeshPhysicalMaterial({
      color: 0xc68a5e,
      roughness: 0.58,
      metalness: 0,
      sheen: 0.3,
      sheenRoughness: 0.5,
      clearcoat: 0.04,
      clearcoatRoughness: 0.7,
    }),
  );
  // the forearm, inside the sleeve: the skin's own colour, no photograph
  const skinPlain = keep(
    new THREE.MeshStandardMaterial({ color: 0xb3856c, roughness: 0.6, metalness: 0 }),
  );
  const knit = keep(
    new THREE.MeshPhysicalMaterial({
      color: 0x3e4958,
      roughness: 0.92,
      metalness: 0,
      sheen: 1,
      sheenRoughness: 0.7,
      sheenColor: new THREE.Color(0x8b97a8),
      side: THREE.DoubleSide,
    }),
  );
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D) => {
    const m = new THREE.Mesh(keep(geo), mat);
    parent.add(m);
    return m;
  };

  // ── the arm: the hand on the wrist, then a forearm and a sleeve fitted to the file's wrist ──
  const arm = new THREE.Group();
  arm.rotation.order = 'YXZ';
  scene.add(arm);
  /** The forearm carries on from the hand's own wrist end; a long sleeve with a knit cuff covers the join. */
  const fitArm = ({
    z,
    cx,
    cy,
    rx,
    ry,
  }: {
    z: number;
    cx: number;
    cy: number;
    rx: number;
    ry: number;
  }) => {
    const forearm = new THREE.CylinderGeometry(1.42, 1, 11, 36, 1, true);
    forearm.rotateX(Math.PI / 2);
    forearm.scale(rx, ry, 1);
    forearm.translate(cx, cy, z - 0.2 + 5.5);
    mesh(forearm, skinPlain, arm);
    const sx = (rx + 0.42) / 1.34;
    const sy = (ry + 0.42) / 1.34;
    const sleeve = new THREE.CylinderGeometry(2.1, 1.34, 11, 44, 1, true);
    sleeve.rotateX(Math.PI / 2);
    sleeve.scale(sx * 1.05, sy * 1.05, 1);
    sleeve.translate(cx, cy, z + 0.25 + 5.5);
    mesh(sleeve, knit, arm);
    const cuff = new THREE.TorusGeometry(1.34, 0.22, 14, 52);
    cuff.scale(sx, sy, 1);
    cuff.translate(cx, cy, z + 0.25);
    mesh(cuff, knit, arm);
  };

  const wrist = new THREE.Group();
  wrist.rotation.order = 'YXZ';
  arm.add(wrist);

  let chains: Chain[] | null = null;
  let loaded = false;
  let disposed = false;
  // the tone: a photographed skin, brighter or darker, so the hue stays the skin's own
  let tone: { hex: string; texture: string; gain: number } = {
    hex: '#b3856c',
    texture: 'light',
    gain: 0.68,
  };
  const texLoader = new THREE.TextureLoader();
  const skinTex: Record<string, THREE.Texture> = {};

  // ── motion ──
  const st = {
    t: 0,
    act: null as { kind: HandAction; t: number } | null,
    carry: 0, // 0 … 1, eased toward carryTo
    carryTo: 0,
    sx: 0, // the look's trail: offset and its speed, both axes
    sy: 0,
    vx: 0,
    vy: 0,
    dirty: true,
  };

  const applySkin = () => {
    const url = SKIN_URLS[tone.texture];
    if (url && !skinTex[url]) {
      const tex = texLoader.load(url, () => {
        st.dirty = true;
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      skinTex[url] = keep(tex);
    }
    const c = new THREE.Color(tone.hex);
    skin.map = url ? (skinTex[url] ?? null) : null;
    if (url) skin.color.setScalar(tone.gain ?? 1);
    else skin.color.copy(c);
    // a little of its own light (a cheap stand-in for skin letting light in and back out), and a
    // sheen a touch warmer and lighter than the skin
    skin.emissive.copy(c).multiplyScalar(0.05);
    skin.sheenColor.copy(c.clone().lerp(new THREE.Color(0xffd9c7), 0.5));
    skin.needsUpdate = true;
    skinPlain.color.copy(c);
    st.dirty = true;
  };

  new GLTFLoader().load(
    HAND_URL,
    (gltf) => {
      if (disposed) return;
      const root = gltf.scene;
      const byName: Record<string, THREE.Object3D> = {};
      root.traverse((o) => {
        if (o.name) byName[o.name] = o;
        const sm = o as THREE.SkinnedMesh;
        if (sm.isSkinnedMesh) {
          (sm.material as THREE.Material | undefined)?.dispose?.();
          sm.material = skin;
          sm.frustumCulled = false; // its joints move it out of its own box
          own.push(sm.geometry);
        }
      });
      const w0 = byName.wrist?.position.clone() ?? new THREE.Vector3();
      // file to hand: scaled to inches, turned, the wrist at the origin
      const holder = new THREE.Group();
      holder.matrixAutoUpdate = false;
      holder.matrix
        .makeScale(M_TO_IN, M_TO_IN, M_TO_IN)
        .multiply(FROM_MODEL)
        .multiply(new THREE.Matrix4().makeTranslation(-w0.x, -w0.y, -w0.z));
      holder.add(root);
      wrist.add(holder);
      // each joint as the file has it, and how each sits on the one before
      chains = CHAINS.flatMap((c): Chain[] => {
        const nodes = c.joints.map((n) => byName[n]);
        if (nodes.some((n) => !n)) return [];
        const ns = nodes as THREE.Object3D[];
        const p0 = ns.map((n) => n.position.clone());
        const q0 = ns.map((n) => n.quaternion.clone());
        const off = ns.map((_, k) =>
          k
            ? p0[k]!.clone()
                .sub(p0[k - 1]!)
                .applyQuaternion(q0[k - 1]!.clone().invert())
            : null,
        );
        const rel = ns.map((_, k) => (k ? q0[k - 1]!.clone().invert().multiply(q0[k]!) : null));
        return [{ ...c, nodes: ns, p0, q0, off, rel }];
      });
      // the wrist's end, measured from the file (in the hand's own frame)
      const P = new THREE.Vector3();
      const pts: THREE.Vector3[] = [];
      root.traverse((o) => {
        const sm = o as THREE.SkinnedMesh;
        if (!sm.isSkinnedMesh) return;
        const a = sm.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < a.count; i++) {
          pts.push(P.fromBufferAttribute(a, i).applyMatrix4(holder.matrix).clone());
        }
      });
      if (pts.length) {
        const zEnd = Math.max(...pts.map((p) => p.z));
        const ring = pts.filter((p) => p.z > zEnd - 0.45);
        const xs = ring.map((p) => p.x);
        const ys = ring.map((p) => p.y);
        fitArm({
          z: zEnd,
          cx: (Math.min(...xs) + Math.max(...xs)) / 2,
          cy: (Math.min(...ys) + Math.max(...ys)) / 2,
          rx: (Math.max(...xs) - Math.min(...xs)) / 2,
          ry: (Math.max(...ys) - Math.min(...ys)) / 2,
        });
      }
      loaded = true;
      applySkin();
      st.dirty = true;
    },
    undefined,
    () => {
      // No hand file: the walk goes on without it.
    },
  );

  const AX = new THREE.Vector3(1, 0, 0);
  const AY = new THREE.Vector3(0, 1, 0);
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  /** Bends the hand to a mix of named poses, down each chain, each joint on the one before. */
  const setPose = (mix: Partial<Record<PoseName, number>>) => {
    if (!chains) return;
    const entries = Object.entries(mix) as [PoseName, number][];
    let total = 0;
    for (const [, w] of entries) total += w;
    const bend = (chain: ChainName, k: number) => {
      let a = 0;
      for (const [name, w] of entries) a += (POSES[name][chain][k] || 0) * (w / (total || 1));
      return a;
    };
    let swing = 0;
    for (const [name, w] of entries) swing += POSES[name].swing * (w / (total || 1));
    for (const c of chains) {
      const f = c.from;
      const q = c.q0[f]!.clone().multiply(qa.setFromAxisAngle(AX, -bend(c.name, 0)));
      // the thumb also swings in across the palm from its root
      if (c.name === 'thumb') q.multiply(qb.setFromAxisAngle(AY, swing));
      c.nodes[f]!.position.copy(c.p0[f]!);
      c.nodes[f]!.quaternion.copy(q);
      const p = c.p0[f]!.clone();
      for (let k = f + 1; k < c.nodes.length; k++) {
        p.add(c.off[k]!.clone().applyQuaternion(q));
        q.multiply(c.rel[k]!);
        const b = k - f < 3 ? bend(c.name, k - f) : 0;
        if (b && k < c.nodes.length - 1) q.multiply(qa.setFromAxisAngle(AX, -b));
        c.nodes[k]!.position.copy(p);
        c.nodes[k]!.quaternion.copy(q);
      }
    }
  };

  /** What the action in progress adds this frame: the arm's offset and turn, the wrist's turn, and the pose. */
  const actionNow = () => {
    const a = st.act;
    const out = {
      p: [0, 0, 0],
      r: [0, 0, 0],
      wr: [0, 0, 0],
      pose: null as PoseName | null,
      w: 0,
    };
    if (!a) return out;
    const u = clamp01(a.t / ACTIONS[a.kind]);
    if (a.kind === 'press') {
      const k = Math.sin(Math.PI * easeOut(u));
      out.p = [-1.4 * k, 1.3 * k, -4.2 * k];
      out.r = [0.16 * k, 0.08 * k, 0];
      out.pose = 'point';
      out.w = hill(u, 0, 0.18, 0.7, 1);
    } else if (a.kind === 'grab' || a.kind === 'yank') {
      const reach = hill(u, 0, 0.42, 0.58, 1);
      out.p = [-2.2 * reach, 2.2 * reach, -6.4 * reach];
      out.r = [0.22 * reach, 0.12 * reach, 0.1 * reach];
      if (a.kind === 'yank') {
        // …and pulled away hard, down and back
        const pull = hill(u, 0.4, 0.62, 0.72, 1);
        out.p[1]! -= 2.6 * pull;
        out.p[2]! += 4.6 * pull;
        out.r[0]! -= 0.3 * pull;
      }
      out.pose = ramp(u, 0.28, 0.46) > 0 ? 'grip' : 'flat';
      out.w = u < 0.28 ? hill(u, 0, 0.2, 0.9, 1) : hill(u, 0.28, 0.46, 0.86, 1);
    } else if (a.kind === 'release') {
      const k = hill(u, 0, 0.4, 0.55, 1);
      out.p = [-1.2 * k, 1.0 * k, -5.0 * k];
      out.r = [0.12 * k, 0, 0];
      out.pose = 'flat';
      out.w = hill(u, 0, 0.25, 0.75, 1);
    }
    return out;
  };

  let visible = true;

  return {
    setSkin: (t) => {
      if (!t?.hex) return;
      tone = t;
      applySkin();
    },
    setVisible: (on) => {
      visible = !!on;
    },
    get visible() {
      return visible;
    },
    setAspect: (aspect) => {
      camera.aspect = aspect || 1;
      camera.updateProjectionMatrix();
    },
    play: (kind) => {
      st.act = { kind, t: 0 };
    },
    setCarry: (on) => {
      st.carryTo = on ? 1 : 0;
    },
    look: (dYaw, dPitch) => {
      st.sx = Math.max(-1.8, Math.min(1.8, st.sx + dYaw * 5.5));
      st.sy = Math.max(-1.5, Math.min(1.5, st.sy - dPitch * 4.5));
    },
    update: (dt, { phase = 0, stride = 0, light = null } = {}) => {
      st.t += dt;
      if (st.act) {
        st.act.t += dt;
        if (st.act.t >= ACTIONS[st.act.kind]) st.act = null;
      }
      st.carry += (st.carryTo - st.carry) * Math.min(1, dt * 9);
      if (Math.abs(st.carryTo - st.carry) < 1e-3) st.carry = st.carryTo;
      // the look's trail: a spring back to rest, a little under-damped
      const w0 = 13;
      st.vx += (-w0 * w0 * st.sx - 2 * 0.75 * w0 * st.vx) * dt;
      st.vy += (-w0 * w0 * st.sy - 2 * 0.75 * w0 * st.vy) * dt;
      st.sx += st.vx * dt;
      st.sy += st.vy * dt;
      if (Math.abs(st.sx) + Math.abs(st.sy) + Math.abs(st.vx) + Math.abs(st.vy) < 1e-3) {
        st.sx = st.sy = st.vx = st.vy = 0;
      }

      const c = smooth(st.carry);
      const base = {
        p: REST.p.map((v, i) => lerp(v, HOLD.p[i]!, c)),
        r: REST.r.map((v, i) => lerp(v, HOLD.r[i]!, c)),
      };
      const a = actionNow();
      // a slow breath, the step's swing (a figure of eight), the look's trail
      const breath = Math.sin(st.t * Math.PI * 2 * 0.23);
      const bx = 0.5 * stride * Math.sin(phase);
      const by = 0.34 * stride * Math.cos(2 * phase) + 0.05 * breath;
      arm.position.set(
        base.p[0]! + a.p[0]! + bx + st.sx,
        base.p[1]! + a.p[1]! + by + st.sy,
        base.p[2]! + a.p[2]!,
      );
      arm.rotation.set(
        base.r[0]! + a.r[0]! + 0.012 * breath + st.sy * 0.04,
        base.r[1]! + a.r[1]! - st.sx * 0.05,
        base.r[2]! + a.r[2]! + 0.04 * stride * Math.sin(phase),
      );
      wrist.rotation.set(a.wr[0]!, a.wr[1]!, a.wr[2]!);
      const mix: Partial<Record<PoseName, number>> = { rest: 1 - c, ...(c > 0 ? { grip: c } : {}) };
      if (a.pose && a.w > 0) {
        for (const k of Object.keys(mix) as PoseName[]) mix[k] = (mix[k] ?? 0) * (1 - a.w);
        mix[a.pose] = (mix[a.pose] ?? 0) + a.w;
      }
      setPose(mix);
      if (light) {
        key.position.set(light.x, light.y, light.z).normalize().multiplyScalar(40);
        key.target.position.set(0, 0, -14);
        key.target.updateMatrixWorld();
      }
      const busy =
        !!st.act || st.carry !== st.carryTo || st.sx !== 0 || st.sy !== 0 || stride > 0 || st.dirty;
      st.dirty = false;
      return busy;
    },
    render: (renderer) => {
      if (!visible || !loaded) return;
      renderer.setRenderTarget(null);
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.autoClear = auto;
    },
    dispose: () => {
      disposed = true;
      for (const x of own) x.dispose?.();
      key.dispose();
      fill.dispose();
      hemi.dispose();
      rim.dispose();
    },
  };
}
