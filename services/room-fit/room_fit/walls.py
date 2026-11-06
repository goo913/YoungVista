"""Fitting square-cornered walls from the four cues, and turning them into marks.

For each of the four wall directions (classes, see geometry.py), offsets are measured outward
(`t`), so the room boundary is the outermost surface in that direction. Junction rays (floor and
ceiling lines) give candidate walls; band points and free space tell a wall from furniture standing
in front of it (the room is seen to go on above or past furniture, never past a wall). Candidates
are taken outermost first; one that mostly stands in front of an accepted wall, or that the room
is seen past, is furniture. What remains are the walls, each with the cues that support it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from .cues import BAND, CEILING_LINE, FLOOR_LINE, BandPoints, FreeSpace, Junctions
from .geometry import CLASS_AXIS, Axes, class_coords, class_normal, class_point, classify_normals

BIN = 0.01
ALONG_BIN = 0.10
SUPPORT = 0.07  # junction points within this of a wall's offset support it (m)
MAX_RANGE = 8.0


@dataclass
class Evidence:
    cls: np.ndarray
    t: np.ndarray
    a: np.ndarray
    cue: np.ndarray
    dist: np.ndarray  # from the camera, along the floor
    frame: np.ndarray
    spot: np.ndarray

    def __len__(self):
        return len(self.cls)

    def take(self, m) -> Evidence:
        return Evidence(*(getattr(self, k)[m] for k in ("cls", "t", "a", "cue", "dist", "frame", "spot")))

    @staticmethod
    def concat(items: list[Evidence]) -> Evidence:
        return Evidence(
            *(np.concatenate([getattr(e, k) for e in items]) for k in ("cls", "t", "a", "cue", "dist", "frame", "spot"))
        )


def evidence_from_points(
    axes: Axes, P: np.ndarray, n_xz: np.ndarray, cams: np.ndarray, cue: int, frame, spot
) -> Evidence:
    cls = classify_normals(axes, n_xz)
    ok = cls >= 0
    P, cls, cams = P[ok], cls[ok], cams[ok]
    t = np.zeros(len(P))
    a = np.zeros(len(P))
    for c in range(4):
        m = cls == c
        if m.any():
            t[m], a[m] = class_coords(axes, c, P[m])
    dist = np.linalg.norm(P - cams, axis=1)
    keep = dist < MAX_RANGE
    return Evidence(
        cls[keep],
        t[keep],
        a[keep],
        np.full(int(keep.sum()), cue, np.int8),
        dist[keep],
        np.asarray(frame)[ok][keep],
        np.asarray(spot)[ok][keep],
    )


def junction_evidence(axes: Axes, j: Junctions, level_y: float, cue: int) -> Evidence:
    if len(j) == 0:
        return evidence_from_points(axes, np.zeros((0, 2)), np.zeros((0, 2)), np.zeros((0, 2)), cue, [], [])
    P, ok = j.hit_level(level_y)
    return evidence_from_points(axes, P[ok], j.normal_xz[ok], j.origin[ok][:, [0, 2]], cue, j.frame[ok], j.spot[ok])


def band_evidence(axes: Axes, b: BandPoints, cams_by_frame: dict[int, np.ndarray]) -> Evidence:
    cams = np.array([cams_by_frame[int(f)] for f in b.frame]) if len(b) else np.zeros((0, 2))
    return evidence_from_points(axes, b.xz, b.normal_xz, cams, BAND, b.frame, b.spot)


@dataclass
class Wall:
    cls: int
    t: float
    support: Evidence  # junction support (floor/ceiling lines), or band support for band-only walls
    band: Evidence  # band points at this wall
    coverage: list[tuple[float, float]]  # along-intervals where the wall was seen
    kind: str  # 'boundary' or 'band'
    t_floor: float | None = None
    t_ceil: float | None = None
    t_band: float | None = None
    spread: float = 0.0
    free_beyond: float = 0.0
    confidence: float = 0.0
    length: float | None = None
    near: float | None = None  # typical distance (m) of the observations that place the wall
    mark_id: str = ""
    details: dict = field(default_factory=dict)

    @property
    def axis(self) -> int:
        return CLASS_AXIS[self.cls]

    def along_centre(self) -> float:
        a = self.support.a
        if len(a) == 0:
            return 0.0
        return float(np.median(a))

    def covered_length(self) -> float:
        return float(sum(b - a for a, b in self.coverage))


def _peaks(t: np.ndarray, w: np.ndarray, sigma: float, min_mass: float) -> list[float]:
    if len(t) == 0:
        return []
    lo, hi = t.min() - 5 * sigma, t.max() + 5 * sigma
    nb = int(math.ceil((hi - lo) / BIN)) + 1
    hist = np.bincount(np.clip(((t - lo) / BIN).astype(int), 0, nb - 1), weights=w, minlength=nb)
    r = int(math.ceil(4 * sigma / BIN))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) * BIN / sigma) ** 2)
    s = np.convolve(hist, k, mode="same")
    peaks = []
    for i in range(1, nb - 1):
        if s[i] >= s[i - 1] and s[i] > s[i + 1]:
            centre = lo + (i + 0.5) * BIN
            mass = w[np.abs(t - centre) < 2 * sigma].sum()
            if mass >= min_mass:
                peaks.append((centre, mass))
    # Merge peaks closer than 10 cm, keeping the stronger.
    peaks.sort(key=lambda p: -p[1])
    kept: list[tuple[float, float]] = []
    for c, m in peaks:
        if all(abs(c - k2) > 0.10 for k2, _ in kept):
            kept.append((c, m))
    return [c for c, _ in kept]


def _coverage(a: np.ndarray, min_count: int = 2, gap: float = 0.3) -> list[tuple[float, float]]:
    if len(a) == 0:
        return []
    lo = math.floor(a.min() / ALONG_BIN)
    idx = np.floor(a / ALONG_BIN).astype(int) - lo
    cnt = np.bincount(idx)
    bins = np.nonzero(cnt >= min_count)[0]
    if len(bins) == 0:
        return []
    out = []
    start = prev = bins[0]
    for b in bins[1:]:
        if (b - prev) * ALONG_BIN > gap:
            out.append(((start + lo) * ALONG_BIN, (prev + lo + 1) * ALONG_BIN))
            start = b
        prev = b
    out.append(((start + lo) * ALONG_BIN, (prev + lo + 1) * ALONG_BIN))
    return out


def _inside(a: np.ndarray, intervals: list[tuple[float, float]], pad: float = 0.0) -> np.ndarray:
    m = np.zeros(len(a), bool)
    for lo, hi in intervals:
        m |= (a >= lo - pad) & (a <= hi + pad)
    return m


def _interval_overlap(a: list[tuple[float, float]], b: list[tuple[float, float]]) -> float:
    """Length of a that lies inside b."""
    total = 0.0
    for lo, hi in a:
        for lo2, hi2 in b:
            total += max(0.0, min(hi, hi2) - max(lo, lo2))
    return total


def _free_beyond(
    free: FreeSpace | None, axes: Axes, cls: int, t: float, coverage, near=0.2, far=0.6, min_rays=3
) -> float:
    """Share of the wall's seen stretch where rays crossed the band just beyond it."""
    if free is None or not coverage:
        return 0.0
    samples = []
    for lo, hi in coverage:
        samples.extend(np.arange(lo + 0.05, hi, 0.05))
    if not samples:
        return 0.0
    a = np.array(samples)
    hits = np.zeros(len(a), bool)
    for dt in np.arange(near, far + 1e-9, free.cell):
        p = np.array([class_point(axes, cls, t + dt, ai) for ai in a])
        hits |= free.lookup(p) >= min_rays
    return float(hits.mean())


