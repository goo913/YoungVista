/**
 * The turn-around scan's upload: `capture.json` (core's `CaptureManifest`) and one JPEG per
 * keyframe, under `captureFolder(uid, scanId)` in Storage (packages/core/src/turn-scan.ts).
 *
 * Keyframes are numbered in the order they were taken; each `CaptureFrame` carries the frame's
 * own pose and intrinsics, for its JPEG exactly as written (sensor orientation, full size). The
 * floor is the AR floor the phone found (scan/floor.ts) in the same ARKit world as the poses, with
 * how its height moved during the capture. Plain TypeScript (test/turn-manifest.test.ts).
 */
import {
  CAPTURE_VERSION,
  keyframeFile,
  type CaptureFrame,
  type CaptureManifest,
  type CaptureMode,
  type Vec3Tuple,
} from '@youngvista/core';
import type { KeptFrame } from './keyframes';

export interface ManifestInput {
  scanId: string;
  ownerId: string;
  createdAt: Date;
  mode: CaptureMode;
  device: CaptureManifest['device'];
  /** The AR floor's height at the end, and its earlier heights (seconds since the capture began). */
  floor: { y: number; history: { t: number; y: number }[] };
  keyframes: readonly KeptFrame[];
}

/** One file to upload: from the phone to `path`, relative to the capture folder. */
export interface UploadFile {
  uri: string;
  path: string;
  contentType: 'image/jpeg' | 'application/json';
  bytes: number;
}

const round = (n: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** The manifest, and the keyframe JPEGs to upload with it (the manifest itself goes last). */
export function buildManifest(input: ManifestInput): {
  manifest: CaptureManifest;
  files: UploadFile[];
} {
  const ordered = [...input.keyframes].sort((p, q) => p.frame.t - q.frame.t);
  const frames: CaptureFrame[] = ordered.map((k, index) => {
    const f = k.frame;
    const frame: CaptureFrame = {
      index,
      file: keyframeFile(index),
      t: round(f.t, 3),
      spot: k.spot,
      ring: k.ring,
      yawDeg: round(k.view.yawDeg, 2),
      pitchDeg: round(k.view.pitchDeg, 2),
      transform: f.transform.slice(0, 16).map((n) => round(n, 6)),
      intrinsics: {
        fx: round(f.intrinsics.fx, 3),
        fy: round(f.intrinsics.fy, 3),
        cx: round(f.intrinsics.cx, 3),
        cy: round(f.intrinsics.cy, 3),
      },
      width: f.width,
      height: f.height,
      tracking: f.tracking === 'normal' ? 'normal' : 'limited',
    };
    if (f.sharpness !== undefined && Number.isFinite(f.sharpness)) {
      frame.sharpness = round(f.sharpness, 1);
    }
    if (f.exposureDuration !== undefined && Number.isFinite(f.exposureDuration)) {
      frame.exposureDuration = round(f.exposureDuration, 6);
    }
    return frame;
  });

  const spots = [...new Set(ordered.map((k) => k.spot))]
    .sort((a, b) => a - b)
    .map((index) => {
      const at = ordered.filter((k) => k.spot === index).map((k) => k.view.position);
      const mean = [0, 1, 2].map((c) =>
        round(at.reduce((s, p) => s + p[c]!, 0) / at.length, 4),
      ) as unknown as Vec3Tuple;
      return { index, position: mean };
    });

  const manifest: CaptureManifest = {
    version: CAPTURE_VERSION,
    scanId: input.scanId,
    ownerId: input.ownerId,
    createdAt: input.createdAt.toISOString(),
    mode: input.mode,
    device: input.device,
    floor: {
      y: round(input.floor.y, 4),
      history: input.floor.history.map((h) => ({ t: round(h.t, 2), y: round(h.y, 4) })),
    },
    spots,
    frames,
  };
  const files: UploadFile[] = ordered.map((k, index) => ({
    uri: k.file,
    path: keyframeFile(index),
    contentType: 'image/jpeg',
    bytes: k.bytes,
  }));
  return { manifest, files };
}

/** What a capture is missing before it is worth uploading, in plain words; null when it is fine. */
export function captureProblem(input: {
  floorY: number | null;
  keyframes: readonly KeptFrame[];
  /** Keyframes per ring of the first spot at least (out of each ring's bins). */
  minPerRing: number;
}): string | null {
  if (input.floorY === null || !Number.isFinite(input.floorY)) {
    return 'The floor was lost. Point at the floor until it is found again.';
  }
  const first = input.keyframes.filter((k) => k.spot === 0);
  for (let ring = 0; ring < 3; ring++) {
    if (first.filter((k) => k.ring === ring).length < input.minPerRing) {
      return 'Some turns have too few pictures. Turn the missing parts again, slowly.';
    }
  }
  return null;
}
