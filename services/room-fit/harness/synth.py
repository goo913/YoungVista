"""Synthetic turn-around captures with known geometry, in the phone's upload format.

A small ray tracer renders rectilinear rooms (rectangles and L shapes) with textured walls, floor and
ceiling, furniture boxes that hide floor lines, doors and windows, soft corner shading and lamp
shadows. The camera turns like a person (three landscape rings at -35°, 0° and +35°, held about an
arm's length in front of the body) with iPhone 15-like intrinsics. What the phone reports can carry
AR errors (floor height, pose noise, a slow heading drift), so the harness measures the whole chain.

Everything is in a room frame first (floor at y = 0, walls on the x/z axes) and then placed in the
AR world with a turn, a shift and a floor height, as ARKit would report it.
"""

from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from room_fit.geometry import Intrinsics, Pose, pixel_grid, pixel_rays  # noqa: E402

# ------------------------------------------------------------------------------------------------
# Scene
# ------------------------------------------------------------------------------------------------


@dataclass
class Box:
    name: str
    lo: tuple[float, float, float]
    hi: tuple[float, float, float]
    color: tuple[float, float, float]
    pattern: str = "fabric"  # fabric | wood | panel | plain


@dataclass
class Decal:
    """Something flat on a wall: a door, a window, a picture or a switch."""

    wall: int
    a0: float  # metres from the wall's first corner
    a1: float
    y0: float
    y1: float
    kind: str  # door | window | picture | plate
    color: tuple[float, float, float] = (0.6, 0.5, 0.4)


@dataclass
class Room:
    name: str
    points: list[tuple[float, float]]  # counter-clockwise seen from above (+y), room frame (x, z)
    height: float
    boxes: list[Box] = field(default_factory=list)
    decals: list[Decal] = field(default_factory=list)
    spots: list[tuple[float, float]] = field(default_factory=list)
    wall_color: tuple[float, float, float] = (0.78, 0.72, 0.62)
    floor_kind: str = "wood"
    lights: list[tuple[float, float, float]] = field(default_factory=list)

    def walls(self) -> list[tuple[np.ndarray, np.ndarray, np.ndarray, float]]:
        """(start, unit direction, inward normal, length) of each wall."""
        pts = np.asarray(self.points, dtype=np.float64)
        area = 0.5 * np.sum(pts[:, 0] * np.roll(pts[:, 1], -1) - np.roll(pts[:, 0], -1) * pts[:, 1])
        out = []
        for k in range(len(pts)):
            p0 = pts[k]
            p1 = pts[(k + 1) % len(pts)]
            e = p1 - p0
            L = float(np.linalg.norm(e))
            e = e / L
            # Counter-clockwise in (x, z) means the inside is on the left: n = (-e_z, e_x).
            n = np.array([-e[1], e[0]]) if area > 0 else np.array([e[1], -e[0]])
            out.append((p0, e, n, L))
        return out


def rect_room(name, w, d, h=2.6, **kw) -> Room:
    return Room(name=name, points=[(0, 0), (w, 0), (w, d), (0, d)], height=h, **kw)


