/**
 * Dev tool: renders synthetic, photo-like 360° panoramas of a saved room from its 3D model, so the
 * viewers can be built and checked before real turn-around scans exist. Plain three.js: the
 * room's own meshes (core's `buildRoomMeshes`: walls, doors, windows, frames), with a plank floor,
 * painted walls, skirting boards, closed doors, a ceiling lamp, a picture on the wall, sunlight
 * through the windows and a garden outside. Optionally the room's furniture is drawn in too, to
 * check the viewers' line-up: their own furniture must then land exactly on the pictured one.
 *
 * Each spot is rendered into a cube map at the camera's position, then unwrapped into an
 * equirectangular JPEG whose centre column looks along the spot's `yawDeg` (core's line-up, see
 * packages/core/src/tour.ts).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  buildRoomMeshes,
  bounds,
  roomCenter,
  type MeshData,
  type Room,
  type RoomMeshes,
} from '@youngvista/core';
import { modelUrl } from '@/lib/catalog';
import type { FurnitureEntry } from '@/lib/furniture';

/** Where a panorama is taken from (room coordinates). */
export interface FixtureSpot {
  x: number;
  z: number;
  /** The camera's height above the floor (m). */
  height: number;
  /** Heading of the picture's centre column (degrees, `atan2(x, z)`). */
  yawDeg: number;
}

export interface FixtureOptions {
  /** Width of each panorama in pixels (height is half). */
  width: number;
  /** Draws these pieces into the pictures (a line-up check), or none. */
  furniture?: readonly FurnitureEntry[];
  /** JPEG quality, 0..1. Default 0.9. */
  quality?: number;
}

/** A small deterministic random source, so the same room always looks the same. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext('2d')! };
}

/** Oak planks, 4 m square (the floor's UVs are metres along the longest wall). */
function plankTexture(): THREE.Texture {
  const size = 2048;
  const { c, ctx } = canvas(size, size);
  const rand = random(7);
  const px = size / 4;
  const plankWidth = 0.19 * px;
  for (let row = 0; row * plankWidth < size; row++) {
    let x = -rand() * 1.5 * px;
    while (x < size) {
      const length = (0.9 + rand() * 1.3) * px;
      const tone = 0.82 + rand() * 0.3;
      const r = Math.round(176 * tone);
      const g = Math.round(128 * tone);
      const b = Math.round(82 * tone);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, row * plankWidth, length, plankWidth);
      // Grain.
      for (let k = 0; k < 14; k++) {
        const y = row * plankWidth + rand() * plankWidth;
        ctx.strokeStyle = `rgba(70,40,15,${0.05 + rand() * 0.1})`;
        ctx.lineWidth = 0.6 + rand() * 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s <= 8; s++) {
          ctx.lineTo(x + (length * s) / 8, y + Math.sin(s * 1.3 + k) * rand() * 2.5);
        }
        ctx.stroke();
      }
      // The joint.
      ctx.fillStyle = 'rgba(40,24,10,0.55)';
      ctx.fillRect(x, row * plankWidth, 2, plankWidth);
      x += length;
    }
    ctx.fillStyle = 'rgba(40,24,10,0.5)';
    ctx.fillRect(0, row * plankWidth, size, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.25, 0.25);
  t.anisotropy = 8;
  return t;
}

