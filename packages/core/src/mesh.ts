/**
 * Plain triangle meshes that any viewer can draw: three.js on the website (wrap the arrays in
 * typed arrays for a BufferGeometry) and ViroReact's `ViroGeometry` on the phone (see
 * `toViroGeometry`).
 *
 * Conventions: metres, Y up, the floor at y = 0. Normals are unit vectors. Each triangle is
 * counter-clockwise seen from the side its normal points to, which is the front face in both
 * three.js and ViroReact. UVs are in metres, so a texture set to repeat tiles once per metre.
 */

/** [x, y, z] in metres. */
export type MeshVec3 = [number, number, number];

export interface MeshData {
  /** x, y, z per vertex (metres). */
  positions: number[];
  /** Unit normal per vertex. */
  normals: number[];
  /** u, v per vertex (metres). */
  uvs: number[];
  /** Three vertex indices per triangle. */
  indices: number[];
}

export const emptyMesh = (): MeshData => ({ positions: [], normals: [], uvs: [], indices: [] });

export const meshVertexCount = (mesh: MeshData): number => mesh.positions.length / 3;
export const meshTriangleCount = (mesh: MeshData): number => mesh.indices.length / 3;
export const isEmptyMesh = (mesh: MeshData): boolean => mesh.indices.length === 0;

/** Joins meshes into one (for a single draw call when they share a material). */
export function mergeMeshes(meshes: readonly MeshData[]): MeshData {
  const out = emptyMesh();
  for (const m of meshes) {
    const base = out.positions.length / 3;
    out.positions.push(...m.positions);
    out.normals.push(...m.normals);
    out.uvs.push(...m.uvs);
    for (const i of m.indices) out.indices.push(base + i);
  }
  return out;
}

/** Total area of the mesh's triangles in m². */
export function meshArea(mesh: MeshData): number {
  let sum = 0;
  const p = mesh.positions;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = mesh.indices[t]! * 3;
    const b = mesh.indices[t + 1]! * 3;
    const c = mesh.indices[t + 2]! * 3;
    const ux = p[b]! - p[a]!;
    const uy = p[b + 1]! - p[a + 1]!;
    const uz = p[b + 2]! - p[a + 2]!;
    const vx = p[c]! - p[a]!;
    const vy = p[c + 1]! - p[a + 1]!;
    const vz = p[c + 2]! - p[a + 2]!;
    sum += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return sum;
}

/** Smallest box around the mesh, or null for an empty mesh. */
export function meshBounds(mesh: MeshData): { min: MeshVec3; max: MeshVec3 } | null {
  if (mesh.positions.length < 3) return null;
  const min: MeshVec3 = [Infinity, Infinity, Infinity];
  const max: MeshVec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.positions[i + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  }
  return { min, max };
}

/** Appends vertices and triangles to a mesh. Used by the mesh builders in core. */
export interface MeshWriter {
  readonly mesh: MeshData;
  /** Adds one vertex and returns its index. */
  vertex(p: MeshVec3, n: MeshVec3, uv: [number, number]): number;
  /**
   * Adds a flat quad facing `normal`. Corners go around the quad in either direction; the
   * triangles are wound to face `normal`. Degenerate quads are skipped.
   */
  quad(
    corners: readonly [MeshVec3, MeshVec3, MeshVec3, MeshVec3],
    normal: MeshVec3,
    uvs: readonly [[number, number], [number, number], [number, number], [number, number]],
  ): void;
  /** Adds a flat polygon facing `normal`, given its corners and a triangulation of them. */
  polygon(
    corners: readonly MeshVec3[],
    triangles: readonly number[],
    normal: MeshVec3,
    uv: (p: MeshVec3) => [number, number],
  ): void;
}