def demo_rooms() -> list[Room]:
    """The harness rooms: a cluttered bedroom, a small bedroom, an L-shaped living room and a long
    room. Walls are numbered from the first corner, counter-clockwise."""
    rooms = []
    # 1. Bedroom 3.6 x 4.2: bed against wall 0 (the bed's side runs along the window wall), desk,
    # wardrobe 2 m tall.
    r = rect_room("bedroom", 3.6, 4.2, 2.6, spots=[(1.9, 2.3)], lights=[(1.8, 2.45, 2.1)])
    r.boxes = [
        Box("bed", (0.15, 0.0, 0.0), (1.75, 0.55, 2.05), (0.55, 0.78, 0.80), "fabric"),
        Box("headboard", (0.15, 0.0, 0.0), (1.75, 1.05, 0.08), (0.45, 0.32, 0.22), "wood"),
        Box("pillow", (0.4, 0.55, 0.12), (1.5, 0.68, 0.5), (0.92, 0.92, 0.9), "fabric"),
        Box("nightstand", (1.85, 0.0, 0.0), (2.35, 0.55, 0.4), (0.42, 0.30, 0.2), "wood"),
        Box("desk", (3.0, 0.0, 1.4), (3.6, 0.75, 2.6), (0.35, 0.25, 0.18), "wood"),
        Box("chair", (2.45, 0.0, 1.75), (2.9, 0.9, 2.2), (0.25, 0.3, 0.38), "fabric"),
        Box("wardrobe", (0.2, 0.0, 3.6), (1.4, 2.0, 4.2), (0.93, 0.92, 0.88), "panel"),
    ]
    r.decals = [
        Decal(0, 2.4, 3.4, 0.95, 2.15, "window", (0.95, 0.97, 1.0)),
        Decal(2, 0.4, 1.3, 0.0, 2.05, "door", (0.96, 0.95, 0.92)),
        Decal(1, 0.6, 1.3, 1.3, 1.8, "picture", (0.3, 0.45, 0.6)),
        Decal(3, 2.5, 3.6, 1.2, 1.85, "picture", (0.7, 0.4, 0.3)),
        Decal(2, 1.45, 1.53, 1.05, 1.17, "plate", (0.97, 0.97, 0.97)),
    ]
    rooms.append(r)

    # 2. Small bedroom 2.9 x 3.2, single bed along a wall and a wardrobe; walls under 1.5 m away.
    r = rect_room("small", 2.9, 3.2, 2.45, spots=[(1.6, 1.75)], lights=[(1.45, 2.3, 1.6)])
    r.wall_color = (0.86, 0.85, 0.80)
    r.floor_kind = "carpet"
    r.boxes = [
        Box("bed", (0.0, 0.0, 0.1), (0.95, 0.5, 2.1), (0.75, 0.55, 0.6), "fabric"),
        Box("wardrobe", (2.3, 0.0, 2.0), (2.9, 1.95, 3.2), (0.6, 0.45, 0.3), "panel"),
        Box("shelf", (1.3, 0.0, 0.0), (2.2, 0.8, 0.35), (0.85, 0.85, 0.85), "panel"),
    ]
    r.decals = [
        Decal(0, 1.4, 2.1, 1.0, 2.0, "window", (0.95, 0.97, 1.0)),
        Decal(3, 0.3, 1.1, 0.0, 2.0, "door", (0.55, 0.4, 0.28)),
        Decal(2, 1.4, 2.2, 1.2, 1.7, "picture", (0.2, 0.5, 0.3)),
    ]
    rooms.append(r)

    # 3. L-shaped living room: 5.4 x 4.6 with a 2.2 x 1.8 corner missing. Two spots.
    pts = [(0, 0), (5.4, 0), (5.4, 2.8), (3.2, 2.8), (3.2, 4.6), (0, 4.6)]
    r = Room("living-L", pts, 2.7, spots=[(1.6, 2.2), (4.2, 1.3)])
    r.lights = [(1.6, 2.55, 2.3), (4.3, 2.55, 1.4)]
    r.wall_color = (0.80, 0.80, 0.76)
    r.boxes = [
        Box("sofa", (0.0, 0.0, 1.2), (0.95, 0.85, 3.4), (0.35, 0.42, 0.5), "fabric"),
        Box("bookcase", (1.2, 0.0, 4.25), (2.4, 1.9, 4.6), (0.5, 0.36, 0.24), "panel"),
        Box("table", (1.9, 0.0, 1.6), (2.8, 0.45, 2.4), (0.45, 0.33, 0.22), "wood"),
        Box("tv-stand", (3.6, 0.0, 0.0), (5.0, 0.55, 0.45), (0.2, 0.2, 0.22), "wood"),
        Box("armchair", (4.55, 0.0, 1.7), (5.4, 0.9, 2.55), (0.6, 0.35, 0.25), "fabric"),
    ]
    r.decals = [
        Decal(0, 0.6, 1.8, 0.9, 2.2, "window", (0.95, 0.97, 1.0)),
        Decal(5, 0.6, 1.5, 0.0, 2.05, "door", (0.96, 0.95, 0.92)),
        Decal(1, 0.9, 2.1, 1.2, 1.9, "picture", (0.6, 0.6, 0.3)),
        Decal(3, 0.6, 1.4, 1.3, 1.8, "picture", (0.25, 0.3, 0.55)),
        Decal(4, 0.5, 1.4, 0.0, 2.05, "door", (0.5, 0.36, 0.25)),
    ]
    rooms.append(r)

    # 4. A long room 3.3 x 6.2 with two spots, a long sofa and a dining table.
    r = rect_room("long", 3.3, 6.2, 2.5, spots=[(1.7, 1.8), (1.6, 4.4)])
    r.lights = [(1.65, 2.35, 1.6), (1.65, 2.35, 4.6)]
    r.wall_color = (0.74, 0.79, 0.80)
    r.boxes = [
        Box("sofa", (0.0, 0.0, 0.8), (0.9, 0.8, 3.0), (0.5, 0.5, 0.48), "fabric"),
        Box("sideboard", (2.85, 0.0, 3.6), (3.3, 0.9, 5.4), (0.4, 0.28, 0.2), "wood"),
        Box("dining", (1.0, 0.0, 4.6), (2.2, 0.75, 5.5), (0.55, 0.4, 0.3), "wood"),
    ]
    r.decals = [
        Decal(1, 4.6, 5.6, 0.9, 2.1, "window", (0.95, 0.97, 1.0)),
        Decal(0, 1.0, 1.9, 0.0, 2.05, "door", (0.96, 0.95, 0.92)),
        Decal(3, 1.0, 2.6, 1.1, 1.9, "picture", (0.65, 0.3, 0.3)),
    ]
    rooms.append(r)
    return rooms