/** Faint unevenness for paint, 1 m square. */
function noiseTexture(seed: number, base: [number, number, number], amount: number) {
  const size = 512;
  const { c, ctx } = canvas(size, size);
  const rand = random(seed);
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = (rand() - 0.5) * amount;
    image.data[i * 4] = base[0] + n;
    image.data[i * 4 + 1] = base[1] + n;
    image.data[i * 4 + 2] = base[2] + n;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** An abstract print for the framed picture. */
function artTexture(): THREE.Texture {
  const { c, ctx } = canvas(640, 480);
  const rand = random(3);
  ctx.fillStyle = '#e9e1d3';
  ctx.fillRect(0, 0, 640, 480);
  const colors = ['#c8553d', '#2d6a8f', '#e8b04b', '#3d5a40', '#8c6f9a'];
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = colors[i % colors.length]!;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(80 + rand() * 480, 60 + rand() * 360, 30 + rand() * 90, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function geometry(mesh: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs, 2));
  g.setIndex(mesh.indices);
  return g;
}

function solid(mesh: THREE.Mesh, shadows = true): THREE.Mesh {
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}

/** The room's surfaces, its fittings and the garden outside. */
function buildRoom(room: Room, meshes: RoomMeshes): THREE.Group {
  const group = new THREE.Group();
  const H = room.ceilingHeight;
  const floor = new THREE.MeshPhysicalMaterial({
    map: plankTexture(),
    roughness: 0.5,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
  });
  const paint = new THREE.MeshStandardMaterial({
    map: noiseTexture(11, [236, 232, 224], 7),
    roughness: 0.92,
  });
  const white = new THREE.MeshStandardMaterial({ color: '#f5f3ee', roughness: 0.45 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#d7e7f2',
    roughness: 0.02,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  group.add(solid(new THREE.Mesh(geometry(meshes.floor), floor), false));
  for (const wall of meshes.walls) {
    group.add(solid(new THREE.Mesh(geometry(wall.panels), paint)));
    group.add(solid(new THREE.Mesh(geometry(wall.frames), white)));
    const pane = new THREE.Mesh(geometry(wall.glass), glass);
    pane.renderOrder = 2;
    group.add(pane);
  }

  // The ceiling, facing down.
  const shape = new THREE.Shape(room.points.map(([x, z]) => new THREE.Vector2(x, z)));
  const ceilingGeometry = new THREE.ShapeGeometry(shape);
  ceilingGeometry.rotateX(Math.PI / 2);
  const ceiling = new THREE.Mesh(
    ceilingGeometry,
    new THREE.MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.96 }),
  );
  ceiling.position.y = H;
  group.add(solid(ceiling));

  // Skirting boards along each wall, broken at doors and openings; closed doors in the doorways.
  const door = new THREE.MeshStandardMaterial({ color: '#efebe4', roughness: 0.5 });
  const brass = new THREE.MeshStandardMaterial({ color: '#b8964f', roughness: 0.3, metalness: 1 });
  for (const wall of room.walls) {
    const [ax, az] = room.points[wall.a]!;
    const [bx, bz] = room.points[wall.b]!;
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 0.05) continue;
    const dx = (bx - ax) / length;
    const dz = (bz - az) / length;
    const mesh = meshes.walls.find((w) => w.id === wall.id);
    const out = mesh ? { x: mesh.normal[0], z: mesh.normal[2] } : { x: -dz, z: dx };
    const angle = Math.atan2(dx, dz) - Math.PI / 2;
    const gaps = wall.openings
      .filter((o) => o.type !== 'window')
      .map((o) => [o.offset, o.offset + o.width] as const)
      .sort((p, q) => p[0] - q[0]);
    let from = 0;
    for (const [g0, g1] of [...gaps, [length, length] as const]) {
      const to = Math.min(g0, length);
      if (to - from > 0.05) {
        const board = new THREE.Mesh(new THREE.BoxGeometry(to - from, 0.09, 0.014), white);
        const mid = (from + to) / 2;
        board.position.set(ax + dx * mid - out.x * 0.007, 0.045, az + dz * mid - out.z * 0.007);
        board.rotation.y = angle;
        group.add(solid(board));
      }
      from = Math.max(from, g1);
    }
    for (const o of wall.openings.filter((x) => x.type === 'door')) {
      const mid = o.offset + o.width / 2;
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(o.width - 0.02, o.height - 0.01, 0.04),
        door,
      );
      leaf.position.set(
        ax + dx * mid + out.x * 0.05,
        (o.height - 0.01) / 2,
        az + dz * mid + out.z * 0.05,
      );
      leaf.rotation.y = angle;
      group.add(solid(leaf));
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), brass);
      const at = o.offset + o.width - 0.09;
      knob.position.set(ax + dx * at + out.x * 0.0, 1.0, az + dz * at + out.z * 0.0);
      group.add(knob);
    }
  }

  // A framed print on the longest wall, away from its openings.
  const longest = [...meshes.walls].sort((p, q) => q.length - p.length)[0];
  if (longest) {
    const wall = room.walls[longest.index]!;
    const busy = wall.openings.some((o) => {
      const mid = longest.length / 2;
      return mid > o.offset - 0.6 && mid < o.offset + o.width + 0.6;
    });
    if (!busy) {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.86, 0.66, 0.03),
        new THREE.MeshStandardMaterial({ color: '#1f1f1f', roughness: 0.6 }),
      );
      const print = new THREE.Mesh(
        new THREE.PlaneGeometry(0.76, 0.56),
        new THREE.MeshStandardMaterial({ map: artTexture(), roughness: 0.8 }),
      );
      const n = longest.normal;
      const [cx, , cz] = longest.center;
      const angle = Math.atan2(-n[0], -n[2]);
      frame.position.set(cx - n[0] * 0.016, 1.5, cz - n[2] * 0.016);
      frame.rotation.y = angle;
      print.position.set(cx - n[0] * 0.032, 1.5, cz - n[2] * 0.032);
      print.rotation.y = angle;
      group.add(solid(frame), print);
    }
  }

  // A ceiling lamp in the middle of the room.
  const c = roomCenter(room);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.26, 0.05, 48),
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#fff4e0',
      emissiveIntensity: 2.5,
      roughness: 0.6,
    }),
  );
  shade.position.set(c.x, H - 0.03, c.z);
  group.add(shade);
  const lamp = new THREE.PointLight('#ffe9cc', 4, 0, 2);
  lamp.position.set(c.x, H - 0.25, c.z);
  group.add(lamp);

  // Outside: a lawn, a hedge and trees, under a sky.
  const b = bounds(room.points);
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ map: noiseTexture(5, [96, 128, 70], 40), roughness: 1 }),
  );
  (lawn.material as THREE.MeshStandardMaterial).map!.repeat.set(60, 60);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = -0.03;
  lawn.receiveShadow = true;
  group.add(lawn);
  const leaves = new THREE.MeshStandardMaterial({ color: '#4f6f3a', roughness: 1 });
  const rand = random(19);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + rand() * 0.2;
    const r = Math.max(b.width, b.depth) / 2 + 5 + rand() * 9;
    const s = 1.2 + rand() * 2.2;
    const tree = new THREE.Mesh(new THREE.SphereGeometry(s, 20, 14), leaves);
    tree.position.set(cx + Math.sin(a) * r, s * 1.1, cz + Math.cos(a) * r);
    group.add(solid(tree));
  }
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(150, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 c = mix(vec3(0.86, 0.91, 0.96), vec3(0.32, 0.55, 0.88), pow(h, 0.6));
          gl_FragColor = vec4(c * 3.0, 1.0);
        }
      `,
    }),
  );
  sky.position.set(cx, 0, cz);
  group.add(sky);
  return group;
}

/** The pieces' models at their saved places (missing models are left out). */
async function buildFurniture(furniture: readonly FurnitureEntry[]): Promise<THREE.Group> {
  const group = new THREE.Group();
  const loader = new GLTFLoader();
  await Promise.all(
    furniture.map(async ({ item, product }) => {
      if (!product) return;
      try {
        const gltf = await loader.loadAsync(modelUrl(product, item.variant));
        const model = gltf.scene;
        model.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        model.position.set(item.x, item.y ?? 0, item.z);
        model.rotation.y = THREE.MathUtils.degToRad(item.rotationY);
        group.add(model);
      } catch {
        // A model that does not load is left out of the picture.
      }
    }),
  );
  return group;
}

const UNWRAP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Unwraps the cube map: the centre column looks along `yaw`, turning right across the picture. */
const UNWRAP_FRAGMENT = /* glsl */ `
  uniform samplerCube cube;
  uniform float yaw;
  uniform float seed;
  varying vec2 vUv;
  const float PI = 3.141592653589793;
  float hash(vec2 p) {
    return fract(sin(dot(p + seed, vec2(12.9898, 78.233))) * 43758.5453);
  }
  void main() {
    float u = vUv.x;
    float v = 1.0 - vUv.y;
    float heading = yaw - (u - 0.5) * 2.0 * PI;
    float pitch = (0.5 - v) * PI;
    vec3 dir = vec3(cos(pitch) * sin(heading), sin(pitch), cos(pitch) * cos(heading));
    gl_FragColor = vec4(textureCube(cube, dir).rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // A little sensor noise, as in a phone's picture.
    gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) * 0.018;
  }