def fit_walls(
    axes: Axes,
    floor_ev: Evidence,
    ceil_ev: Evidence | None,
    band_ev: Evidence,
    free: FreeSpace | None,
    ceiling_weight: float = 1.0,
) -> tuple[list[Wall], dict]:
    walls: list[Wall] = []
    report = {"classes": []}
    junc = floor_ev if ceil_ev is None or len(ceil_ev) == 0 else Evidence.concat([floor_ev, ceil_ev])
    for c in range(4):
        J = junc.take(junc.cls == c)
        B = band_ev.take(band_ev.cls == c)
        wj = np.where(J.cue == CEILING_LINE, ceiling_weight, 1.0)
        n_total = len(J)
        min_mass = max(20.0, 0.03 * n_total)
        cands = []
        for t0 in _peaks(J.t, wj, 0.025, min_mass):
            sup = np.abs(J.t - t0) < SUPPORT
            if sup.sum() < min_mass:
                continue
            Js = J.take(sup)
            cands.append({"t": float(np.median(Js.t)), "J": Js, "cov": _coverage(Js.a)})
        band_cands = []
        for t0 in _peaks(B.t, np.ones(len(B)), 0.04, max(60.0, 0.02 * len(B))):
            tol = 0.10 + 0.02 * max(0.0, t0)
            sup = np.abs(B.t - t0) < tol
            Bs = B.take(sup)
            band_cands.append({"t": float(np.median(Bs.t)), "B": Bs, "cov": _coverage(Bs.a, min_count=6)})
        claimed: list[tuple[float, float]] = []
        cls_report = {"cls": c, "junctions": int(n_total), "band": int(len(B)), "candidates": []}
        for cand in sorted(cands, key=lambda k: -k["t"]):
            Js = cand["J"]
            t = cand["t"]
            rec = {"t": round(t, 3), "n": int(len(Js)), "floor": int((Js.cue == FLOOR_LINE).sum())}
            in_claimed = _inside(Js.a, claimed, pad=0.10).mean() if claimed else 0.0
            if in_claimed > 0.5:
                rec["rejected"] = "in front of a wall"
                cls_report["candidates"].append(rec)
                continue
            # Seen past: a band surface 0.2-2.6 m further out covering most of this stretch.
            dist = float(np.median(Js.dist))
            gap = max(0.20, 0.06 * dist)
            past = 0.0
            for bc in band_cands:
                if t + gap < bc["t"] < t + 2.6:
                    past = max(
                        past,
                        _interval_overlap(cand["cov"], bc["cov"]) / max(1e-6, sum(hi - lo for lo, hi in cand["cov"])),
                    )
            free_b = _free_beyond(free, axes, c, t, cand["cov"])
            rec["pastBand"] = round(past, 2)
            rec["freeBeyond"] = round(free_b, 2)
            # Furniture never meets the ceiling: a candidate whose own ceiling line is seen is a wall
            # (or something as good as one, like a wardrobe up to the ceiling), whatever noisy band
            # points or window views say about the space beyond it.
            n_ceil = int((Js.cue == CEILING_LINE).sum())
            reaches_ceiling = n_ceil >= max(100, 0.2 * len(Js))
            rec["ceilingLine"] = n_ceil
            if not reaches_ceiling and (past > 0.5 or free_b > 0.6):
                rec["rejected"] = "seen past (furniture)"
                cls_report["candidates"].append(rec)
                continue
            # Only the stretches not already claimed by a wall further out belong to this one.
            cov = cand["cov"]
            if claimed:
                keep = ~_inside(Js.a, claimed, pad=0.10)
                Js = Js.take(keep)
                cov = _coverage(Js.a)
                if len(Js) < min_mass * 0.5:
                    rec["rejected"] = "too little left"
                    cls_report["candidates"].append(rec)
                    continue
            tol = 0.10 + 0.03 * dist
            Bw = B.take((np.abs(B.t - t) < tol) & _inside(B.a, cov, pad=0.2)) if len(B) else B
            wall = Wall(cls=c, t=t, support=Js, band=Bw, coverage=cov, kind="boundary", free_beyond=free_b)
            walls.append(wall)
            claimed = claimed + cov
            rec["accepted"] = True
            cls_report["candidates"].append(rec)
        # Band-only walls where no junction wall was found.
        for bc in sorted(band_cands, key=lambda k: -k["t"]):
            cov = bc["cov"]
            if not cov:
                continue
            seen_len = sum(hi - lo for lo, hi in cov)
            if claimed and _interval_overlap(cov, claimed) > 0.3 * seen_len:
                continue
            if any(
                w.cls == c and w.t > bc["t"] + 0.15 and _interval_overlap(cov, w.coverage) > 0.3 * seen_len
                for w in walls
            ):
                continue
            free_b = _free_beyond(free, axes, c, bc["t"], cov)
            if free_b > 0.6 or seen_len < 0.4:
                continue
            wall = Wall(cls=c, t=bc["t"], support=bc["B"], band=bc["B"], coverage=cov, kind="band", free_beyond=free_b)
            walls.append(wall)
            claimed = claimed + cov
            cls_report["candidates"].append({"t": round(bc["t"], 3), "band": True, "accepted": True})
        report["classes"].append(cls_report)
    for w in walls:
        refine_wall(w, ceiling_weight)
    return walls, report