const sub3 = (a: MeshVec3, b: MeshVec3): MeshVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: MeshVec3, b: MeshVec3): MeshVec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot3 = (a: MeshVec3, b: MeshVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function createMeshWriter(): MeshWriter {
  const mesh = emptyMesh();
  const vertex = (p: MeshVec3, n: MeshVec3, uv: [number, number]): number => {
    mesh.positions.push(p[0], p[1], p[2]);
    mesh.normals.push(n[0], n[1], n[2]);
    mesh.uvs.push(uv[0], uv[1]);
    return mesh.positions.length / 3 - 1;
  };
  const triangle = (a: number, b: number, c: number, flip: boolean) => {
    if (flip) mesh.indices.push(a, c, b);
    else mesh.indices.push(a, b, c);
  };
  return {
    mesh,
    vertex,
    quad(corners, normal, uvs) {
      const [p0, p1, p2, p3] = corners;
      const n = cross3(sub3(p2, p0), sub3(p3, p1));
      // Twice the quad's area: skip slivers under 1 mm².
      if (Math.hypot(n[0], n[1], n[2]) < 2e-6) return;
      const flip = dot3(n, normal) < 0;
      const i0 = vertex(p0, normal, uvs[0]);
      const i1 = vertex(p1, normal, uvs[1]);
      const i2 = vertex(p2, normal, uvs[2]);
      const i3 = vertex(p3, normal, uvs[3]);
      triangle(i0, i1, i2, flip);
      triangle(i0, i2, i3, flip);
    },
    polygon(corners, triangles, normal, uv) {
      if (triangles.length < 3) return;
      const base = corners.map((p) => vertex(p, normal, uv(p)));
      for (let t = 0; t + 2 < triangles.length; t += 3) {
        const a = corners[triangles[t]!]!;
        const b = corners[triangles[t + 1]!]!;
        const c = corners[triangles[t + 2]!]!;
        const flip = dot3(cross3(sub3(b, a), sub3(c, a)), normal) < 0;
        triangle(base[triangles[t]!]!, base[triangles[t + 1]!]!, base[triangles[t + 2]!]!, flip);
      }
    },
  };
}

/**
 * The nested arrays ViroReact's `<ViroGeometry>` takes. `triangleIndices` holds one flat index
 * list per submesh, and submesh `i` is drawn with `materials[i]` (this is what the iOS and Android
 * renderers read; the TypeScript prop type in react-viro 3.0.3 says triples, so cast it).
 */
export interface ViroGeometryData {
  vertices: MeshVec3[];
  normals: MeshVec3[];
  texcoords: [number, number][];
  triangleIndices: number[][];
}

export interface ViroGeometryOptions {
  /** Multiplies every UV, e.g. 2 to repeat a texture every 50 cm. Default 1 (once per metre). */
  uvScale?: number;
}

/** One mesh with its material, for `toViroGeometryParts`. */
export interface ViroGeometryPart<M> {
  mesh: MeshData;
  material: M;
}

/**
 * Converts several meshes into one `ViroGeometry`, one submesh per part. Empty parts are left
 * out, and `materials` lists the remaining parts' materials in submesh order, ready for the
 * `materials` prop.
 */
export function toViroGeometryParts<M>(
  parts: readonly ViroGeometryPart<M>[],
  options: ViroGeometryOptions = {},
): ViroGeometryData & { materials: M[] } {
  const s = options.uvScale ?? 1;
  const out: ViroGeometryData & { materials: M[] } = {
    vertices: [],
    normals: [],
    texcoords: [],
    triangleIndices: [],
    materials: [],
  };
  for (const { mesh, material } of parts) {
    if (isEmptyMesh(mesh)) continue;
    const base = out.vertices.length;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      out.vertices.push([mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!]);
      out.normals.push([mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!]);
    }
    for (let i = 0; i < mesh.uvs.length; i += 2) {
      out.texcoords.push([mesh.uvs[i]! * s, mesh.uvs[i + 1]! * s]);
    }
    out.triangleIndices.push(mesh.indices.map((i) => base + i));
    out.materials.push(material);
  }
  return out;
}

/** Converts one mesh into a single-submesh `ViroGeometry` (one material). */
export function toViroGeometry(
  mesh: MeshData,
  options: ViroGeometryOptions = {},
): ViroGeometryData {
  const { vertices, normals, texcoords, triangleIndices } = toViroGeometryParts(
    [{ mesh, material: 0 }],
    options,
  );
  return { vertices, normals, texcoords, triangleIndices };
}
