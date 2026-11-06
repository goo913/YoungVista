/**
 * The three.js pieces of the 360° view: the panorama shaders, the room shell (walls, floor and
 * ceiling as one closed mesh), panorama textures, and where the view starts.
 *
 * Every panorama follows core's line-up (packages/core/src/tour.ts): the centre column looks
 * along the spot's `yawDeg`, headings are `atan2(x, z)` and turning right lowers the heading.
 */
import * as THREE from 'three';
import {
  signedArea,
  tourHeading,
  triangulatePolygon,
  type Room,
  type RoomTour,
  type RoomTourSpot,
  type Vec2,
} from '@youngvista/core';
import type { FurnitureEntry } from '@/lib/furniture';
import type { TourImages } from '@/lib/tour-images';

/** GLSL: where a direction lands in a panorama whose centre column looks along `yaw` (radians). */
const PANORAMA_UV = /* glsl */ `
  const float TOUR_PI = 3.141592653589793;
  vec2 panoramaUv(vec3 d, float yaw) {
    float heading = atan(d.x, d.z);
    float u = fract(0.5 - (heading - yaw) / (2.0 * TOUR_PI));
    float v = 0.5 + asin(clamp(d.y, -1.0, 1.0)) / TOUR_PI;
    return vec2(u, v);
  }
`;

/**
 * The panorama on the inside of a sphere centred on the camera, so it sits at infinity and turns
 * with the view only. Drawn first, behind everything (no depth test or write). A new set of
 * uniforms each call (one per material).
 */