# ------------------------------------------------------------------------------------------------
# Noise and textures
# ------------------------------------------------------------------------------------------------


def _hash(ix: np.ndarray, iy: np.ndarray, seed: int) -> np.ndarray:
    h = (ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFF).astype(np.float32) / float(0x1000000)


def value_noise(x: np.ndarray, y: np.ndarray, seed: int) -> np.ndarray:
    ix = np.floor(x)
    iy = np.floor(y)
    fx = (x - ix).astype(np.float32)
    fy = (y - iy).astype(np.float32)
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    a = _hash(ix, iy, seed)
    b = _hash(ix + 1, iy, seed)
    c = _hash(ix, iy + 1, seed)
    d = _hash(ix + 1, iy + 1, seed)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(x, y, seed, octaves=4):
    total = np.zeros(np.shape(x), np.float32)
    amp = 0.5
    for o in range(octaves):
        total += amp * value_noise(x * (2**o), y * (2**o), seed + 17 * o)
        amp *= 0.5
    return total


def floor_albedo(x, z, kind):
    if kind == "carpet":
        n = fbm(x * 40, z * 40, 3) * 0.5 + fbm(x * 4, z * 4, 9) * 0.5
        base = np.array([0.62, 0.55, 0.46], np.float32)
        return base * (0.8 + 0.35 * n[..., None])
    # Wood planks along x, 14 cm wide, staggered joints.
    pw = 0.14
    plank = np.floor(z / pw)
    shift = _hash(plank, plank * 0 + 7, 11) * 1.3
    seg = np.floor((x + shift) / 1.25)
    tone = 0.78 + 0.28 * _hash(plank, seg, 5)
    grain = 0.88 + 0.12 * np.sin((x + shift) * 25.0 + 6.0 * fbm(x * 3, z * 30, 2))
    gap = (np.mod(z, pw) < 0.004) | (np.mod(x + shift, 1.25) < 0.004)
    base = np.array([0.62, 0.45, 0.30], np.float32)
    col = base * (tone * grain)[..., None]
    col[gap] *= 0.45
    return col


def wall_albedo(a, y, color, seed):
    n = fbm(a * 12, y * 12, seed) * 0.6 + fbm(a * 80, y * 80, seed + 5) * 0.4
    col = np.asarray(color, np.float32) * (0.93 + 0.1 * n[..., None])
    base = y < 0.09
    col[base] = np.array([0.95, 0.95, 0.93], np.float32) * (0.92 + 0.06 * n[base][..., None])
    edge = np.abs(y - 0.09) < 0.006
    col[edge] *= 0.75
    return col


def ceiling_albedo(x, z):
    n = fbm(x * 15, z * 15, 21)
    return np.array([0.93, 0.93, 0.91], np.float32) * (0.95 + 0.06 * n[..., None])


