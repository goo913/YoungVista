"""The whole fit: capture -> depth -> scale -> cloud -> cues -> walls -> marks, plus openings,
panoramas and the debug bundle. `fit_capture` is what the job and the harness both run."""

from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass, field

import cv2
import numpy as np

from . import __version__
from .capture import Capture, parse_manifest, validate
from .cloud import Cloud, estimate_yaw, fit_ceiling_ransac, fuse
from .cues import CEILING_LINE, FLOOR_LINE, Junctions, band_points, free_space, junctions
from .errors import capture_error
from .geometry import CLASS_AXIS, Axes, classify_normals
from .scale import anchor_scales
from .solver import solve_room
from .views import View, make_view, working_size
from .walls import (
    Evidence,
    band_evidence,
    ceiling_from_rays,
    fit_walls,
    junction_evidence,
    marks_from_walls,
    wall_confidence,
)

WORK_WIDTH = 960


@dataclass
class FitOptions:
    openings: bool = False
    panoramas: bool = True
    pano_width: int = 4096
    debug: bool = True
    deadline: float | None = None  # time.time() after which optional steps are skipped
    log: callable = print


@dataclass
class FitOutput:
    result: dict
    info: dict
    views: list[View] = field(default_factory=list)
    cloud: Cloud | None = None
    walls: list = field(default_factory=list)
    room: dict | None = None
    extras: dict = field(default_factory=dict)


def decode_jpeg(data: bytes) -> np.ndarray:
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)
    if img is None:
        raise ValueError("not an image")
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def floor_reprojection_check(views: list[View]) -> dict:
    """With the axes converted right, pixels whose normals face world-up lie below the horizon
    (on the floor or furniture tops). A flipped axis puts them above it."""
    agree = []
    for v in views:
        up = v.valid & (v.normal_w[..., 1] > 0.85)
        if up.sum() < 500:
            continue
        below = v.rays[..., 1] < -0.02
        agree.append(float((up & below).sum() / up.sum()))
    return {"frames": len(agree), "agreement": round(float(np.median(agree)), 3) if agree else None}


