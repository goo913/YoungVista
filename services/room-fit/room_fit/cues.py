"""The four wall cues, on the floor plan.

(a) Floor-line rays: pixels where the floor meets a vertical surface. The ray through the junction
    meets the AR floor plane on the wall's line, exactly as a tap mark does, so these do not
    depend on the depth scale at all.
(b) Ceiling-line rays: the same at the ceiling, cast onto the fitted ceiling plane, for walls whose
    floor line is hidden by furniture.
(c) Band points: wall-facing points between 1.3 m and 10 cm below the ceiling, above most furniture.
(d) Free space: floor-plan cells crossed by camera-to-point rays are empty, so no wall stands there.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .views import View

SIN_VERTICAL = math.sin(math.radians(20))  # |n.y| below this: a vertical surface
COS_LEVEL = math.cos(math.radians(25))  # n.y above this: a floor (or below minus: a ceiling)
BAND_LOW = 1.3

# Neighbour offsets (dy, dx), nearest first, for junction pairs.
_OFFSETS = sorted(
    [(dy, dx) for dy in range(-3, 4) for dx in range(-3, 4) if (dy, dx) != (0, 0) and dy * dy + dx * dx <= 10],
    key=lambda o: o[0] ** 2 + o[1] ** 2,
)

FLOOR_LINE, CEILING_LINE, BAND = 0, 1, 2


@dataclass
class Junctions:
    """Rays through floor or ceiling junction pixels, with the wall's facing normal."""

    origin: np.ndarray  # (M, 3)
    direction: np.ndarray  # (M, 3), camera z = 1
    normal_xz: np.ndarray  # (M, 2) horizontal normal of the wall pixel (facing the camera)
    wall_point: np.ndarray  # (M, 3) the wall pixel's scaled 3D point (for checks)
    frame: np.ndarray  # (M,) frame index
    spot: np.ndarray  # (M,)

    @staticmethod
    def empty() -> Junctions:
        z3 = np.zeros((0, 3))
        return Junctions(z3, z3, np.zeros((0, 2)), z3, np.zeros(0, int), np.zeros(0, int))

    def __len__(self):
        return len(self.frame)

    @staticmethod
    def concat(items: list[Junctions]) -> Junctions:
        items = [j for j in items if len(j)]
        if not items:
            return Junctions.empty()
        return Junctions(
            np.concatenate([j.origin for j in items]),
            np.concatenate([j.direction for j in items]),
            np.concatenate([j.normal_xz for j in items]),
            np.concatenate([j.wall_point for j in items]),
            np.concatenate([j.frame for j in items]),
            np.concatenate([j.spot for j in items]),
        )

    def hit_level(self, y: float) -> tuple[np.ndarray, np.ndarray]:
        """Where each ray meets the level plane at height y: floor-plan points and a validity mask."""
        dy = self.direction[:, 1]
        with np.errstate(divide="ignore", invalid="ignore"):
            t = (y - self.origin[:, 1]) / dy
        ok = np.isfinite(t) & (t > 0)
        p = self.origin + t[:, None] * self.direction
        return p[:, [0, 2]], ok


def _shift(a: np.ndarray, dy: int, dx: int, fill):
    """b[y, x] = a[y + dy, x + dx] (fill outside)."""
    h, w = a.shape[:2]
    b = np.full_like(a, fill)
    ys = slice(max(0, -dy), min(h, h - dy))
    xs = slice(max(0, -dx), min(w, w - dx))
    ys2 = slice(max(0, dy), min(h, h + dy))
    xs2 = slice(max(0, dx), min(w, w + dx))
    b[ys, xs] = a[ys2, xs2]
    return b


