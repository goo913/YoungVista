import { type Document, type mat4, Node, Primitive } from '@gltf-transform/core';
import {
  clearNodeTransform,
  dedup,
  dequantize,
  flatten,
  getBounds,
  join,
  normals,
  prune,
  simplify,
  transformMesh,
  weld,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

export interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

/** Removes everything a static furniture model does not need: extra scenes, animation, cameras, morph targets. */
export function stripScene(doc: Document): void {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error('Source has no scene');
  root.setDefaultScene(scene);
  for (const s of root.listScenes()) if (s !== scene) s.dispose();
  for (const a of root.listAnimations()) a.dispose();
  if (root.listSkins().length) throw new Error('Skinned models are not supported');
  for (const c of root.listCameras()) c.dispose();
  for (const mesh of root.listMeshes()) {
    mesh.setWeights([]);
    for (const p of mesh.listPrimitives()) for (const t of p.listTargets()) t.dispose();
  }
}

/** Bakes every node transform into its mesh, leaving all nodes at identity under the scene. */
export async function flattenTransforms(doc: Document): Promise<void> {
  await doc.transform(flatten());
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh && mesh.listParents().filter((p) => p instanceof Node).length > 1) {
      node.setMesh(mesh.clone());
    }
  }
  for (const node of doc.getRoot().listNodes()) clearNodeTransform(node);
}

export function applyMatrix(doc: Document, matrix: mat4): void {
  for (const mesh of doc.getRoot().listMeshes()) transformMesh(mesh, matrix);
}

/** Turns the model about +Y by `degrees`, counter-clockwise seen from above. */
export function rotateY(doc: Document, degrees: number): void {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  // Column-major rotation about Y.
  applyMatrix(doc, [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

export function countTriangles(doc: Document): number {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      if (p.getMode() !== Primitive.Mode.TRIANGLES) continue;
      const n = p.getIndices()?.getCount() ?? p.getAttribute('POSITION')?.getCount() ?? 0;
      tris += n / 3;
    }
  }
  return tris;
}

export function sceneBounds(doc: Document): Box {
  const scene = doc.getRoot().getDefaultScene()!;
  const { min, max } = getBounds(scene);
  return { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] };
}

/** Merges duplicates, welds, joins draw calls and simplifies to the triangle budget. */
export async function optimiseGeometry(
  doc: Document,
  maxTriangles: number,
): Promise<{ before: number; after: number; notes: string[] }> {
  const notes: string[] = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      const mode = p.getMode();
      if (mode !== Primitive.Mode.TRIANGLES) {
        throw new Error(`Primitive mode ${mode} is not supported (triangles only)`);
      }
    }
  }
  await doc.transform(dequantize(), dedup(), prune({ keepSolidTextures: false }), weld(), join());
  const before = countTriangles(doc);
  let tris = before;
  if (tris > maxTriangles) {
    await MeshoptSimplifier.ready;
    for (const error of [0.001, 0.002, 0.005, 0.01, 0.02, 0.05]) {
      const ratio = Math.min(1, (maxTriangles / tris) * 0.98);
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error }));
      tris = countTriangles(doc);
      if (tris <= maxTriangles) {
        notes.push(`simplified ${before} -> ${tris} triangles (error limit ${error * 100}%)`);
        break;
      }
    }
    if (tris > maxTriangles) throw new Error(`Could not simplify below ${maxTriangles} triangles`);
  }
  await doc.transform(prune({ keepSolidTextures: false }));
  return { before, after: tris, notes };
}

/**
 * Scales the model per axis to the target size and moves its origin to the centre of the
 * footprint on the floor (min y = 0, x and z centred).
 */
export function normalise(doc: Document, target: { w: number; d: number; h: number }): void {
  const { min, max } = sceneBounds(doc);
  const s = [
    target.w / (max[0] - min[0]),
    target.h / (max[1] - min[1]),
    target.d / (max[2] - min[2]),
  ];
  const c = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
  applyMatrix(doc, [
    s[0]!,
    0,
    0,
    0,
    0,
    s[1]!,
    0,
    0,
    0,
    0,
    s[2]!,
    0,
    -c[0]! * s[0]!,
    -c[1]! * s[1]!,
    -c[2]! * s[2]!,
    1,
  ]);
}

/**
 * Final vertex data for ViroReact: float attributes only, TEXCOORD_0 only, no vertex colours,
 * 16- or 32-bit indices, normals present.
 */
export async function finaliseAttributes(doc: Document): Promise<string[]> {
  const notes: string[] = [];
  const removed = new Set<string>();
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      for (const semantic of p.listSemantics()) {
        if (/^(TEXCOORD_[1-9]|COLOR_\d|JOINTS_\d|WEIGHTS_\d|_.*)$/.test(semantic)) {
          p.setAttribute(semantic, null);
          removed.add(semantic);
        }
      }
      const indices = p.getIndices();
      if (indices && indices.getArray() instanceof Uint8Array) {
        indices.setArray(new Uint16Array(indices.getArray()!));
      }
    }
  }
  if (removed.size) notes.push(`attributes removed: ${[...removed].join(', ')}`);
  const missingNormals = doc
    .getRoot()
    .listMeshes()
    .some((m) => m.listPrimitives().some((p) => !p.getAttribute('NORMAL')));
  if (missingNormals) {
    await doc.transform(normals({ overwrite: false }));
    notes.push('normals generated');
  }
  await doc.transform(dequantize(), prune({ keepSolidTextures: false }));
  return notes;
}

/** Area-weighted triangle centroids, for the facing check and the swatch colour. */
export function forEachTriangle(
  doc: Document,
  fn: (p: Primitive, area: number, centroid: number[], i: [number, number, number]) => void,
): void {
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  const c = [0, 0, 0];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION')!;
      const idx = p.getIndices();
      const n = idx ? idx.getCount() : pos.getCount();
      for (let t = 0; t < n; t += 3) {
        const i0 = idx ? idx.getScalar(t) : t;
        const i1 = idx ? idx.getScalar(t + 1) : t + 1;
        const i2 = idx ? idx.getScalar(t + 2) : t + 2;
        pos.getElement(i0, a);
        pos.getElement(i1, b);
        pos.getElement(i2, c);
        const ux = b[0]! - a[0]!,
          uy = b[1]! - a[1]!,
          uz = b[2]! - a[2]!;
        const vx = c[0]! - a[0]!,
          vy = c[1]! - a[1]!,
          vz = c[2]! - a[2]!;
        const cx = uy * vz - uz * vy,
          cy = uz * vx - ux * vz,
          cz = ux * vy - uy * vx;
        const area = Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
        const centroid = [0, 1, 2].map((k) => (a[k]! + b[k]! + c[k]!) / 3);
        fn(p, area, centroid, [i0, i1, i2]);
      }
    }
  }
}

/**
 * For items with a back (seats, beds): the surface in the top 40% of the height should sit behind
 * the centre, i.e. the back faces -Z and the front +Z. Returns the area-weighted mean z of that
 * surface as a fraction of half the depth (negative = behind).
 */
export function backrestOffset(doc: Document): number {
  const { min, max } = sceneBounds(doc);
  const cut = min[1] + 0.6 * (max[1] - min[1]);
  const halfDepth = (max[2] - min[2]) / 2;
  let sum = 0;
  let weight = 0;
  forEachTriangle(doc, (_p, area, centroid) => {
    if (centroid[1]! < cut) return;
    sum += centroid[2]! * area;
    weight += area;
  });
  return weight ? sum / weight / halfDepth : 0;
}