def fit_capture(store, depth_model, options: FitOptions | None = None) -> FitOutput:
    opt = options or FitOptions()
    log = opt.log
    t_start = time.time()
    timings: dict[str, float] = {}

    def lap(name, t0):
        timings[name] = round(time.time() - t0, 2)

    # 1. Load and validate.
    t0 = time.time()
    try:
        manifest = json.loads(store.read("capture.json"))
    except Exception as e:  # noqa: BLE001
        raise capture_error("format", f"capture.json: {e}") from None
    capture: Capture = parse_manifest(manifest)
    frames, vinfo = validate(capture)
    blobs = store.read_many([f.file for f in frames])
    missing = [f.index for f, b in zip(frames, blobs) if b is None]
    if len(missing) > 0.1 * len(frames):
        raise capture_error("missing", f"{len(missing)} keyframes missing")
    pairs = [(f, b) for f, b in zip(frames, blobs) if b is not None]
    images_full: dict[int, np.ndarray] = {}
    for f, b in pairs:
        try:
            img = decode_jpeg(b)
        except ValueError:
            continue
        if img.shape[1] != f.K.width or img.shape[0] != f.K.height:
            # The JPEG must match the intrinsics; a rotated or resized image would not line up.
            raise capture_error(
                "format", f"frame {f.index}: image {img.shape[1]}x{img.shape[0]} vs {f.K.width}x{f.K.height}"
            )
        images_full[f.index] = img
    frames = [f for f in frames if f.index in images_full]
    lap("load", t0)
    log(f"loaded {len(frames)} frames")

    # 2. Depth at working resolution.
    t0 = time.time()
    work = []
    for f in frames:
        w, h = working_size(f.K.width, f.K.height, WORK_WIDTH)
        img = images_full[f.index]
        small = cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA) if (w, h) != (img.shape[1], img.shape[0]) else img
        work.append((f, small, f.K.scaled(w, h)))
    depth_maps = depth_model([s for _, s, _ in work], [K.fov_x_deg for _, _, K in work])
    views = [make_view(f, s, K, dm) for (f, s, K), dm in zip(work, depth_maps)]
    lap("depth", t0)
    log(f"depth done in {timings['depth']} s on {getattr(depth_model, 'device', '?')}")

    # 3. Axes check: up-facing pixels must sit below the horizon.
    check = floor_reprojection_check(views)
    if check["agreement"] is not None and check["agreement"] < 0.6:
        raise capture_error("format", f"floor reprojection agreement {check['agreement']}")

    # 4. Scale per frame, anchored to the AR floor.
    t0 = time.time()
    floor_y = capture.floor_y
    scale_info = anchor_scales(views, floor_y)
    down = [v for v in views if v.frame.ring == 0]
    floor_seen = sum(1 for v in down if "anchor" in v.info)
    if scale_info["anchored"] == 0 or (down and floor_seen < 0.3 * len(down)):
        raise capture_error("floor", f"floor anchors: {scale_info['anchored']} ({floor_seen}/{len(down)} down-ring)")
    lap("scale", t0)

    # 5. Fuse; 6. ceiling (RANSAC) and the room's yaw.
    t0 = time.time()
    cloud = fuse(views)
    ceiling_ransac = fit_ceiling_ransac(cloud, floor_y)
    angle, yaw_strength = estimate_yaw(cloud)
    axes = Axes(angle)
    lap("fuse", t0)

    # 7. Cues.
    t0 = time.time()
    ceil_guess = floor_y + ceiling_ransac["height"] if ceiling_ransac else None
    fj = Junctions.concat([junctions(v, floor_y, ceil_guess, "floor") for v in views])
    cj = Junctions.concat([junctions(v, floor_y, ceil_guess, "ceiling") for v in views])
    band = band_points(views, floor_y, ceiling_ransac["height"] if ceiling_ransac else None)
    free = free_space(views)
    cams = {v.index: v.pose.c[[0, 2]] for v in views}
    lap("cues", t0)

    # Refine the yaw on the junction points: the angle that makes each wall's offsets sharpest.
    angle = refine_yaw(angle, fj, cj, floor_y)
    axes = Axes(angle)

    # 8. Walls: first from floor lines and band points, to measure the ceiling along those walls;
    # then with the ceiling lines too.
    t0 = time.time()
    floor_ev = junction_evidence(axes, fj, floor_y, FLOOR_LINE)
    band_ev = band_evidence(axes, band, cams)
    walls1, _ = fit_walls(axes, floor_ev, None, band_ev, free)
    for w in walls1:
        w.confidence = wall_confidence(w)
    ceiling_rays = ceiling_from_rays(axes, walls1, cj, floor_y)
    ceiling_h, ceiling_src = None, None
    if ceiling_rays and ceiling_rays["spread"] < 0.06:
        ceiling_h, ceiling_src = ceiling_rays["height"], "rays"
    elif ceiling_ransac:
        ceiling_h, ceiling_src = ceiling_ransac["height"], "ransac"
    elif ceiling_rays:
        ceiling_h, ceiling_src = ceiling_rays["height"], "rays"
    ceil_ev = junction_evidence(axes, cj, floor_y + ceiling_h, CEILING_LINE) if ceiling_h else None
    if ceiling_h and ceiling_src == "rays":
        # The up ring's scale can now also lean on the ceiling, measured along the walls; band
        # points and free space are taken again with the new scales.
        t1 = time.time()
        scale_info = {**anchor_scales(views, floor_y, floor_y + ceiling_h), "ceilingAnchored": True}
        band = band_points(views, floor_y, ceiling_h)
        band_ev = band_evidence(axes, band, cams)
        free = free_space(views)
        cloud = fuse(views)
        lap("rescale", t1)
    walls, fit_report = fit_walls(
        axes, floor_ev, ceil_ev, band_ev, free, ceiling_weight=1.0 if ceiling_src == "rays" else 0.7
    )
    if not walls:
        raise capture_error("walls", "no walls found")
    lap("fit", t0)

    # 9. Marks, and the room the phone will build from them.
    spot_xz = {}
    for s in sorted({v.frame.spot for v in views}):
        cs = np.array([v.pose.c for v in views if v.frame.spot == s])
        spot_xz[s] = cs.mean(axis=0)[[0, 2]]
    scale_spread = float(scale_info.get("spread") or 0.0)
    for w in walls:
        w.confidence = wall_confidence(w, scale_spread)
    marks = marks_from_walls(axes, walls, spot_xz)
    room = solve_room(angle, floor_y, ceiling_h, marks)
    if room and room.get("ok"):
        lengths = {}
        for rw in room["walls"]:
            for mid in rw["markIds"]:
                lengths[mid] = max(lengths.get(mid, 0.0), rw["length"])
        for w in walls:
            w.length = lengths.get(w.mark_id)
            w.confidence = wall_confidence(w, scale_spread)
        marks = marks_from_walls(axes, walls, spot_xz)

    result = {
        "axesAngle": round(float(angle), 6),
        "floorY": round(float(floor_y), 4),
        "ceilingHeight": round(float(ceiling_h), 4) if ceiling_h else None,
        "marks": marks,
        "openings": [],
        "spots": [],
    }
    info = {
        "version": __version__,
        "model": getattr(depth_model, "name", "?"),
        "device": getattr(depth_model, "device", "?"),
        "modelLoadSeconds": round(float(getattr(depth_model, "load_seconds", 0.0)), 2),
        "capture": vinfo,
        "framesUsed": int(sum(math.isfinite(v.scale) for v in views)),
        "axesCheck": check,
        "scale": scale_info,
        "frameScales": {str(v.index): round(v.scale, 4) for v in views if math.isfinite(v.scale)},
        "ceiling": {"ransac": ceiling_ransac, "rays": ceiling_rays, "used": ceiling_src},
        "yawStrength": round(yaw_strength, 3),
        "cues": {"floorLine": len(fj), "ceilingLine": len(cj), "band": len(band)},
        "walls": [wall_info(w) for w in walls],
        "solve": summarize_room(room),
        "timings": timings,
    }
    out = FitOutput(result=result, info=info, views=views, cloud=cloud, walls=walls, room=room)
    out.extras = {
        "axes": axes,
        "floor_ev": floor_ev,
        "ceil_ev": ceil_ev,
        "band_ev": band_ev,
        "free": free,
        "fit_report": fit_report,
        "images_full": images_full,
        "capture": capture,
        "ceiling_h": ceiling_h,
    }

    # 10. Openings (optional), panoramas, debug bundle.
    def time_left():
        return opt.deadline is None or time.time() < opt.deadline

    if opt.openings and time_left():
        t0 = time.time()
        try:
            from .openings import find_openings

            result["openings"], info["openings"] = find_openings(out, store, log=log)
        except Exception as e:  # noqa: BLE001 - openings are optional
            info["openings"] = {"error": str(e)[:300]}
        lap("openings", t0)
    if opt.panoramas and time_left():
        t0 = time.time()
        from .panorama import stitch_spots

        try:
            result["spots"] = stitch_spots(out, store, width=opt.pano_width, log=log)
        except Exception as e:  # noqa: BLE001 - a failed panorama must not lose the walls
            info["panoramaError"] = str(e)[:300]
        lap("panoramas", t0)
    if opt.debug and time_left():
        t0 = time.time()
        from .debug import write_debug

        try:
            info["debug"] = write_debug(out, store)
        except Exception as e:  # noqa: BLE001
            info["debugError"] = str(e)[:300]
        lap("debug", t0)
    timings["total"] = round(time.time() - t_start, 2)
    return out