# Height of the camera above the floor line and below the ceiling line (m), for junction weights.
FLOOR_DROP = 1.4
CEILING_RISE = 1.2


def junction_weights(S: Evidence, ceiling_weight: float = 1.0) -> np.ndarray:
    """Inverse-variance weights of junction points. A ray at distance d along the floor from a
    camera h above the line errs by about (d² + h²) / h per radian of tilt, so near points count
    far more than far ones."""
    h = np.where(S.cue == CEILING_LINE, CEILING_RISE, FLOOR_DROP)
    err = (S.dist**2 + h**2) / h
    return (1.0 / np.maximum(err, 1e-3)) ** 2 * np.where(S.cue == CEILING_LINE, ceiling_weight, 1.0)


def weighted_median(x: np.ndarray, w: np.ndarray) -> float:
    order = np.argsort(x)
    cw = np.cumsum(w[order])
    return float(x[order][np.searchsorted(cw, 0.5 * cw[-1])])


def refine_wall(w: Wall, ceiling_weight: float = 1.0) -> None:
    """The wall's offset: an inverse-variance weighted median of its junction points (band points
    for band-only walls)."""
    S = w.support
    if w.kind == "boundary":
        wt = junction_weights(S, ceiling_weight)
        w.t = weighted_median(S.t, wt)
        f = S.cue == FLOOR_LINE
        cl = S.cue == CEILING_LINE
        w.t_floor = weighted_median(S.t[f], wt[f]) if f.sum() >= 15 else None
        w.t_ceil = weighted_median(S.t[cl], wt[cl]) if cl.sum() >= 15 else None
        w.near = weighted_median(S.dist, wt) if len(S) else None
    else:
        w.t = float(np.median(S.t))
        w.near = float(np.median(S.dist)) if len(S) else None
    w.t_band = float(np.median(w.band.t)) if len(w.band) >= 30 else None
    w.spread = float(1.4826 * np.median(np.abs(S.t - w.t))) if len(S) else 1.0