def junctions(view: View, floor_y: float, ceiling_y: float | None, which: str) -> Junctions:
    """Floor ('floor') or ceiling ('ceiling') junction rays of one view. The rays do not depend on
    the depth scale; it only tells floor and ceiling pixels apart and checks that a junction's two
    pixels touch, so a view's best-guess scale is enough."""
    trusted = math.isfinite(view.scale)
    scale = view.scale if trusted else view.scale_hint
    if not math.isfinite(scale):
        return Junctions.empty()
    X = view.points(scale)
    ny = view.normal_w[..., 1]
    z = view.depth * scale
    vert = view.valid & (np.abs(ny) < SIN_VERTICAL)
    if which == "floor":
        # A guessed scale can be off by a fifth: then only keep what is clearly near the floor.
        tol = np.maximum(0.06, 0.03 * z) if trusted else np.maximum(0.2, 0.15 * z)
        level = view.valid & (ny > COS_LEVEL) & (np.abs(X[..., 1] - floor_y) < tol) & (view.rays[..., 1] < 0)
        near_y = floor_y
        reach = 0.25 if trusted else 0.45
    else:
        if ceiling_y is None or not trusted:
            level = view.valid & (ny < -COS_LEVEL) & (X[..., 1] > floor_y + 1.7) & (view.rays[..., 1] > 0)
            near_y = None
        else:
            tol = np.maximum(0.10, 0.04 * z)
            level = view.valid & (ny < -COS_LEVEL) & (np.abs(X[..., 1] - ceiling_y) < tol) & (view.rays[..., 1] > 0)
            near_y = ceiling_y
        reach = 0.35
    found = np.zeros(level.shape, bool)
    out_dir = []
    out_n = []
    out_q = []
    c = view.pose.c
    for dy, dx in _OFFSETS:
        cand = level & ~found & _shift(vert, dy, dx, False)
        if not cand.any():
            continue
        ys, xs = np.nonzero(cand)
        qy, qx = ys + dy, xs + dx
        Q = X[qy, qx]
        if near_y is not None:
            close = np.abs(Q[:, 1] - near_y) < reach
        else:
            close = Q[:, 1] > floor_y + 1.7
        d_mid = 0.5 * (view.rays[ys, xs] + view.rays[qy, qx])
        # Where the junction ray meets the level of the floor/ceiling pixel, compared with the wall
        # pixel's own 3D point: the two must touch (an occluding edge does not).
        P_level = X[ys, xs]
        horiz = np.linalg.norm((P_level - Q)[:, [0, 2]], axis=1)
        close &= horiz < 0.12 + 0.05 * z[ys, xs]
        if not close.any():
            continue
        ys, xs, qy, qx, d_mid, Q = ys[close], xs[close], qy[close], qx[close], d_mid[close], Q[close]
        found[ys, xs] = True
        out_dir.append(d_mid)
        n = view.normal_w[qy, qx][:, [0, 2]]
        out_n.append(n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9))
        out_q.append(Q)
    if not out_dir:
        return Junctions.empty()
    D = np.concatenate(out_dir).astype(np.float64)
    M = len(D)
    return Junctions(
        origin=np.repeat(c[None, :], M, axis=0),
        direction=D,
        normal_xz=np.concatenate(out_n).astype(np.float64),
        wall_point=np.concatenate(out_q).astype(np.float64),
        frame=np.full(M, view.index),
        spot=np.full(M, view.frame.spot),
    )


@dataclass
class BandPoints:
    xz: np.ndarray  # (M, 2)
    normal_xz: np.ndarray  # (M, 2)
    height: np.ndarray  # (M,) above the floor
    frame: np.ndarray
    spot: np.ndarray

    def __len__(self):
        return len(self.frame)


def band_points(
    views: list[View], floor_y: float, ceiling_h: float | None, stride: int = 2, max_dist: float = 7.0
) -> BandPoints:
    top = (ceiling_h if ceiling_h else 2.35) - 0.10
    xs, ns, hs, fs, ss = [], [], [], [], []
    for v in views:
        if not math.isfinite(v.scale):
            continue
        sub = (slice(0, None, stride), slice(0, None, stride))
        X = v.pose.c + (v.scale * v.depth[sub])[..., None] * v.rays[sub]
        n = v.normal_w[sub]
        h = X[..., 1] - floor_y
        dist = np.linalg.norm((X - v.pose.c)[..., [0, 2]], axis=-1)
        m = v.valid[sub] & (np.abs(n[..., 1]) < SIN_VERTICAL) & (h > BAND_LOW) & (h < top) & (dist < max_dist)
        if not m.any():
            continue
        nn = n[m][:, [0, 2]]
        xs.append(X[m][:, [0, 2]])
        ns.append(nn / np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9))
        hs.append(h[m])
        fs.append(np.full(int(m.sum()), v.index))
        ss.append(np.full(int(m.sum()), v.frame.spot))
    if not xs:
        z = np.zeros((0, 2))
        return BandPoints(z, z, np.zeros(0), np.zeros(0, int), np.zeros(0, int))
    return BandPoints(
        np.concatenate(xs).astype(np.float64),
        np.concatenate(ns).astype(np.float64),
        np.concatenate(hs),
        np.concatenate(fs),
        np.concatenate(ss),
    )


