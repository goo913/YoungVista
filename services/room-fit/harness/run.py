"""Accuracy harness: render synthetic captures with known rooms, run the whole fit on them, and
report wall-length errors against the truth.

    python harness/run.py render OUT_DIR            # render every demo room (cached)
    python harness/run.py fit OUT_DIR [--depth moge|truth] [--rooms bedroom,small]

Wall lengths come from the room the phone would build: the fitted marks go through the shared
solver in packages/core (solver/solve.mjs), exactly as on the phone.
"""

from __future__ import annotations

import argparse
import json
import math
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import synth  # noqa: E402
from room_fit.pipeline import FitOptions, fit_capture  # noqa: E402
from room_fit.store import LocalStore  # noqa: E402

PLACEMENTS = {
    "bedroom": synth.Placement(yaw_deg=23.0, shift=(-1.7, -2.4), floor_y=-1.37),
    "small": synth.Placement(yaw_deg=-61.0, shift=(0.8, -1.1), floor_y=-1.42),
    "living-L": synth.Placement(yaw_deg=8.5, shift=(-2.0, -1.5), floor_y=-1.35),
    "long": synth.Placement(yaw_deg=137.0, shift=(1.0, 2.0), floor_y=-1.40),
}


def _render_one(args):
    room, placement, shot, K, seed, i, out_dir, truth_scale = args
    import cv2

    rng = np.random.default_rng(seed * 1000 + i)
    img, depth, nrm = synth.render_frame(room, placement, shot["R_arkit"], shot["c"], K)
    rgb = synth.camera_look(img, rng)
    cv2.imwrite(
        str(out_dir / "kf" / f"{i:03d}.jpg"), cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 90]
    )
    tw, th = K.width // truth_scale, K.height // truth_scale
    np.savez_compressed(
        out_dir / "truth" / f"{i:03d}.npz",
        depth=cv2.resize(depth, (tw, th), interpolation=cv2.INTER_NEAREST).astype(np.float32),
        normal=cv2.resize(nrm, (tw, th), interpolation=cv2.INTER_NEAREST).astype(np.float16),
    )
    return i


def render_room(
    room: synth.Room,
    out_dir: Path,
    placement: synth.Placement,
    errors: synth.ArErrors,
    seed=1,
    workers=8,
    K=synth.IPHONE15,
):
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "kf").mkdir(exist_ok=True)
    (out_dir / "truth").mkdir(exist_ok=True)
    rng = np.random.default_rng(seed)
    shots = synth.plan_frames(room, placement, synth.ShotPlan(), rng)
    t0 = time.time()
    jobs = [(room, placement, s, K, seed, i, out_dir, 2) for i, s in enumerate(shots)]
    with mp.get_context("spawn").Pool(workers) as pool:
        for k, _ in enumerate(pool.imap_unordered(_render_one, jobs)):
            if k % 24 == 0:
                print(f"  {room.name}: {k + 1}/{len(jobs)} frames ({time.time() - t0:.0f} s)", flush=True)
    frames = []
    n = len(shots)
    for i, s in enumerate(shots):
        a = math.radians(errors.yaw_drift_deg * i / max(1, n - 1))
        drift = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
        R_rep = drift @ synth.small_rotation(rng, errors.rot_noise_deg) @ s["R_arkit"]
        c_rep = s["c"] + rng.normal(0, errors.pos_noise, 3)
        M = np.eye(4)
        M[:3, :3] = R_rep
        M[:3, 3] = c_rep
        pose = synth.Pose.from_arkit(M)
        frames.append(
            {
                "index": i,
                "file": f"kf/{i:03d}.jpg",
                "t": round(s["t"], 3),
                "spot": s["spot"],
                "ring": s["ring"],
                "yawDeg": round(pose.heading_deg, 3),
                "pitchDeg": round(pose.pitch_deg, 3),
                "transform": [float(x) for x in M.flatten(order="F")],
                "intrinsics": {"fx": K.fx, "fy": K.fy, "cx": K.cx, "cy": K.cy},
                "width": K.width,
                "height": K.height,
                "tracking": "normal",
                "sharpness": round(float(rng.uniform(80, 120)), 1),
                "exposureDuration": 1 / 60,
                # Harness only: the true pose, for ablations.
                "_trueTransform": [
                    float(x)
                    for x in np.block([[s["R_arkit"], s["c"][:, None]], [np.zeros((1, 3)), np.ones((1, 1))]]).flatten(
                        order="F"
                    )
                ],
            }
        )
    spots = []
    for sp in sorted({f["spot"] for f in frames}):
        cs = np.array([np.asarray(f["transform"]).reshape(4, 4).T[:3, 3] for f in frames if f["spot"] == sp])
        spots.append({"index": sp, "position": [float(x) for x in cs.mean(0)]})
    manifest = {
        "version": 1,
        "scanId": f"synth-{room.name}",
        "ownerId": "harness",
        "createdAt": "2026-11-06T12:00:00Z",
        "mode": "landscape-3",
        "device": {"model": "synthetic", "os": "none", "app": "harness", "viro": "none", "videoFormat": "1920x1440"},
        "floor": {"y": placement.floor_y + errors.floor_bias},
        "spots": spots,
        "frames": frames,
    }
    (out_dir / "capture.json").write_text(json.dumps(manifest))
    (out_dir / "truth.json").write_text(json.dumps(synth.room_truth(room, placement), indent=1))
    print(f"  {room.name}: {n} frames in {time.time() - t0:.0f} s", flush=True)


