"""Anchoring each frame's depth scale to the AR floor (and, once it is known, the ceiling).

A floor pixel's true depth follows exactly from its camera ray and the AR floor plane, so every
frame that sees floor gets its scale from the ratio of true to predicted depth over its floor
pixels. Furniture tops also face up but sit above the floor, so their ratios are larger: the floor
is the lowest sizeable cluster of ratios. Frames that see no floor (the up ring) take their scale
from overlap with their neighbours: a joint least-squares in log scale over the anchors and the
pairwise overlap ratios, with a robust loss. An anchor that disagrees with its neighbours is
swapped for another of its clusters that agrees (a bed top taken for the floor), or dropped.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from .geometry import project
from .views import View

COS_UP = math.cos(math.radians(22))
MAX_ANCHOR_DIST = 8.0  # m along the floor
MIN_ANCHOR_PIXELS = 400
MIN_CLUSTER_PIXELS = 1000
REJECT_LOG = math.log(1.15)  # frames more than 15% from the median scale are not fused


@dataclass
class Anchor:
    log_scale: float
    sigma: float  # standard error of log_scale
    pixels: int
    spread: float  # robust spread of per-pixel log ratios
    alternatives: list[tuple[float, int]] = field(default_factory=list)  # other clusters (log, px)


def _clusters(r: np.ndarray) -> list[tuple[float, int]]:
    """Centres (log ratio) and sizes of the clusters of per-pixel log ratios, lowest first."""
    med = float(np.median(r))
    bins = np.arange(med - 1.2, med + 1.2 + 1e-9, 0.01)
    hist, edges = np.histogram(r, bins=bins)
    k = np.exp(-0.5 * (np.arange(-4, 5) / 1.5) ** 2)
    smooth = np.convolve(hist, k / k.sum(), mode="same")
    centres = 0.5 * (edges[:-1] + edges[1:])
    out = []
    for i in range(1, len(smooth) - 1):
        if smooth[i] >= smooth[i - 1] and smooth[i] > smooth[i + 1] and smooth[i] > 0:
            mass = int(np.sum(np.abs(r - centres[i]) < 0.04))
            out.append((float(centres[i]), mass))
    # Merge clusters closer than 5%.
    out.sort()
    merged: list[tuple[float, int]] = []
    for c, m in out:
        if merged and c - merged[-1][0] < 0.05:
            if m > merged[-1][1]:
                merged[-1] = (c, m)
        else:
            merged.append((c, m))
    return merged


def _refine(r: np.ndarray, centre: float) -> tuple[float, float, int]:
    inl = r[np.abs(r - centre) < 0.06]
    c = float(np.median(inl))
    inl = r[np.abs(r - c) < 0.05]
    c = float(np.median(inl)) if len(inl) else c
    spread = float(1.4826 * np.median(np.abs(inl - c))) if len(inl) else 1.0
    return c, spread, int(len(inl))


def plane_anchor(view: View, plane_y: float, up: bool = True) -> Anchor | None:
    """Scale from pixels that face the plane at `plane_y` (the floor when `up`, else the ceiling)
    and whose rays meet it. The plane is the lowest sizeable cluster of true/predicted depth
    ratios; the other clusters are kept as alternatives."""
    n_y = view.normal_w[..., 1] if up else -view.normal_w[..., 1]
    d = view.rays
    dy = d[..., 1]
    c = view.pose.c
    toward = dy < -0.05 if up else dy > 0.05
    m = view.valid & (n_y > COS_UP) & toward
    if m.sum() < MIN_ANCHOR_PIXELS:
        return None
    t_true = (plane_y - c[1]) / dy[m]
    horiz = t_true * np.linalg.norm(d[m][:, [0, 2]], axis=1)
    keep = (t_true > 0) & (horiz < MAX_ANCHOR_DIST)
    if keep.sum() < MIN_ANCHOR_PIXELS:
        return None
    r = np.log(t_true[keep] / view.depth[m][keep])
    r = r[np.isfinite(r)]
    if len(r) < MIN_ANCHOR_PIXELS:
        return None
    clusters = [(cc, mm) for cc, mm in _clusters(r) if mm >= MIN_ANCHOR_PIXELS // 2]
    if not clusters:
        return None
    min_mass = max(MIN_CLUSTER_PIXELS, int(0.04 * len(r)))
    sized = [cl for cl in clusters if cl[1] >= min_mass]
    chosen = sized[0] if sized else max(clusters, key=lambda cl: cl[1])
    centre, spread, n_in = _refine(r, chosen[0])
    if n_in < MIN_ANCHOR_PIXELS // 2:
        return None
    # Neighbouring pixels are correlated: count about one independent sample per 50 pixels.
    n_eff = max(1.0, min(n_in, 4000) / 50.0)
    sigma = max(0.006, spread / math.sqrt(n_eff))
    alts = [(_refine(r, cc)[0], mm) for cc, mm in clusters if abs(cc - chosen[0]) > 0.05]
    return Anchor(log_scale=centre, sigma=sigma, pixels=n_in, spread=spread, alternatives=alts)


@dataclass
class PairRatio:
    i: int
    j: int
    delta: float  # log s_j - log s_i
    sigma: float
    count: int


def pair_ratio(vi: View, vj: View, si: float, sj: float, stride: int = 10) -> PairRatio | None:
    """log(s_j) - log(s_i) from points of view i seen again in view j (and back)."""
    est = []
    for a, b, sa in ((vi, vj, si), (vj, vi, sj)):
        sub = (slice(stride // 2, None, stride), slice(stride // 2, None, stride))
        m = a.valid[sub]
        if m.sum() < 100:
            return None
        X = a.pose.c + (sa * a.depth[sub][m])[:, None] * a.rays[sub][m]
        na = a.normal_w[sub][m]
        u, v, z = project(b.K, b.pose, X)
        h, w = b.depth.shape
        ok = (z > 0.2) & (u > 2) & (u < w - 3) & (v > 2) & (v < h - 3)
        if ok.sum() < 100:
            return None
        ui = np.round(u[ok]).astype(int)
        vi_ = np.round(v[ok]).astype(int)
        zb = b.depth[vi_, ui]
        good = b.valid[vi_, ui] & ((b.normal_w[vi_, ui] * na[ok]).sum(-1) > 0.85)
        if good.sum() < 80:
            return None
        # s_b * z_b = z  =>  log s_b = log z - log z_b; relative to log s_a.
        r = np.log(z[ok][good] / zb[good]) - math.log(sa)
        r = r[np.isfinite(r)]
        if len(r) < 80:
            return None
        med = float(np.median(r))
        mad = float(1.4826 * np.median(np.abs(r - med)))
        est.append((med, mad, len(r)))
    (d1, m1, n1), (d2, m2, n2) = est
    delta = 0.5 * (d1 - d2)  # i->j gives s_j/s_i; j->i gives s_i/s_j
    spread = max(m1, m2)
    n_eff = max(1.0, min(n1 + n2, 3000) / 40.0)
    sigma = max(0.008, spread / math.sqrt(n_eff), abs(d1 + d2) / 2)
    return PairRatio(vi.index, vj.index, delta, sigma, n1 + n2)


def candidate_pairs(views: list[View], max_angle_deg: float = 42.0) -> list[tuple[int, int]]:
    """Pairs of views (positions in `views`) that look at overlapping parts of the room."""
    f = np.array([v.pose.forward for v in views])
    cosang = f @ f.T
    out = []
    cmin = math.cos(math.radians(max_angle_deg))
    for i in range(len(views)):
        for j in range(i + 1, len(views)):
            if cosang[i, j] >= cmin:
                out.append((i, j))
    return out


def solve_scales(
    n: int, anchors: dict[int, Anchor], pairs: list[PairRatio], pos: dict[int, int], iterations: int = 8
) -> np.ndarray:
    """Log scales (nan where a frame has no path to an anchor). `pos` maps frame index to row."""
    if not anchors:
        return np.full(n, np.nan)
    rows = []  # (i, j or -1, value, sigma)
    for idx, a in anchors.items():
        rows.append((pos[idx], -1, a.log_scale, a.sigma))
    for p in pairs:
        rows.append((pos[p.i], pos[p.j], p.delta, p.sigma))
    prior = float(np.median([a.log_scale for a in anchors.values()]))
    w_robust = np.ones(len(rows))
    x = np.full(n, prior)
    sig = np.array([r[3] for r in rows])
    for it in range(iterations):
        A = np.zeros((n, n))
        b = np.zeros(n)
        # Weak prior keeps disconnected frames solvable; they are cleared below.
        A[np.diag_indices(n)] += 1e-6
        b += 1e-6 * prior
        for k, (i, j, val, s) in enumerate(rows):
            w = w_robust[k] / s**2
            if j < 0:
                A[i, i] += w
                b[i] += w * val
            else:
                A[i, i] += w
                A[j, j] += w
                A[i, j] -= w
                A[j, i] -= w
                b[j] += w * val
                b[i] -= w * val
        x = np.linalg.solve(A, b)
        res = np.array([(x[i] - val) if j < 0 else (x[j] - x[i] - val) for (i, j, val, _s) in rows])
        # Residuals in units of their sigma, but never finer than 1.5% (model error).
        z = np.abs(res) / np.maximum(sig, 0.015)
        c = 3.0 if it < 2 else 2.0
        w_robust = 1.0 / (1.0 + (z / c) ** 2)  # Cauchy: gross outliers get almost no weight
    adj: dict[int, set[int]] = {i: set() for i in range(n)}
    for (i, j, _v, _s), w in zip(rows, w_robust):
        if j >= 0 and w > 0.1:
            adj[i].add(j)
            adj[j].add(i)
    anchored = {pos[k] for k in anchors}
    seen = set(anchored)
    stack = list(anchored)
    while stack:
        i = stack.pop()
        for j in adj[i]:
            if j not in seen:
                seen.add(j)
                stack.append(j)
    out = np.full(n, np.nan)
    for i in seen:
        out[i] = x[i]
    return out


def _collect_anchors(views: list[View], floor_y: float, ceiling_y: float | None) -> dict[int, Anchor]:
    anchors: dict[int, Anchor] = {}
    for v in views:
        a = plane_anchor(v, floor_y, up=True)
        if a is not None:
            anchors[v.index] = a
    if ceiling_y is not None:
        for v in views:
            a = plane_anchor(v, ceiling_y, up=False)
            if a is None:
                continue
            # The ceiling height carries its own error: weaker than a floor anchor.
            a.sigma = max(a.sigma, 0.012)
            prev = anchors.get(v.index)
            if prev is None or abs(prev.log_scale - a.log_scale) > 0.08:
                if prev is None:
                    anchors[v.index] = a
                continue
            w1, w2 = 1 / prev.sigma**2, 1 / a.sigma**2
            prev.log_scale = (prev.log_scale * w1 + a.log_scale * w2) / (w1 + w2)
            prev.sigma = 1 / math.sqrt(w1 + w2)
    return anchors


def anchor_scales(views: list[View], floor_y: float, ceiling_y: float | None = None) -> dict:
    """Sets `view.scale` for every view it can and returns what it measured."""
    pos = {v.index: k for k, v in enumerate(views)}
    anchors = _collect_anchors(views, floor_y, ceiling_y)
    if not anchors:
        return {"anchored": 0, "pairs": 0, "scaled": 0}
    # Start from the consensus of the anchors (the median is robust to the few that are wrong).
    init = float(np.median([a.log_scale for a in anchors.values()]))
    x = np.array([anchors[v.index].log_scale if v.index in anchors else init for v in views])
    pairs_idx = candidate_pairs(views)
    swapped = dropped_anchors = 0
    pairs: list[PairRatio] = []
    solved = x
    for _round in range(3):
        pairs = []
        for i, j in pairs_idx:
            pr = pair_ratio(views[i], views[j], float(np.exp(x[i])), float(np.exp(x[j])))
            if pr is not None:
                pairs.append(pr)
        solved = solve_scales(len(views), anchors, pairs, pos)
        x = np.where(np.isfinite(solved), solved, x)
        # Anchors that disagree with the solution: take another cluster that agrees, or drop it.
        changed = False
        for idx, a in list(anchors.items()):
            xi = solved[pos[idx]]
            if not np.isfinite(xi) or abs(a.log_scale - xi) <= 0.06:
                continue
            alt = [al for al in a.alternatives if abs(al[0] - xi) <= 0.04]
            if alt:
                a.alternatives = [(a.log_scale, a.pixels)] + [al for al in a.alternatives if al not in alt]
                a.log_scale = alt[0][0]
                swapped += 1
            else:
                del anchors[idx]
                dropped_anchors += 1
            changed = True
        if not changed and _round > 0:
            break
        if not anchors:
            break
    for v in views:
        a = anchors.get(v.index)
        if a is not None:
            v.info["anchor"] = round(math.exp(a.log_scale), 4)
    med = float(np.nanmedian(solved)) if np.isfinite(solved).any() else float("nan")
    dropped = 0
    for k, v in enumerate(views):
        s = solved[k]
        v.scale_hint = float(math.exp(s if np.isfinite(s) else med)) if np.isfinite(med) else float("nan")
        if not np.isfinite(s) or abs(s - med) > REJECT_LOG:
            v.scale = float("nan")
            if np.isfinite(s):
                dropped += 1
                v.info["droppedScale"] = round(math.exp(s), 4)
        else:
            v.scale = float(math.exp(s))
    return {
        "anchored": len(anchors),
        "swapped": swapped,
        "droppedAnchors": dropped_anchors,
        "pairs": len(pairs),
        "scaled": int(sum(np.isfinite(v.scale) for v in views)),
        "dropped": dropped,
        "median": round(math.exp(med), 4) if np.isfinite(med) else None,
        "spread": round(float(np.nanstd(solved)), 4) if np.isfinite(solved).any() else None,
    }