def box_albedo(box: Box, p, normal_axis):
    # Two texture coordinates on the face.
    if normal_axis == 0:
        s, t = p[..., 2], p[..., 1]
    elif normal_axis == 1:
        s, t = p[..., 0], p[..., 2]
    else:
        s, t = p[..., 0], p[..., 1]
    col = np.asarray(box.color, np.float32)
    if box.pattern == "wood":
        g = 0.85 + 0.15 * np.sin(s * 30 + 5 * fbm(s * 2, t * 20, 4))
        out = col * g[..., None]
    elif box.pattern == "panel":
        n = fbm(s * 20, t * 20, 8)
        out = col * (0.94 + 0.08 * n[..., None])
        seam = (np.abs(np.mod(s - box.lo[0], 0.5) - 0.0) < 0.006) & (normal_axis != 1)
        out[seam] *= 0.55
        handle = (np.abs(np.mod(s - box.lo[0], 0.5) - 0.45) < 0.012) & (np.abs(t - 1.0) < 0.12)
        out[handle] = 0.25
    elif box.pattern == "fabric":
        n = fbm(s * 60, t * 60, 12) * 0.5 + fbm(s * 6, t * 6, 13) * 0.5
        out = col * (0.8 + 0.3 * n[..., None])
    else:
        out = np.broadcast_to(col, p.shape).copy()
    return out


# ------------------------------------------------------------------------------------------------
# Ray tracing
# ------------------------------------------------------------------------------------------------

FLOOR, CEILING, WALL, BOX = 0, 1, 2, 3


def trace(room: Room, o: np.ndarray, d: np.ndarray):
    """Nearest hits of rays (origin o (3,), directions d (N, 3)) in the room frame.

    Returns t (N,), kind (N,), index (N,) (wall or box index), normal (N, 3)."""
    N = d.shape[0]
    t = np.full(N, np.inf, np.float64)
    kind = np.full(N, -1, np.int16)
    idx = np.full(N, -1, np.int16)
    normal = np.zeros((N, 3), np.float32)
    H = room.height
    with np.errstate(divide="ignore", invalid="ignore"):
        tf = np.where(d[:, 1] < -1e-9, (0.0 - o[1]) / d[:, 1], np.inf)
        tc = np.where(d[:, 1] > 1e-9, (H - o[1]) / d[:, 1], np.inf)
    for tt, kk, ny in ((tf, FLOOR, 1.0), (tc, CEILING, -1.0)):
        better = tt < t
        t[better] = tt[better]
        kind[better] = kk
        normal[better] = (0, ny, 0)
    for k, (p0, e, n, L) in enumerate(room.walls()):
        den = d[:, 0] * n[0] + d[:, 2] * n[1]
        with np.errstate(divide="ignore", invalid="ignore"):
            tw = ((p0[0] - o[0]) * n[0] + (p0[1] - o[2]) * n[1]) / den
        hx = o[0] + tw * d[:, 0]
        hz = o[2] + tw * d[:, 2]
        hy = o[1] + tw * d[:, 1]
        s = (hx - p0[0]) * e[0] + (hz - p0[1]) * e[1]
        ok = (den < -1e-9) & (tw > 1e-6) & (s >= -1e-6) & (s <= L + 1e-6) & (hy >= -1e-3) & (hy <= H + 1e-3)
        better = ok & (tw < t)
        t[better] = tw[better]
        kind[better] = WALL
        idx[better] = k
        normal[better] = (n[0], 0, n[1])
    for b, box in enumerate(room.boxes):
        lo = np.asarray(box.lo)
        hi = np.asarray(box.hi)
        with np.errstate(divide="ignore", invalid="ignore"):
            inv = 1.0 / d
            t0 = (lo - o) * inv
            t1 = (hi - o) * inv
        tmin = np.minimum(t0, t1)
        tmax = np.maximum(t0, t1)
        tmin = np.nan_to_num(tmin, nan=-np.inf)
        tmax = np.nan_to_num(tmax, nan=np.inf)
        tn = tmin.max(axis=1)
        tx = tmax.min(axis=1)
        axis = tmin.argmax(axis=1)
        ok = (tn <= tx) & (tn > 1e-6)
        better = ok & (tn < t)
        if not better.any():
            continue
        t[better] = tn[better]
        kind[better] = BOX
        idx[better] = b
        ax = axis[better]
        sgn = -np.sign(d[better, ax])
        nrm = np.zeros((int(better.sum()), 3), np.float32)
        nrm[np.arange(len(ax)), ax] = sgn
        normal[better] = nrm
    return t, kind, idx, normal