def repose(src: Path, dst: Path, errors: synth.ArErrors, placement: synth.Placement, seed: int = 7):
    """The same rendered frames with different AR errors: new reported poses and floor height."""
    dst.mkdir(parents=True, exist_ok=True)
    for sub in ("kf", "truth"):
        link = dst / sub
        if not link.exists():
            link.symlink_to((src / sub).resolve())
    (dst / "truth.json").write_text((src / "truth.json").read_text())
    m = json.loads((src / "capture.json").read_text())
    rng = np.random.default_rng(seed)
    n = len(m["frames"])
    for i, f in enumerate(m["frames"]):
        T = np.asarray(f["_trueTransform"]).reshape(4, 4).T
        a = math.radians(errors.yaw_drift_deg * i / max(1, n - 1))
        drift = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
        M = np.eye(4)
        M[:3, :3] = drift @ synth.small_rotation(rng, errors.rot_noise_deg) @ T[:3, :3]
        M[:3, 3] = T[:3, 3] + rng.normal(0, errors.pos_noise, 3)
        pose = synth.Pose.from_arkit(M)
        f["transform"] = [float(x) for x in M.flatten(order="F")]
        f["yawDeg"] = round(pose.heading_deg, 3)
        f["pitchDeg"] = round(pose.pitch_deg, 3)
    m["floor"]["y"] = placement.floor_y + errors.floor_bias
    (dst / "capture.json").write_text(json.dumps(m))


# ------------------------------------------------------------------------------------------------
# Metrics
# ------------------------------------------------------------------------------------------------


def _inside(poly: np.ndarray, p: np.ndarray) -> bool:
    x, z = p
    inside = False
    n = len(poly)
    for i in range(n):
        x1, z1 = poly[i]
        x2, z2 = poly[(i + 1) % n]
        if (z1 > z) != (z2 > z):
            xi = x1 + (z - z1) * (x2 - x1) / (z2 - z1)
            if xi > x:
                inside = not inside
    return inside


def _walls_of(points) -> list[dict]:
    P = np.asarray(points, np.float64)
    out = []
    for i in range(len(P)):
        a, b = P[i], P[(i + 1) % len(P)]
        e = b - a
        L = float(np.linalg.norm(e))
        e = e / L
        n = np.array([-e[1], e[0]])
        mid = (a + b) / 2
        if not _inside(P, mid + 0.01 * n):
            n = -n
        out.append({"a": a, "b": b, "dir": e, "n": n, "length": L, "mid": mid})
    return out


def compare(truth: dict, room: dict | None, result: dict) -> dict:
    true_walls = _walls_of(truth["points"])
    rows = []
    fit_walls = _walls_of(room["points"]) if room and room.get("ok") else []
    used = set()
    for k, tw in enumerate(true_walls):
        best, best_d = None, 1e9
        for j, fw in enumerate(fit_walls):
            if j in used or float(fw["n"] @ tw["n"]) < 0.98:
                continue
            off = float((fw["mid"] - tw["mid"]) @ tw["n"])
            along = abs(float((fw["mid"] - tw["mid"]) @ tw["dir"]))
            d = abs(off) + 0.3 * max(0.0, along - 0.5 * tw["length"])
            if d < best_d:
                best, best_d = j, d
        if best is None or best_d > 1.0:
            rows.append({"wall": k, "true": round(tw["length"], 3), "fit": None, "err": None})
            continue
        used.add(best)
        fw = fit_walls[best]
        off = float((fw["mid"] - tw["mid"]) @ tw["n"])
        conf = None
        inferred = None
        for rw in room["walls"]:
            a = np.asarray(rw["a"])
            if np.allclose(a, fw["a"]) or np.allclose(a, fw["b"]):
                bb = np.asarray(rw["b"])
                if np.allclose(bb, fw["b"]) or np.allclose(bb, fw["a"]):
                    ids = rw["markIds"]
                    confs = [m["confidence"] for m in result["marks"] if m["id"] in ids]
                    conf = max(confs) if confs else None
                    inferred = rw["inferred"]
        rows.append(
            {
                "wall": k,
                "true": round(tw["length"], 3),
                "fit": round(fw["length"], 3),
                "err": round(100 * (fw["length"] - tw["length"]) / tw["length"], 2),
                "offset": round(-off, 3),  # + means the fitted wall is further out than the truth
                "confidence": conf,
                "inferred": inferred if conf is not None else None,
            }
        )
    area_true = abs(_area(np.asarray(truth["points"])))
    area_fit = abs(_area(np.asarray(room["points"]))) if room and room.get("ok") else None
    ch = result.get("ceilingHeight")
    return {
        "walls": rows,
        "areaErr": None if area_fit is None else round(100 * (area_fit - area_true) / area_true, 2),
        "ceilingErrCm": None if ch is None else round(100 * (ch - truth["ceilingHeight"]), 1),
        "solved": bool(room and room.get("ok")),
        "nWallsTrue": len(true_walls),
        "nWallsFit": len(fit_walls),
    }