def wall_confidence(w: Wall, scale_spread: float = 0.0) -> float:
    """0..1: how sure the fit is about this wall's line."""
    if w.kind == "band":
        base = 0.42
    else:
        tf, tc, tb = w.t_floor, w.t_ceil, w.t_band
        if tf is not None and tc is not None:
            d = abs(tf - tc)
            base = 0.95 if d <= 0.04 else 0.88 if d <= 0.08 else 0.65 if d <= 0.15 else 0.4
        elif tc is not None:
            base = 0.85 if tb is not None and abs(tb - tc) <= 0.12 else 0.72
        elif tf is not None:
            base = 0.82 if tb is not None and abs(tb - tf) <= 0.12 else 0.55
        else:
            base = 0.5
    f_spread = float(np.clip(1.0 - (w.spread - 0.02) / 0.12, 0.5, 1.0))
    f_cov = 1.0
    if w.length:
        f_cov = float(np.clip(0.55 + 0.45 * min(1.0, w.covered_length() / (0.5 * w.length)), 0.55, 1.0))
    f_free = 1.0 - 0.4 * float(np.clip((w.free_beyond - 0.15) / 0.45, 0.0, 1.0))
    f_scale = 1.0 if w.kind == "boundary" else float(np.clip(1.0 - scale_spread / 0.1, 0.6, 1.0))
    # A wall only seen from far away (its weighted junction distance) is less certain.
    f_far = 1.0 if w.near is None else float(np.clip(1.0 - (w.near - 2.5) / 5.0, 0.6, 1.0))
    return float(np.clip(base * f_spread * f_cov * f_free * f_scale * f_far, 0.05, 0.99))