def occluded_by_boxes(room: Room, p: np.ndarray, light: np.ndarray) -> np.ndarray:
    """Whether the segment from points p (N, 3) to the light passes through a box."""
    d = light[None, :] - p
    blocked = np.zeros(len(p), bool)
    for box in room.boxes:
        lo = np.asarray(box.lo) - 1e-4
        hi = np.asarray(box.hi) + 1e-4
        with np.errstate(divide="ignore", invalid="ignore"):
            inv = 1.0 / d
            t0 = (lo - p) * inv
            t1 = (hi - p) * inv
        tmin = np.nan_to_num(np.minimum(t0, t1), nan=-np.inf).max(axis=1)
        tmax = np.nan_to_num(np.maximum(t0, t1), nan=np.inf).min(axis=1)
        blocked |= (tmin <= tmax) & (tmax > 1e-3) & (tmin < 1.0) & (tmin > 1e-3)
    return blocked


def _dist_to_segments(px, pz, segs):
    best = np.full(np.shape(px), np.inf, np.float32)
    for (ax, az), (bx, bz) in segs:
        ex, ez = bx - ax, bz - az
        L2 = ex * ex + ez * ez
        s = np.clip(((px - ax) * ex + (pz - az) * ez) / L2, 0, 1)
        dx = px - (ax + s * ex)
        dz = pz - (az + s * ez)
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz))
    return best


def shade(room: Room, o, d, t, kind, idx, normal, seed=0):
    """Colours (N, 3) in 0..1 of the hits."""
    p = o[None, :] + t[:, None] * d
    N = len(t)
    alb = np.full((N, 3), 0.5, np.float32)
    emissive = np.zeros(N, bool)
    walls = room.walls()
    segs = [((w[0][0], w[0][1]), (w[0][0] + w[1][0] * w[3], w[0][1] + w[1][1] * w[3])) for w in walls]
    m = kind == FLOOR
    if m.any():
        alb[m] = floor_albedo(p[m, 0], p[m, 2], room.floor_kind)
    m = kind == CEILING
    if m.any():
        alb[m] = ceiling_albedo(p[m, 0], p[m, 2])
    for k, (p0, e, _n, _L) in enumerate(walls):
        m = (kind == WALL) & (idx == k)
        if not m.any():
            continue
        a = (p[m, 0] - p0[0]) * e[0] + (p[m, 2] - p0[1]) * e[1]
        y = p[m, 1]
        col = wall_albedo(a, y, room.wall_color, 30 + k)
        emi = np.zeros(len(a), bool)
        for dc in room.decals:
            if dc.wall != k:
                continue
            inside = (a >= dc.a0) & (a <= dc.a1) & (y >= dc.y0) & (y <= dc.y1)
            frame = inside & (
                (a - dc.a0 < 0.06)
                | (dc.a1 - a < 0.06)
                | (dc.y1 - y < 0.06)
                | ((y - dc.y0 < 0.06) & (dc.kind != "door"))
            )
            if dc.kind == "window":
                sky = inside & ~frame
                yy = (y - dc.y0) / (dc.y1 - dc.y0)
                sky_col = np.stack([0.80 + 0.15 * yy, 0.88 + 0.1 * yy, 0.97 + 0 * yy], -1).astype(np.float32)
                mull = sky & ((np.abs(a - (dc.a0 + dc.a1) / 2) < 0.02) | (np.abs(y - (dc.y0 + dc.y1) / 2) < 0.02))
                col[sky] = sky_col[sky]
                col[mull] = 0.96
                emi |= sky & ~mull
                col[frame] = 0.97
            elif dc.kind == "door":
                panel = inside & ~frame
                aa = a - dc.a0
                yy = y - dc.y0
                col[panel] = np.asarray(dc.color, np.float32)
                groove = panel & (
                    (np.abs(aa - 0.15) < 0.01)
                    | (np.abs(aa - (dc.a1 - dc.a0 - 0.15)) < 0.01)
                    | (np.abs(yy - 1.0) < 0.01)
                )
                col[groove] *= 0.8
                knob = panel & (np.abs(aa - (dc.a1 - dc.a0 - 0.12)) < 0.03) & (np.abs(yy - 1.0) < 0.03)
                col[knob] = (0.7, 0.65, 0.4)
                col[frame] = np.asarray(dc.color, np.float32) * 0.9
            else:
                col[inside] = np.asarray(dc.color, np.float32) * (
                    0.9 + 0.2 * fbm(a[inside] * 9, y[inside] * 9, 77)[..., None]
                )
                col[frame & (dc.kind == "picture")] = 0.15
        alb[m] = col
        emissive[np.flatnonzero(m)[emi]] = True
    for b, box in enumerate(room.boxes):
        m = (kind == BOX) & (idx == b)
        if not m.any():
            continue
        ax = np.abs(normal[m]).argmax(axis=1)
        col = np.zeros((int(m.sum()), 3), np.float32)
        for a_ in range(3):
            mm = ax == a_
            if mm.any():
                col[mm] = box_albedo(box, p[m][mm], a_)
        alb[m] = col

    # Lighting: lamps near the ceiling with box shadows, ambient light, and darker inner corners.
    light = np.zeros(N, np.float32)
    for L_ in room.lights:
        lp = np.asarray(L_, np.float64)
        to = lp[None, :] - p
        r2 = (to**2).sum(1)
        cos = np.maximum(0, (to * normal).sum(1) / np.sqrt(r2))
        lit = cos * (2.2 / (r2 + 0.5))
        shadow = occluded_by_boxes(room, p + normal * 1e-3, lp)
        lit[shadow] *= 0.25
        light += lit.astype(np.float32)
    ambient = 0.42
    # Distance to the nearest inner edge: wall foot and top, corners, furniture contact.
    edge = np.full(N, 9.0, np.float32)
    m = kind == FLOOR
    if m.any():
        dd = _dist_to_segments(p[m, 0], p[m, 2], segs)
        for box in room.boxes:
            if box.lo[1] <= 0.01:
                cx = np.clip(p[m, 0], box.lo[0], box.hi[0])
                cz = np.clip(p[m, 2], box.lo[2], box.hi[2])
                dd = np.minimum(dd, np.hypot(p[m, 0] - cx, p[m, 2] - cz))
        edge[m] = dd
    m = kind == CEILING
    if m.any():
        edge[m] = _dist_to_segments(p[m, 0], p[m, 2], segs)
    m = kind == WALL
    if m.any():
        y = p[m, 1]
        dd = np.minimum(y, room.height - y)
        corners = np.asarray(room.points, np.float64)
        cd = np.min(np.hypot(p[m, 0][:, None] - corners[None, :, 0], p[m, 2][:, None] - corners[None, :, 1]), axis=1)
        edge[m] = np.minimum(dd, cd)
    m = kind == BOX
    if m.any():
        edge[m] = np.where(np.abs(normal[m, 1]) < 0.5, p[m, 1], 9.0)
    ao = 1.0 - 0.38 * np.exp(-edge / 0.09) - 0.12 * np.exp(-edge / 0.35)
    col = alb * ((ambient + light) * ao)[:, None]
    col[emissive] = alb[emissive] * 1.25
    return np.clip(col, 0, 1)