def _area(P):
    return 0.5 * float(np.sum(P[:, 0] * np.roll(P[:, 1], -1) - np.roll(P[:, 0], -1) * P[:, 1]))


def axes_error_deg(truth: dict, angle: float) -> float:
    w = truth["walls"][0]
    d = np.asarray(w["b"]) - np.asarray(w["a"])
    true_angle = math.atan2(d[1], d[0])
    diff = (angle - true_angle) % (math.pi / 2)
    if diff > math.pi / 4:
        diff -= math.pi / 2
    return math.degrees(diff)


def load_truth_maps(cap_dir: Path, manifest: dict, true_pose: bool):
    maps = []
    from room_fit.geometry import Pose, matrix_from_column_major

    for f in manifest["frames"]:
        t = np.load(cap_dir / "truth" / f"{f['index']:03d}.npz")
        key = "_trueTransform" if true_pose else "transform"
        pose = Pose.from_arkit(matrix_from_column_major(f[key]))
        maps.append((t["depth"], t["normal"].astype(np.float32), pose.R))
    return maps


class CachedDepth:
    """Wraps a depth model and keeps its outputs on disk, keyed by the image bytes and the field of
    view, so the rest of the pipeline can be re-run quickly."""

    def __init__(self, model, folder: Path, tag: str):
        self.model = model
        self.folder = folder / tag
        self.folder.mkdir(parents=True, exist_ok=True)
        self.name = getattr(model, "name", tag)
        self.device = getattr(model, "device", "?")
        self.load_seconds = getattr(model, "load_seconds", 0.0)

    def __call__(self, images, fovs):
        import hashlib

        from room_fit.depth import DepthMap

        keys = [hashlib.sha1(im.tobytes() + f"{fov:.4f}".encode()).hexdigest()[:20] for im, fov in zip(images, fovs)]
        todo = [k for k, key in enumerate(keys) if not (self.folder / f"{key}.npz").exists()]
        if todo:
            maps = self.model([images[k] for k in todo], [fovs[k] for k in todo])
            for k, dm in zip(todo, maps):
                np.savez(
                    self.folder / f"{keys[k]}.npz", depth=dm.depth, normal=dm.normal.astype(np.float16), mask=dm.mask
                )
        out = []
        for key in keys:
            z = np.load(self.folder / f"{key}.npz")
            out.append(DepthMap(depth=z["depth"], normal=z["normal"].astype(np.float32), mask=z["mask"]))
        return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["render", "fit", "repose"])
    ap.add_argument("out", type=Path)
    ap.add_argument("--rooms", default="")
    ap.add_argument("--depth", default="moge", choices=["moge", "truth", "truth-noisy"])
    ap.add_argument("--checkpoint", default=None)
    ap.add_argument("--device", default=None)
    ap.add_argument("--tokens", type=int, default=None)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--size", default="1920x1440", help="render: 1920x1440 (4:3) or 1920x1080 (16:9)")
    ap.add_argument("--no-errors", action="store_true", help="render without AR pose/floor errors")
    ap.add_argument("--panoramas", action="store_true")
    ap.add_argument("--pano-width", type=int, default=2048)
    ap.add_argument("--openings", action="store_true")
    ap.add_argument("--token-file", type=Path, help="fit --openings locally: an access token file")
    ap.add_argument("--tag", default="")
    ap.add_argument("--depth-cache", type=Path, help="keep the depth model's outputs here")
    ap.add_argument("--src", type=Path, help="repose: rendered rooms to copy with new AR errors")
    ap.add_argument(
        "--errors", default="0.025,0.5,0.015,1.5", help="repose: floor bias m, rotation deg, position m, drift deg"
    )
    args = ap.parse_args()
    rooms = [r for r in synth.demo_rooms() if not args.rooms or r.name in args.rooms.split(",")]
    if args.cmd == "repose":
        fb, rot, pos, drift = (float(x) for x in args.errors.split(","))
        for r in rooms:
            repose(args.src / r.name, args.out / r.name, synth.ArErrors(fb, rot, pos, drift), PLACEMENTS[r.name])
        return
    if args.cmd == "render":
        for r in rooms:
            d = args.out / r.name
            if (d / "capture.json").exists():
                print(f"{r.name}: cached")
                continue
            errs = synth.ArErrors(0, 0, 0, 0) if args.no_errors else synth.ArErrors()
            render_room(r, d, PLACEMENTS[r.name], errs, workers=args.workers, K=synth.intrinsics_for(args.size))
        return
    from room_fit.depth import MogeDepth, TruthDepth

    if args.openings and args.token_file:
        # Local runs call the AI with the developer's own access token (the job uses its account).
        import requests

        from room_fit import openings

        sess = requests.Session()
        sess.headers["Authorization"] = "Bearer " + args.token_file.read_text().strip()
        openings._session = lambda: (sess, "young-vista")

    model = None
    if args.depth == "moge":
        model = MogeDepth(args.checkpoint or "Ruicheng/moge-2-vitl-normal", device=args.device, num_tokens=args.tokens)
        if args.depth_cache:
            ck = Path(args.checkpoint).parent.parent.parent.name if args.checkpoint else "vitl"
            model = CachedDepth(model, args.depth_cache, f"{ck}-{args.tokens or 'max'}")
    report = {"rooms": [], "depth": args.depth}
    all_err = []
    for r in rooms:
        d = args.out / r.name
        manifest = json.loads((d / "capture.json").read_text())
        truth = json.loads((d / "truth.json").read_text())
        if args.depth != "moge":
            maps = load_truth_maps(d, manifest, true_pose=True)
            noisy = args.depth == "truth-noisy"
            model = TruthDepth(maps, scale_sigma=0.08 if noisy else 0.0, noise=0.03 if noisy else 0.0)
        out_dir = args.out / f"{r.name}-out{args.tag}"
        store = LocalStore(d, out=out_dir)
        t0 = time.time()
        fit = fit_capture(
            store,
            model,
            FitOptions(
                panoramas=args.panoramas, pano_width=args.pano_width, openings=args.openings, log=lambda *a: None
            ),
        )
        dt = time.time() - t0
        cmp = compare(truth, fit.room, fit.result)
        cmp["axesErrDeg"] = round(axes_error_deg(truth, fit.result["axesAngle"]), 2)
        cmp["seconds"] = round(dt, 1)
        cmp["timings"] = fit.info["timings"]
        cmp["room"] = r.name
        cmp["info"] = {k: fit.info[k] for k in ("scale", "ceiling", "cues", "walls", "solve")}
        if args.openings:
            cmp["openings"] = {
                "found": fit.result["openings"],
                "truth": truth["openings"],
                "info": fit.info.get("openings"),
            }
            print("   openings:", json.dumps(cmp["openings"]["found"]))
        report["rooms"].append(cmp)
        (out_dir).mkdir(parents=True, exist_ok=True)
        (out_dir / "scanfit.json").write_text(
            json.dumps({"result": fit.result, "info": fit.info}, indent=1, default=str)
        )
        errs = [w["err"] for w in cmp["walls"] if w["err"] is not None]
        all_err += errs
        print(
            f"\n{r.name}: solved={cmp['solved']} walls {cmp['nWallsFit']}/{cmp['nWallsTrue']} area {cmp['areaErr']}% ceiling {cmp['ceilingErrCm']} cm axes {cmp['axesErrDeg']}° ({dt:.0f} s)"
        )
        for w in cmp["walls"]:
            print(
                f"   wall {w['wall']}: true {w['true']:.2f} m  fit {w['fit']}  err {w['err']}%  offset {w.get('offset')}  conf {w.get('confidence')}  inferred {w.get('inferred')}"
            )
    if all_err:
        a = np.abs(all_err)
        summary = {
            "walls": len(a),
            "medianAbsErr": round(float(np.median(a)), 2),
            "p90AbsErr": round(float(np.percentile(a, 90)), 2),
            "maxAbsErr": round(float(a.max()), 2),
            "within10": round(float((a <= 10).mean()), 3),
        }
        report["summary"] = summary
        print("\nSUMMARY", json.dumps(summary))
    (args.out / f"report-{args.depth}{args.tag}.json").write_text(json.dumps(report, indent=1, default=str))


if __name__ == "__main__":
    main()
