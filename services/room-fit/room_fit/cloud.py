"""Fusing the scaled frames into one point cloud in the AR world; the ceiling plane (RANSAC) and
the room's yaw (the peak of horizontal wall-normal directions, modulo 90°)."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .views import View


@dataclass
class Cloud:
    points: np.ndarray  # (N, 3) float32
    normals: np.ndarray  # (N, 3) float32
    colors: np.ndarray  # (N, 3) uint8
    counts: np.ndarray  # (N,) int32: frame samples merged into the voxel


def fuse(views: list[View], voxel: float = 0.03, stride: int = 3, max_depth: float = 8.0) -> Cloud:
    pts, nrm, col = [], [], []
    for v in views:
        if not math.isfinite(v.scale):
            continue
        sub = (slice(1, None, stride), slice(1, None, stride))
        m = v.valid[sub] & (v.depth[sub] * v.scale < max_depth)
        if not m.any():
            continue
        z = v.depth[sub][m] * v.scale
        pts.append(v.pose.c + z[:, None] * v.rays[sub][m])
        nrm.append(v.normal_w[sub][m])
        col.append(v.image[sub][m])
    if not pts:
        e = np.zeros((0, 3), np.float32)
        return Cloud(e, e, np.zeros((0, 3), np.uint8), np.zeros(0, np.int32))
    P = np.concatenate(pts).astype(np.float64)
    Nn = np.concatenate(nrm).astype(np.float64)
    C = np.concatenate(col).astype(np.float64)
    keys = np.floor(P / voxel).astype(np.int64)
    keys -= keys.min(axis=0)
    dims = keys.max(axis=0) + 1
    flat = (keys[:, 0] * dims[1] + keys[:, 1]) * dims[2] + keys[:, 2]
    uniq, inv, counts = np.unique(flat, return_inverse=True, return_counts=True)
    k = len(uniq)

    def avg(a):
        out = np.zeros((k, a.shape[1]))
        for c in range(a.shape[1]):
            out[:, c] = np.bincount(inv, weights=a[:, c], minlength=k)
        return out / counts[:, None]

    Pm = avg(P)
    Nm = avg(Nn)
    Nm /= np.maximum(np.linalg.norm(Nm, axis=1, keepdims=True), 1e-9)
    Cm = avg(C)
    return Cloud(
        Pm.astype(np.float32), Nm.astype(np.float32), np.clip(Cm, 0, 255).astype(np.uint8), counts.astype(np.int32)
    )


def fit_ceiling_ransac(
    cloud: Cloud,
    floor_y: float,
    min_height: float = 1.9,
    iterations: int = 400,
    threshold: float = 0.025,
    seed: int = 0,
) -> dict | None:
    """The dominant downward-facing plane above `min_height`: its height above the floor."""
    m = (cloud.normals[:, 1] < -math.cos(math.radians(25))) & (cloud.points[:, 1] > floor_y + min_height)
    P = cloud.points[m].astype(np.float64)
    w = cloud.counts[m].astype(np.float64)
    if len(P) < 200:
        return None
    rng = np.random.default_rng(seed)
    best = None
    best_score = 0.0
    for _ in range(iterations):
        s = P[rng.choice(len(P), 3, replace=False)]
        n = np.cross(s[1] - s[0], s[2] - s[0])
        nn = np.linalg.norm(n)
        if nn < 1e-9:
            continue
        n /= nn
        if abs(n[1]) < math.cos(math.radians(6)):
            continue  # ceilings are level
        dist = np.abs((P - s[0]) @ n)
        inl = dist < threshold
        score = w[inl].sum()
        if score > best_score:
            best_score = score
            best = inl
    if best is None or best.sum() < 100:
        return None
    # Refine: level plane through the weighted median height of the inliers (gravity is known).
    h = float(np.median(P[best, 1]))
    inl = np.abs(P[:, 1] - h) < threshold
    h = float(np.average(P[inl, 1], weights=w[inl]))
    return {"height": h - floor_y, "inliers": int(inl.sum()), "share": round(float(w[inl].sum() / w.sum()), 3)}


def estimate_yaw(cloud: Cloud) -> tuple[float, float]:
    """The room's axes angle (radians, in (-pi/4, pi/4]) from vertical surfaces' normals, and how
    peaked the evidence is (0..1)."""
    n = cloud.normals
    m = np.abs(n[:, 1]) < 0.3
    if m.sum() < 50:
        return 0.0, 0.0
    phi = np.arctan2(n[m, 2], n[m, 0])  # angle from +X toward +Z
    w = cloud.counts[m] * (1 - np.abs(n[m, 1]))
    q = np.mod(phi, math.pi / 2)  # modulo 90°
    bins = 180
    hist, _ = np.histogram(q, bins=bins, range=(0, math.pi / 2), weights=w)
    k = np.exp(-0.5 * (np.arange(-6, 7) / 2.0) ** 2)
    padded = np.concatenate([hist[-6:], hist, hist[:6]])
    smooth = np.convolve(padded, k / k.sum(), mode="same")[6:-6]
    peak = (np.argmax(smooth) + 0.5) * (math.pi / 2) / bins
    # Refine with the circular mean of 4*phi near the peak.
    d = np.mod(q - peak + math.pi / 4, math.pi / 2) - math.pi / 4
    near = np.abs(d) < math.radians(8)
    if near.sum() > 10:
        c = np.average(np.cos(4 * phi[near]), weights=w[near])
        s = np.average(np.sin(4 * phi[near]), weights=w[near])
        angle = math.atan2(s, c) / 4
    else:
        angle = peak
    strength = float(smooth.max() / max(smooth.sum(), 1e-9) * bins / 10)
    angle = (angle + math.pi / 4) % (math.pi / 2) - math.pi / 4
    if angle <= -math.pi / 4 + 1e-12:
        angle += math.pi / 2
    return float(angle), min(1.0, strength)