# ------------------------------------------------------------------------------------------------
# Placing the room in the AR world, and the turn
# ------------------------------------------------------------------------------------------------


@dataclass
class Placement:
    """Room frame to AR world: rotate by `yaw` about +y, then shift."""

    yaw_deg: float = 23.0
    shift: tuple[float, float] = (-1.7, -2.4)
    floor_y: float = -1.37

    def R(self) -> np.ndarray:
        a = math.radians(self.yaw_deg)
        # Rotation about +y taking +x toward -z for positive angles (right-handed).
        return np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])

    def to_world(self, p: np.ndarray) -> np.ndarray:
        return p @ self.R().T + np.array([self.shift[0], self.floor_y, self.shift[1]])

    def to_room(self, p: np.ndarray) -> np.ndarray:
        return (p - np.array([self.shift[0], self.floor_y, self.shift[1]])) @ self.R()


@dataclass
class ArErrors:
    """What separates ARKit's report from the truth."""

    floor_bias: float = 0.01  # the AR floor sits this much above the real floor (m)
    rot_noise_deg: float = 0.2  # per-frame orientation noise (each axis)
    pos_noise: float = 0.005  # per-frame position noise (m)
    yaw_drift_deg: float = 0.3  # heading drift over the whole capture


def look_rotation_arkit(heading_deg: float, pitch_deg: float, roll_deg: float = 0.0) -> np.ndarray:
    """ARKit camera-to-world rotation (columns: right, up, back) for a heading/pitch/roll."""
    h = math.radians(heading_deg)
    p = math.radians(pitch_deg)
    f = np.array([math.sin(h) * math.cos(p), math.sin(p), math.cos(h) * math.cos(p)])
    right = np.cross(f, [0, 1, 0])
    right /= np.linalg.norm(right)
    up = np.cross(right, f)
    r = math.radians(roll_deg)
    right, up = right * math.cos(r) + up * math.sin(r), -right * math.sin(r) + up * math.cos(r)
    return np.stack([right, up, -f], axis=1)