export function sphereShader(): THREE.ShaderMaterialParameters {
  return {
    uniforms: { map: { value: null }, yaw: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${PANORAMA_UV}
      uniform sampler2D map;
      uniform float yaw;
      varying vec3 vDirection;
      void main() {
        gl_FragColor = vec4(texture2D(map, panoramaUv(normalize(vDirection), yaw)).rgb, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  };
}

/**
 * The room shell while moving between spots: each point of the walls, floor and ceiling shows
 * what spot A's panorama saw there (from A's centre) faded into what B's saw (from B's), so the
 * room keeps its shape as the camera moves. A new set of uniforms each call.
 */
export function shellShader(): THREE.ShaderMaterialParameters {
  return {
    uniforms: {
      mapA: { value: null },
      mapB: { value: null },
      centerA: { value: new THREE.Vector3() },
      centerB: { value: new THREE.Vector3() },
      yawA: { value: 0 },
      yawB: { value: 0 },
      mixT: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      ${PANORAMA_UV}
      uniform sampler2D mapA;
      uniform sampler2D mapB;
      uniform vec3 centerA;
      uniform vec3 centerB;
      uniform float yawA;
      uniform float yawB;
      uniform float mixT;
      varying vec3 vWorld;
      void main() {
        vec3 a = texture2D(mapA, panoramaUv(normalize(vWorld - centerA), yawA)).rgb;
        vec3 b = texture2D(mapB, panoramaUv(normalize(vWorld - centerB), yawB)).rgb;
        gl_FragColor = vec4(mix(a, b, mixT), 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide,
  };
}

/** How far the shell stands outside the room's surfaces, so furniture against them stays whole. */
export const SHELL_GAP = 0.015;

/**
 * The room's inside surfaces as one closed mesh: the outline pushed out by `gap`, from just under
 * the floor to just over the ceiling. Doors and windows are left closed: nothing placed stands
 * beyond them.
 */
export function shellGeometry(room: Room, gap = SHELL_GAP): THREE.BufferGeometry {
  const pts: Vec2[] = room.points.map(([x, z]) => ({ x, z }));
  const n = pts.length;
  const orient = signedArea(pts) >= 0 ? 1 : -1;
  // Each edge's outward normal (as core's room meshes compute it).
  const out = pts.map((p, k) => {
    const q = pts[(k + 1) % n]!;
    const len = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    return { x: (-(q.z - p.z) / len) * orient, z: ((q.x - p.x) / len) * orient };
  });
  // Corners moved out along the mitre of their two walls.
  const ring = pts.map((p, k) => {
    const n0 = out[(k - 1 + n) % n]!;
    const n1 = out[k]!;
    const c = n0.x * n1.x + n0.z * n1.z;
    const s = 1 + c < 1e-6 ? 0 : gap / (1 + c);
    const q = s ? { x: p.x + (n0.x + n1.x) * s, z: p.z + (n0.z + n1.z) * s } : p;
    return Number.isFinite(q.x) && Number.isFinite(q.z) ? q : p;
  });
  const y0 = -gap;
  const y1 = room.ceilingHeight + gap;
  const positions: number[] = [];
  const indices: number[] = [];
  const vertex = (x: number, y: number, z: number) => positions.push(x, y, z) / 3 - 1;
  // Floor and ceiling.
  const triangles = triangulatePolygon(ring);
  for (const y of [y0, y1]) {
    const base = positions.length / 3;
    for (const p of ring) vertex(p.x, y, p.z);
    for (const i of triangles) indices.push(base + i);
  }
  // Walls.
  for (let k = 0; k < n; k++) {
    const a = ring[k]!;
    const b = ring[(k + 1) % n]!;
    const i0 = vertex(a.x, y0, a.z);
    const i1 = vertex(b.x, y0, b.z);
    const i2 = vertex(b.x, y1, b.z);
    const i3 = vertex(a.x, y1, a.z);
    indices.push(i0, i1, i2, i0, i2, i3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/** A spot's panorama, ready to draw. */
export interface LoadedPanorama {
  spot: RoomTourSpot;
  /** The full picture (scaled down to what the screen can hold). */
  texture: THREE.Texture;
  /** A small copy that lights and reflects on the furniture. */
  environment: THREE.Texture;
}

async function decode(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The picture at most `maxWidth` wide (a canvas copy when it has to shrink). */
function fitted(image: HTMLImageElement, maxWidth: number): HTMLImageElement | HTMLCanvasElement {
  if (image.naturalWidth <= maxWidth) return image;
  const canvas = document.createElement('canvas');
  canvas.width = maxWidth;
  canvas.height = Math.max(1, Math.round((maxWidth * image.naturalHeight) / image.naturalWidth));
  const ctx = canvas.getContext('2d');
  if (!ctx) return image;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Downloads and decodes each spot's panorama once; `dispose` frees them all. */
export class PanoramaCache {
  private readonly loads = new Map<number, Promise<LoadedPanorama>>();
  private readonly ready: LoadedPanorama[] = [];
  private disposed = false;
  private readonly images: TourImages;
  /** The widest texture to keep (the GPU's limit, and less on phones). */
  private readonly maxWidth: number;

  constructor(images: TourImages, maxWidth: number) {
    this.images = images;
    this.maxWidth = maxWidth;
  }

  get(spot: RoomTourSpot): Promise<LoadedPanorama> {
    let load = this.loads.get(spot.spot);
    if (!load) {
      load = this.load(spot);
      this.loads.set(spot.spot, load);
      // A failed download may be tried again.
      load.catch(() => this.loads.delete(spot.spot));
    }
    return load;
  }

  /** The panorama when it has already loaded. */
  peek(spot: RoomTourSpot): LoadedPanorama | null {
    return this.ready.find((p) => p.spot.spot === spot.spot) ?? null;
  }

  private async load(spot: RoomTourSpot): Promise<LoadedPanorama> {
    const image = await decode(await this.images(spot.storagePath));
    if (this.disposed) throw new Error('closed');
    const texture = new THREE.Texture(fitted(image, this.maxWidth));
    texture.colorSpace = THREE.SRGBColorSpace;
    // The picture wraps round at its left and right edges; no mipmaps, so no seam where it does.
    texture.wrapS = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    const environment = new THREE.Texture(fitted(image, 1024));
    environment.colorSpace = THREE.SRGBColorSpace;
    environment.mapping = THREE.EquirectangularReflectionMapping;
    environment.needsUpdate = true;
    const loaded = { spot, texture, environment };
    this.ready.push(loaded);
    return loaded;
  }

  dispose() {
    this.disposed = true;
    for (const p of this.ready) {
      p.texture.dispose();
      p.environment.dispose();
    }
    this.ready.length = 0;
    this.loads.clear();
  }
}

/** Where the view starts: the first spot, looking at the furniture or down the room's longest view. */
export function startView(
  tour: RoomTour,
  room: Room,
  furniture: readonly FurnitureEntry[],
): { spot: RoomTourSpot; heading: number; pitch: number } {
  const spot = tour.spots[0]!;
  const at = { x: spot.position[0], z: spot.position[2] };
  let area = 0;
  let cx = 0;
  let cz = 0;
  for (const f of furniture) {
    const a = 4 * f.footprint.halfWidth * f.footprint.halfDepth;
    area += a;
    cx += f.footprint.center.x * a;
    cz += f.footprint.center.z * a;
  }
  if (area > 0) {
    const target = { x: cx / area - at.x, z: cz / area - at.z };
    if (Math.hypot(target.x, target.z) > 0.3) {
      return { spot, heading: tourHeading(target), pitch: -12 };
    }
  }
  // The heading that sees furthest before a wall.
  let best = spot.yawDeg;
  let bestDistance = 0;
  const pts = room.points;
  for (let h = 0; h < 360; h += 5) {
    const r = (h * Math.PI) / 180;
    const d = { x: Math.sin(r), z: Math.cos(r) };
    let hit = Infinity;
    for (let k = 0; k < pts.length; k++) {
      const [ax, az] = pts[k]!;
      const [bx, bz] = pts[(k + 1) % pts.length]!;
      const ex = bx - ax;
      const ez = bz - az;
      const den = d.x * ez - d.z * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - at.x) * ez - (az - at.z) * ex) / den;
      const s = ((ax - at.x) * d.z - (az - at.z) * d.x) / den;
      if (t > 1e-6 && s >= 0 && s <= 1) hit = Math.min(hit, t);
    }
    if (Number.isFinite(hit) && hit > bestDistance) {
      bestDistance = hit;
      best = h;
    }
  }
  return { spot, heading: best, pitch: -8 };
}

/**
 * True when nothing of the room's outline stands between two points on the floor plane. Walls run
 * from the floor to the ceiling, so this is what a camera at `from` sees of the floor at `to`.
 */
export function inSight(room: Room, from: Vec2, to: Vec2): boolean {
  const pts = room.points;
  const cross = (ox: number, oz: number, ax: number, az: number, bx: number, bz: number) =>
    (ax - ox) * (bz - oz) - (az - oz) * (bx - ox);
  for (let k = 0; k < pts.length; k++) {
    const [ax, az] = pts[k]!;
    const [bx, bz] = pts[(k + 1) % pts.length]!;
    const d1 = cross(ax, az, bx, bz, from.x, from.z);
    const d2 = cross(ax, az, bx, bz, to.x, to.z);
    const d3 = cross(from.x, from.z, to.x, to.z, ax, az);
    const d4 = cross(from.x, from.z, to.x, to.z, bx, bz);
    if (d1 * d2 < -1e-12 && d3 * d4 < -1e-12) return false;
  }
  return true;
}

/** The horizontal field of view (degrees) for a vertical one and the view's width / height. */
export function horizontalFov(verticalFov: number, aspect: number): number {
  const half = (verticalFov * Math.PI) / 360;
  return (Math.atan(Math.tan(half) * aspect) * 360) / Math.PI;
}

/** A vertical field of view that shows about 100° across, but no more than 75° up and down. */
export function defaultFov(aspect: number): number {
  const across = Math.tan((50 * Math.PI) / 180);
  return Math.min(75, (Math.atan(across / Math.max(aspect, 0.1)) * 360) / Math.PI);
}

export const MIN_FOV = 25;
export const MAX_FOV = 90;
