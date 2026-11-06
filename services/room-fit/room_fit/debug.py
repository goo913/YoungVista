"""The debug bundle under the scan folder's `out/`: the fused point cloud (PLY), a top-down cue
image, and the fit's full report (JSON)."""

from __future__ import annotations

import json

import cv2
import numpy as np

from .cues import BAND, CEILING_LINE, FLOOR_LINE
from .geometry import class_point


def ply_bytes(points: np.ndarray, normals: np.ndarray, colors: np.ndarray) -> bytes:
    n = len(points)
    header = (
        "ply\nformat binary_little_endian 1.0\n"
        f"element vertex {n}\n"
        "property float x\nproperty float y\nproperty float z\n"
        "property float nx\nproperty float ny\nproperty float nz\n"
        "property uchar red\nproperty uchar green\nproperty uchar blue\n"
        "end_header\n"
    ).encode()
    rec = np.zeros(
        n,
        dtype=[
            ("x", "<f4"),
            ("y", "<f4"),
            ("z", "<f4"),
            ("nx", "<f4"),
            ("ny", "<f4"),
            ("nz", "<f4"),
            ("r", "u1"),
            ("g", "u1"),
            ("b", "u1"),
        ],
    )
    rec["x"], rec["y"], rec["z"] = points[:, 0], points[:, 1], points[:, 2]
    rec["nx"], rec["ny"], rec["nz"] = normals[:, 0], normals[:, 1], normals[:, 2]
    rec["r"], rec["g"], rec["b"] = colors[:, 0], colors[:, 1], colors[:, 2]
    return header + rec.tobytes()


def cue_image(out, px_per_m: float = 100.0) -> np.ndarray:
    """Top-down view: free space (grey), floor-line points (blue), ceiling-line points (red), band
    points (green), fitted walls (black, thick when sure), the solved outline (orange), spots."""
    ex = out.extras
    axes = ex["axes"]
    free = ex["free"]
    pts = []
    for ev in (ex["floor_ev"], ex.get("ceil_ev"), ex["band_ev"]):
        if ev is None or len(ev) == 0:
            continue
        for c in range(4):
            m = ev.cls == c
            if m.any():
                pts.append(np.array([class_point(axes, c, t, a) for t, a in zip(ev.t[m][:4000], ev.a[m][:4000])]))
    cams = np.array([v.pose.c[[0, 2]] for v in out.views])
    allp = np.concatenate(pts + [cams]) if pts else cams
    lo = np.percentile(allp, 1, axis=0) - 1.0
    hi = np.percentile(allp, 99, axis=0) + 1.0
    size = np.ceil((hi - lo) * px_per_m).astype(int)
    size = np.clip(size, 200, 1600)
    img = np.full((size[1], size[0], 3), 255, np.uint8)

    def to_px(p):
        q = (np.asarray(p) - lo) * px_per_m
        return np.round(q).astype(int)

    # Free space.
    if free is not None:
        ys, xs = np.mgrid[0 : size[1], 0 : size[0]]
        world = np.stack([xs / px_per_m + lo[0], ys / px_per_m + lo[1]], -1)
        cnt = free.lookup(world)
        img[cnt >= 3] = (225, 225, 225)
    colors = {FLOOR_LINE: (40, 90, 230), CEILING_LINE: (220, 50, 40), BAND: (60, 170, 60)}
    for ev in (ex["band_ev"], ex.get("ceil_ev"), ex["floor_ev"]):
        if ev is None or len(ev) == 0:
            continue
        sel = np.random.default_rng(0).choice(len(ev), min(len(ev), 30000), replace=False)
        for k in sel:
            p = class_point(axes, int(ev.cls[k]), float(ev.t[k]), float(ev.a[k]))
            x, y = to_px(p)
            if 0 <= x < size[0] and 0 <= y < size[1]:
                img[y, x] = colors[int(ev.cue[k])]
    room = out.room
    if room and room.get("ok"):
        poly = to_px(np.asarray(room["points"])).reshape(-1, 1, 2)
        cv2.polylines(img, [poly], True, (255, 140, 0), 2, cv2.LINE_AA)
    for w in out.walls:
        for lo_a, hi_a in w.coverage:
            a = class_point(axes, w.cls, w.t, lo_a)
            b = class_point(axes, w.cls, w.t, hi_a)
            thick = 3 if w.confidence >= 0.5 else 1
            cv2.line(img, tuple(to_px(a)), tuple(to_px(b)), (0, 0, 0), thick, cv2.LINE_AA)
        mid = class_point(axes, w.cls, w.t, w.along_centre())
        cv2.putText(
            img,
            f"{w.mark_id} {w.confidence:.2f}",
            tuple(to_px(mid) + [4, -4]),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.4,
            (0, 0, 0),
            1,
            cv2.LINE_AA,
        )
    for c in cams:
        cv2.circle(img, tuple(to_px(c)), 2, (120, 0, 160), -1)
    return img


def write_debug(out, store) -> dict:
    paths = {}
    cl = out.cloud
    if cl is not None and len(cl.points):
        paths["cloud"] = store.write(
            "out/cloud.ply", ply_bytes(cl.points, cl.normals, cl.colors), "application/octet-stream"
        )
    img = cue_image(out)
    ok, buf = cv2.imencode(".png", cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
    if ok:
        paths["cues"] = store.write("out/cues.png", buf.tobytes(), "image/png")
    report = {"result": out.result, "info": out.info, "fitReport": out.extras.get("fit_report")}
    paths["fit"] = store.write("out/fit.json", json.dumps(report, indent=1, default=str).encode(), "application/json")
    return paths