def small_rotation(rng, sigma_deg) -> np.ndarray:
    w = rng.normal(0, math.radians(sigma_deg), 3)
    th = np.linalg.norm(w)
    if th < 1e-12:
        return np.eye(3)
    k = w / th
    Kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + math.sin(th) * Kx + (1 - math.cos(th)) * Kx @ Kx


IPHONE15 = Intrinsics(fx=1452.0, fy=1452.0, cx=962.3, cy=717.6, width=1920, height=1440)
# The 16:9 video format the phone falls back to: the same horizontal view, cropped top and bottom.
IPHONE15_16X9 = Intrinsics(fx=1452.0, fy=1452.0, cx=962.3, cy=537.6, width=1920, height=1080)


def intrinsics_for(size: str) -> Intrinsics:
    return {"1920x1440": IPHONE15, "1920x1080": IPHONE15_16X9}[size]


@dataclass
class ShotPlan:
    pitches: tuple[float, ...] = (-35.0, 0.0, 35.0)
    step_deg: float = 15.0
    arm: float = 0.24  # camera in front of the body's turning axis (m)
    height: float = 1.40


def plan_frames(room: Room, placement: Placement, plan: ShotPlan, rng) -> list[dict]:
    """True camera poses (world, ARKit) for every keyframe of every spot."""
    shots = []
    R_room = placement.R()
    t = 0.0
    for s, (bx, bz) in enumerate(room.spots):
        start = rng.uniform(0, 360)
        for ring, pitch in enumerate(plan.pitches):
            n = int(round(360 / plan.step_deg))
            for k in range(n):
                heading_room = start + k * plan.step_deg + rng.uniform(-2.0, 2.0)
                body = np.array([bx, 0, bz]) + rng.normal(0, 0.015, 3) * [1, 0, 1]
                hr = math.radians(heading_room)
                cam_room = body + plan.arm * np.array([math.sin(hr), 0, math.cos(hr)])
                cam_room[1] = plan.height + rng.normal(0, 0.01) - 0.04 * (pitch < 0)
                # Heading in the world: the room frame turns by placement.yaw about +y.
                fwd_room = np.array([math.sin(hr), 0, math.cos(hr)])
                fwd_world = R_room @ fwd_room
                heading_world = math.degrees(math.atan2(fwd_world[0], fwd_world[2]))
                Rk = look_rotation_arkit(heading_world, pitch + rng.normal(0, 1.5), rng.normal(0, 1.0))
                shots.append(
                    {
                        "spot": s,
                        "ring": ring,
                        "t": t,
                        "R_arkit": Rk,
                        "c": placement.to_world(cam_room[None, :])[0],
                    }
                )
                t += 0.45
    return shots


def render_frame(room: Room, placement: Placement, R_arkit, c, K: Intrinsics, seed=0, chunk=180):
    """An 8-bit RGB image, plus the true depth (camera z) and world normals."""
    pose = Pose.from_arkit(np.block([[R_arkit, c[:, None]], [np.zeros((1, 3)), np.ones((1, 1))]]))
    u, v = pixel_grid(K.width, K.height)
    rays = pixel_rays(K, pose, u, v).astype(np.float64)
    o_room = placement.to_room(c[None, :])[0]
    R = placement.R()
    img = np.zeros((K.height, K.width, 3), np.float32)
    depth = np.zeros((K.height, K.width), np.float32)
    nrm = np.zeros((K.height, K.width, 3), np.float32)
    for r0 in range(0, K.height, chunk):
        d = rays[r0 : r0 + chunk].reshape(-1, 3) @ R  # world -> room frame (R orthonormal)
        t, kind, idx, normal = trace(room, o_room, d)
        col = shade(room, o_room, d, t, kind, idx, normal, seed)
        h = min(chunk, K.height - r0)
        img[r0 : r0 + h] = col.reshape(h, K.width, 3)
        depth[r0 : r0 + h] = t.reshape(h, K.width)  # rays have camera z = 1, so t is depth
        nrm[r0 : r0 + h] = (normal @ R.T).reshape(h, K.width, 3)
    return img, depth, nrm