def refine_yaw(
    angle: float, fj: Junctions, cj: Junctions, floor_y: float, span_deg: float = 2.5, step_deg: float = 0.1
) -> float:
    """Turns the axes by up to ±span so that junction points line up sharpest along the four wall
    directions: floor-line rays where they meet the floor (exact), and ceiling-junction wall points
    (scale-anchored; only used to compare angles)."""
    if len(fj) + len(cj) < 200:
        return angle
    pts, nrm = [], []
    if len(fj):
        P, ok = fj.hit_level(floor_y)
        pts.append(P[ok])
        nrm.append(fj.normal_xz[ok])
    if len(cj):
        pts.append(cj.wall_point[:, [0, 2]])
        nrm.append(cj.normal_xz)
    P = np.concatenate(pts)
    N = np.concatenate(nrm)
    best, best_score = angle, -1.0
    for d in np.arange(-span_deg, span_deg + 1e-9, step_deg):
        a = angle + math.radians(d)
        axes = Axes(a)
        cls = classify_normals(axes, N, 30)
        score = 0.0
        for c in range(4):
            m = cls == c
            if m.sum() < 20:
                continue
            n_dir = axes.u if CLASS_AXIS[c] == 1 else axes.v
            t = P[m] @ n_dir
            hist = np.bincount(np.floor((t - t.min()) / 0.02).astype(int))
            score += float((hist.astype(np.float64) ** 2).sum())
        if score > best_score:
            best, best_score = a, score
    return float((best + math.pi / 4) % (math.pi / 2) - math.pi / 4)


def wall_info(w) -> dict:
    ev: Evidence = w.support
    return {
        "markId": w.mark_id,
        "axis": int(w.axis),
        "kind": w.kind,
        "offset": round(w.t, 4),
        "tFloor": None if w.t_floor is None else round(w.t_floor, 4),
        "tCeiling": None if w.t_ceil is None else round(w.t_ceil, 4),
        "tBand": None if w.t_band is None else round(w.t_band, 4),
        "floorLine": int((ev.cue == FLOOR_LINE).sum()),
        "ceilingLine": int((ev.cue == CEILING_LINE).sum()),
        "band": int(len(w.band)),
        "spread": round(w.spread, 4),
        "seen": round(w.covered_length(), 2),
        "length": None if w.length is None else round(w.length, 3),
        "freeBeyond": round(w.free_beyond, 2),
        "near": None if w.near is None else round(w.near, 2),
        "confidence": round(w.confidence, 3),
    }


def summarize_room(room: dict | None) -> dict:
    if room is None:
        return {"ok": None, "reason": "solver unavailable"}
    if not room.get("ok"):
        return {"ok": False, "error": room.get("error"), "reason": room.get("reason")}
    return {
        "ok": True,
        "area": round(room["area"], 3),
        "walls": [round(w["length"], 3) for w in room["walls"]],
        "inferred": [i for i, w in enumerate(room["walls"]) if w["inferred"]],
        "leftOut": room.get("leftOut", []),
    }