@dataclass
class FreeSpace:
    origin: np.ndarray  # (2,) floor-plan coordinates of cell (0, 0)'s corner
    cell: float
    counts: np.ndarray  # (ny, nx) rays that crossed each cell (index [iz, ix])

    def lookup(self, p: np.ndarray) -> np.ndarray:
        ix = np.floor((p[..., 0] - self.origin[0]) / self.cell).astype(int)
        iz = np.floor((p[..., 1] - self.origin[1]) / self.cell).astype(int)
        ok = (ix >= 0) & (iz >= 0) & (ix < self.counts.shape[1]) & (iz < self.counts.shape[0])
        out = np.zeros(p.shape[:-1], np.int32)
        out[ok] = self.counts[iz[ok], ix[ok]]
        return out


def free_space(
    views: list[View],
    cell: float = 0.05,
    stride: int = 6,
    max_dist: float = 7.0,
    stop_short: float = 0.15,
    min_height: float = 0.05,
) -> FreeSpace:
    """Counts of camera-to-point rays (seen from above) crossing each cell, stopped short of the point."""
    segs_a, segs_b = [], []
    for v in views:
        if not math.isfinite(v.scale):
            continue
        sub = (slice(stride // 2, None, stride), slice(stride // 2, None, stride))
        X = v.pose.c + (v.scale * v.depth[sub])[..., None] * v.rays[sub]
        m = v.valid[sub] & np.isfinite(X[..., 0])
        P = X[m][:, [0, 2]]
        c = v.pose.c[[0, 2]]
        d = np.linalg.norm(P - c, axis=1)
        keep = (d > stop_short + 0.05) & (d < max_dist)
        P = P[keep]
        d = d[keep]
        end = c + (P - c) * ((d - stop_short) / d)[:, None]
        segs_a.append(np.repeat(c[None, :], len(end), axis=0))
        segs_b.append(end)
    if not segs_a:
        return FreeSpace(np.zeros(2), cell, np.zeros((1, 1), np.int32))
    A = np.concatenate(segs_a)
    B = np.concatenate(segs_b)
    lo = np.minimum(A.min(0), B.min(0)) - 0.5
    hi = np.maximum(A.max(0), B.max(0)) + 0.5
    nx = int(math.ceil((hi[0] - lo[0]) / cell))
    nz = int(math.ceil((hi[1] - lo[1]) / cell))
    counts = np.zeros(nx * nz, np.int64)
    L = np.linalg.norm(B - A, axis=1)
    step = cell * 0.8
    n_steps = np.maximum(1, np.ceil(L / step).astype(int))
    # Sample every segment at about 0.8 cells and count each (segment, cell) once.
    max_n = int(n_steps.max())
    for chunk in range(0, len(A), 20000):
        a = A[chunk : chunk + 20000]
        b = B[chunk : chunk + 20000]
        ns = n_steps[chunk : chunk + 20000]
        tt = np.linspace(0, 1, max_n + 1)[None, :]
        pts = a[:, None, :] + (b - a)[:, None, :] * np.minimum(tt * (max_n / ns[:, None]), 1.0)[..., None]
        ix = np.floor((pts[..., 0] - lo[0]) / cell).astype(np.int64)
        iz = np.floor((pts[..., 1] - lo[1]) / cell).astype(np.int64)
        flat = iz * nx + ix
        seg = np.repeat(np.arange(len(a))[:, None], flat.shape[1], axis=1)
        key = np.unique(seg.ravel() * (nx * nz) + flat.ravel())
        counts += np.bincount(key % (nx * nz), minlength=nx * nz)
    return FreeSpace(lo, cell, counts.reshape(nz, nx).astype(np.int32))
