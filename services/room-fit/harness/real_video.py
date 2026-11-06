"""Sanity check of MoGe-2 on real, cluttered iPhone frames that have no AR poses.

    python harness/real_video.py VIDEO.MOV OUT_DIR [--frames 24]

Without poses nothing can be measured against the truth, so this checks what the fit relies on,
frame by frame, from the model's own output: the floor and ceiling planes (gravity, planarity,
whether they come out parallel), the camera height the model implies (its spread across frames is
the per-frame scale error that anchoring to the AR floor removes), how square walls come out to the
floor, and how much wall the fit could use: wall points above furniture height (band) and visible
floor-wall junctions. Writes summary.json and an overlay contact sheet.
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from room_fit.depth import MogeDepth  # noqa: E402


def extract_frames(video: Path, out: Path, n: int) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    dur = float(
        subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    )
    paths = []
    for k in range(n):
        t = (k + 0.5) * dur / n
        p = out / f"f{k:02d}.jpg"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(video), "-frames:v", "1", "-q:v", "2", str(p)],
            check=True,
        )
        paths.append(p)
    return paths


def fit_plane(P: np.ndarray, iters=300, thresh=0.02, seed=0):
    rng = np.random.default_rng(seed)
    best, best_n = None, 0
    for _ in range(iters):
        s = P[rng.choice(len(P), 3, replace=False)]
        n = np.cross(s[1] - s[0], s[2] - s[0])
        if np.linalg.norm(n) < 1e-9:
            continue
        n /= np.linalg.norm(n)
        d = -n @ s[0]
        inl = np.abs(P @ n + d) < thresh
        if inl.sum() > best_n:
            best_n, best = inl.sum(), inl
    if best is None:
        return None
    Q = P[best]
    c = Q.mean(0)
    _, _, vt = np.linalg.svd(Q - c)
    n = vt[2]
    d = -n @ c
    res = np.abs(Q @ n + d)
    return n, d, best, float(np.sqrt(np.mean(res**2)))


def lowest_plane(P: np.ndarray, min_points: int = 300):
    """The floor among up-facing planes: the one furthest below the camera, as in the pipeline
    (a bed top is a large up-facing plane too, but it is higher)."""
    planes = []
    rest = P
    for k in range(4):
        if len(rest) < min_points:
            break
        fit = fit_plane(rest, seed=k)
        if fit is None or fit[2].sum() < min_points:
            break
        planes.append(fit)
        rest = rest[~fit[2]]
    if not planes:
        return None

    def depth_below(fit):
        n, d = fit[0], fit[1]
        if n[1] > 0:  # orient up (camera -y)
            n, d = -n, -d
        return d  # the camera's height above this plane

    return max(planes, key=depth_below)


def analyse(img: np.ndarray, dm, K_fov: float) -> tuple[dict, np.ndarray]:
    h, w = dm.depth.shape
    fx = 0.5 * w / math.tan(math.radians(K_fov) / 2)
    u, v = np.meshgrid(np.arange(w), np.arange(h))
    z = dm.depth
    P = np.stack([(u - w / 2 + 0.5) / fx * z, (v - h / 2 + 0.5) / fx * z, z], -1)
    n = dm.normal
    valid = dm.mask & np.isfinite(z)
    out: dict = {}
    # Floor: normals facing up in the image (camera -y), RANSAC plane.
    floor_m = valid & (n[..., 1] < -0.75)
    ceil_m = valid & (n[..., 1] > 0.75)
    fl = lowest_plane(P[floor_m][::7]) if floor_m.sum() > 2000 else None
    cl = fit_plane(P[ceil_m][::7]) if ceil_m.sum() > 2000 else None
    up = None
    if fl:
        nf, df, _, rms = fl
        if nf[1] > 0:  # orient the normal up (camera -y), so the camera's signed distance is +df
            nf, df = -nf, -df
        up = nf
        out["cameraHeight"] = round(float(df), 3)
        out["floorRmsCm"] = round(100 * rms, 2)
        out["floorShare"] = round(float(floor_m.mean()), 3)
    if cl:
        nc, _dc, _, rms = cl
        out["ceilingRmsCm"] = round(100 * rms, 2)
        if fl:
            out["floorCeilingAngleDeg"] = round(math.degrees(math.acos(min(1.0, abs(float(nc @ up))))), 2)
            # Ceiling height: the ceiling pixels' height above the floor plane.
            out["ceilingAboveFloor"] = round(float(np.median(P[ceil_m] @ up + df)), 3)
    overlay = (img * 0.45).astype(np.uint8)
    if up is not None:
        height = P @ up + df  # metres above the floor
        cosv = np.abs(n @ up)
        vert = valid & (cosv < 0.34)
        top = out.get("ceilingAboveFloor", 2.4)
        band = vert & (height > 1.3) & (height < top - 0.1)
        floor_px = valid & (n @ up > 0.9) & (np.abs(height) < 0.06)
        furn = valid & ~vert & ~floor_px & (height > 0.1) & (height < 1.3)
        # Floor-wall junctions: floor pixels next to a vertical pixel that is low (a wall foot or the
        # side of furniture standing on the floor).
        kernel = np.ones((5, 5), np.uint8)
        near_vert = cv2.dilate((vert & (height < 0.25)).astype(np.uint8), kernel) > 0
        junction = floor_px & near_vert
        # Walls' squareness to the floor.
        wn = n[vert]
        ang = np.degrees(np.arcsin(np.clip(np.abs(wn @ up), 0, 1)))
        out.update(
            wallShare=round(float(vert.mean()), 3),
            bandShare=round(float(band.mean()), 3),
            furnitureShare=round(float(furn.mean()), 3),
            junctionPixels=int(junction.sum()),
            wallTiltMedianDeg=round(float(np.median(ang)), 2) if len(ang) else None,
        )
        overlay[floor_px] = (overlay[floor_px] * 0.4 + np.array([40, 90, 230]) * 0.6).astype(np.uint8)
        overlay[band] = (overlay[band] * 0.4 + np.array([60, 190, 60]) * 0.6).astype(np.uint8)
        overlay[vert & ~band] = (overlay[vert & ~band] * 0.5 + np.array([150, 220, 150]) * 0.5).astype(np.uint8)
        overlay[furn] = (overlay[furn] * 0.5 + np.array([230, 140, 40]) * 0.5).astype(np.uint8)
        overlay[cv2.dilate(junction.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0] = (255, 240, 0)
    if cl:
        overlay[ceil_m] = (overlay[ceil_m] * 0.4 + np.array([220, 50, 40]) * 0.6).astype(np.uint8)
    return out, overlay


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--frames", type=int, default=24)
    ap.add_argument("--checkpoint", default="Ruicheng/moge-2-vitl-normal")
    args = ap.parse_args()
    paths = extract_frames(args.video, args.out / "frames", args.frames)
    imgs = []
    for p in paths:
        im = cv2.cvtColor(cv2.imread(str(p)), cv2.COLOR_BGR2RGB)
        s = 960 / max(im.shape[:2])
        imgs.append(
            cv2.resize(im, (int(round(im.shape[1] * s)), int(round(im.shape[0] * s))), interpolation=cv2.INTER_AREA)
        )
    model = MogeDepth(args.checkpoint)
    # No intrinsics in a plain video: let the model estimate the field of view (fov_x=None).
    import torch

    rows = []
    tiles = []
    for p, im in zip(paths, imgs):
        x = torch.from_numpy(im).to(model.device).permute(2, 0, 1).float() / 255.0
        with torch.no_grad():
            res = model.model.infer(x, use_fp16=model.fp16)
        K = res["intrinsics"].float().cpu().numpy()
        fov = math.degrees(2 * math.atan(0.5 / K[0, 0]))

        class D:
            pass

        dm = D()
        dm.depth = res["depth"].float().cpu().numpy()
        dm.normal = res["normal"].float().cpu().numpy()
        dm.mask = res["mask"].cpu().numpy().astype(bool) & np.isfinite(dm.depth)
        stats, overlay = analyse(im, dm, fov)
        stats = {"frame": p.name, "fovXDeg": round(fov, 1), **stats}
        rows.append(stats)
        tiles.append(cv2.resize(overlay, (270, 480)))
        print(json.dumps(stats))
    ch = np.array([r["cameraHeight"] for r in rows if "cameraHeight" in r])
    summary = {
        "frames": len(rows),
        "fovXDegMedian": float(np.median([r["fovXDeg"] for r in rows])),
        "framesWithFloor": int(len(ch)),
        "cameraHeight": {
            "median": round(float(np.median(ch)), 3),
            "p10": round(float(np.percentile(ch, 10)), 3),
            "p90": round(float(np.percentile(ch, 90)), 3),
            "relSpread": round(float(np.std(ch) / np.mean(ch)), 3),
        }
        if len(ch)
        else None,
        "ceilingAboveFloor": [r["ceilingAboveFloor"] for r in rows if "ceilingAboveFloor" in r],
        "floorCeilingAngleDeg": [r["floorCeilingAngleDeg"] for r in rows if "floorCeilingAngleDeg" in r],
        "floorRmsCmMedian": float(np.median([r["floorRmsCm"] for r in rows if "floorRmsCm" in r])) if len(ch) else None,
        "wallTiltMedianDeg": float(
            np.median([r["wallTiltMedianDeg"] for r in rows if r.get("wallTiltMedianDeg") is not None])
        )
        if len(ch)
        else None,
        "bandShareMedian": float(np.median([r["bandShare"] for r in rows if "bandShare" in r])) if len(ch) else None,
        "rows": rows,
    }
    (args.out / "summary.json").write_text(json.dumps(summary, indent=1))
    while len(tiles) % 8:
        tiles.append(np.zeros_like(tiles[0]))
    sheet = np.vstack([np.hstack(tiles[i : i + 8]) for i in range(0, len(tiles), 8)])
    cv2.imwrite(str(args.out / "overlay.jpg"), cv2.cvtColor(sheet, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 85])
    print(json.dumps({k: v for k, v in summary.items() if k != "rows"}, indent=1))


if __name__ == "__main__":
    main()