def camera_look(img: np.ndarray, rng) -> np.ndarray:
    """Gamma, a little blur, vignetting and sensor noise; 8-bit sRGB-ish."""
    out = np.power(np.clip(img, 0, 1), 1 / 2.2)
    out = cv2.GaussianBlur(out, (0, 0), 0.6)
    h, w = out.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    r2 = ((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2
    out = out * (1 - 0.08 * r2)[..., None]
    out = out + rng.normal(0, 0.008, out.shape)
    return np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)


def write_capture(
    room: Room,
    out_dir: Path,
    *,
    placement: Placement | None = None,
    errors: ArErrors | None = None,
    plan: ShotPlan | None = None,
    K: Intrinsics = IPHONE15,
    seed: int = 1,
    truth_scale: int = 2,
    log=print,
) -> dict:
    """Renders the capture into out_dir (capture.json, kf/*.jpg) plus truth.json and truth/*.npz
    (true depth and normals at 1/truth_scale resolution, for ablations)."""
    placement = placement or Placement()
    errors = errors or ArErrors()
    plan = plan or ShotPlan()
    rng = np.random.default_rng(seed)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "kf").mkdir(exist_ok=True)
    (out_dir / "truth").mkdir(exist_ok=True)
    shots = plan_frames(room, placement, plan, rng)
    frames = []
    drift_total = errors.yaw_drift_deg
    n = len(shots)
    for i, s in enumerate(shots):
        img, depth, nrm = render_frame(room, placement, s["R_arkit"], s["c"], K, seed)
        rgb = camera_look(img, rng)
        cv2.imwrite(
            str(out_dir / "kf" / f"{i:03d}.jpg"), cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 90]
        )
        tw, th = K.width // truth_scale, K.height // truth_scale
        np.savez_compressed(
            out_dir / "truth" / f"{i:03d}.npz",
            depth=cv2.resize(depth, (tw, th), interpolation=cv2.INTER_NEAREST).astype(np.float32),
            normal=cv2.resize(nrm, (tw, th), interpolation=cv2.INTER_NEAREST).astype(np.float16),
        )
        # What ARKit would report: the true pose with noise and a slow heading drift.
        drift = small_rotation(rng, 0)  # identity
        a = math.radians(drift_total * i / max(1, n - 1))
        drift = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
        R_rep = drift @ small_rotation(rng, errors.rot_noise_deg) @ s["R_arkit"]
        c_rep = s["c"] + rng.normal(0, errors.pos_noise, 3)
        M = np.eye(4)
        M[:3, :3] = R_rep
        M[:3, 3] = c_rep
        pose = Pose.from_arkit(M)
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
            }
        )
        if log and (i % 12 == 0 or i == n - 1):
            log(f"  {room.name}: rendered {i + 1}/{n}")
    spots = []
    for s in sorted({f["spot"] for f in frames}):
        cs = np.array([np.asarray(f["transform"]).reshape(4, 4).T[:3, 3] for f in frames if f["spot"] == s])
        spots.append({"index": s, "position": [float(x) for x in cs.mean(0)]})
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
    truth = room_truth(room, placement)
    (out_dir / "truth.json").write_text(json.dumps(truth, indent=1))
    return manifest


def room_truth(room: Room, placement: Placement) -> dict:
    pts = np.asarray(room.points, np.float64)
    world = placement.to_world(np.stack([pts[:, 0], np.zeros(len(pts)), pts[:, 1]], 1))
    walls = []
    for k, (p0, e, n, L) in enumerate(room.walls()):
        a = placement.to_world(np.array([[p0[0], 0, p0[1]]]))[0]
        b = placement.to_world(np.array([[p0[0] + e[0] * L, 0, p0[1] + e[1] * L]]))[0]
        nw = placement.R() @ np.array([n[0], 0, n[1]])
        walls.append({"index": k, "a": [a[0], a[2]], "b": [b[0], b[2]], "length": L, "inward": [nw[0], nw[2]]})
    openings = []
    for dc in room.decals:
        if dc.kind in ("door", "window"):
            openings.append({"wall": dc.wall, "kind": dc.kind, "a0": dc.a0, "a1": dc.a1, "y0": dc.y0, "y1": dc.y1})
    return {
        "name": room.name,
        "points": [[p[0], p[2]] for p in world],
        "walls": walls,
        "ceilingHeight": room.height,
        "floorY": placement.floor_y,
        "roomYawDeg": placement.yaw_deg,
        "openings": openings,
    }