`;

/**
 * Renders one equirectangular JPEG per spot. Runs in a browser (it needs WebGL and a canvas).
 */
export async function renderPanoramas(
  room: Room,
  spots: readonly FixtureSpot[],
  options: FixtureOptions,
): Promise<Blob[]> {
  const width = Math.max(512, Math.round(options.width / 2) * 2);
  const height = width / 2;
  const target = document.createElement('canvas');
  target.width = width;
  target.height = height;
  const renderer = new THREE.WebGLRenderer({
    canvas: target,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const meshes = buildRoomMeshes(room);
  const scene = new THREE.Scene();
  scene.add(buildRoom(room, meshes));
  if (options.furniture?.length) scene.add(await buildFurniture(options.furniture));

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  scene.add(new THREE.HemisphereLight('#cfe2ff', '#8a7a62', 0.5));
  const b = bounds(room.points);
  const sun = new THREE.DirectionalLight('#fff3dc', 4.2);
  const reach = Math.max(b.width, b.depth) + 4;
  const mid = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  sun.position.copy(mid).add(new THREE.Vector3(-0.55, 0.7, 0.45).normalize().multiplyScalar(30));
  sun.target.position.copy(mid);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, {
    left: -reach,
    right: reach,
    top: reach,
    bottom: -reach,
    near: 1,
    far: 80,
  });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const face = Math.min(renderer.capabilities.maxCubemapSize, Math.ceil((width / 4) * 1.5));
  const cubeTarget = new THREE.WebGLCubeRenderTarget(face, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cubeCamera = new THREE.CubeCamera(0.03, 400, cubeTarget);
  scene.add(cubeCamera);

  const unwrap = new THREE.ShaderMaterial({
    uniforms: { cube: { value: cubeTarget.texture }, yaw: { value: 0 }, seed: { value: 0 } },
    vertexShader: UNWRAP_VERTEX,
    fragmentShader: UNWRAP_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), unwrap);
  quad.frustumCulled = false;
  const flat = new THREE.Scene();
  flat.add(quad);
  const flatCamera = new THREE.OrthographicCamera();

  const out: Blob[] = [];
  try {
    for (const [i, spot] of spots.entries()) {
      cubeCamera.position.set(spot.x, spot.height, spot.z);
      cubeCamera.updateMatrixWorld(true);
      cubeCamera.update(renderer, scene);
      unwrap.uniforms.yaw!.value = THREE.MathUtils.degToRad(spot.yawDeg);
      unwrap.uniforms.seed!.value = i * 17.3;
      renderer.setRenderTarget(null);
      renderer.render(flat, flatCamera);
      let quality = options.quality ?? 0.9;
      let blob: Blob | null = null;
      // Storage takes pictures up to 10 MB.
      for (let tries = 0; tries < 4; tries++) {
        blob = await new Promise<Blob | null>((resolve) =>
          target.toBlob(resolve, 'image/jpeg', quality),
        );
        if (!blob || blob.size < 9.5 * 1024 * 1024) break;
        quality -= 0.1;
        renderer.render(flat, flatCamera);
      }
      if (!blob) throw new Error('The picture could not be encoded.');
      out.push(blob);
    }
  } finally {
    cubeTarget.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return out;
}