def ceiling_from_rays(axes: Axes, walls: list[Wall], ceil_j: Junctions, floor_y: float) -> dict | None:
    """Ceiling height from ceiling-junction rays meeting walls found by their floor lines (the tap
    flow's `measureCeiling`, over every junction pixel)."""
    if len(ceil_j) == 0:
        return None
    cls = classify_normals(axes, ceil_j.normal_xz)
    heights = []
    for w in walls:
        if w.kind != "boundary" or w.t_floor is None or (w.support.cue == FLOOR_LINE).sum() < 30:
            continue
        if w.t_band is not None and abs(w.t_band - w.t_floor) > 0.15:
            continue  # the floor line may be furniture
        m = cls == w.cls
        if not m.any():
            continue
        n = class_normal(axes, w.cls)
        o = ceil_j.origin[m]
        d = ceil_j.direction[m]
        out = -(d[:, [0, 2]] @ n)  # outward speed
        ok = out > 1e-6
        lam = (w.t + o[ok][:, [0, 2]] @ n) / out[ok]
        P = o[ok] + lam[:, None] * d[ok]
        _, a = class_coords(axes, w.cls, P[:, [0, 2]])
        inside = _inside(a, w.coverage, pad=0.3)
        heights.append(P[inside, 1] - floor_y)
    if not heights:
        return None
    h = np.concatenate(heights)
    h = h[(h > 1.8) & (h < 6.0)]
    if len(h) < 60:
        return None
    med = float(np.median(h))
    inl = h[np.abs(h - med) < 0.08]
    med = float(np.median(inl))
    return {"height": med, "rays": int(len(inl)), "spread": round(float(1.4826 * np.median(np.abs(inl - med))), 4)}


def marks_from_walls(axes: Axes, walls: list[Wall], spot_xz: dict[int, np.ndarray]) -> list[dict]:
    """The contract's FittedMark list (one mark per wall, in the middle of what was seen)."""
    marks = []
    for k, w in enumerate(walls):
        w.mark_id = f"w{k}"
        a_mid = w.along_centre()
        if w.coverage:
            inside = [iv for iv in w.coverage if iv[0] <= a_mid <= iv[1]]
            if not inside:
                lo, hi = max(w.coverage, key=lambda iv: iv[1] - iv[0])
                a_mid = 0.5 * (lo + hi)
        p = class_point(axes, w.cls, w.t, a_mid)
        spots, counts = np.unique(w.support.spot, return_counts=True)
        sp = int(spots[np.argmax(counts)]) if len(spots) else 0
        cam = spot_xz.get(sp, p + class_normal(axes, w.cls))
        n_in = class_normal(axes, w.cls)
        if (cam - p) @ n_in < 0.2:
            cam = p + 1.0 * n_in
        marks.append(
            {
                "id": w.mark_id,
                "point": {"x": round(float(p[0]), 4), "z": round(float(p[1]), 4)},
                "camera": {"x": round(float(cam[0]), 4), "z": round(float(cam[1]), 4)},
                "axis": int(w.axis),
                "confidence": round(float(w.confidence), 3),
            }
        )
    return marks
