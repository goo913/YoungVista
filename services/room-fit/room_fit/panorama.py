"""One 360° equirectangular panorama per standing spot, stitched through the fitted room.

Off-the-shelf stitchers assume the camera turns about its own centre; a person turning holds the
phone an arm's length out, so near things would not line up. Instead every panorama pixel's ray is
cast from the spot's centre onto the fitted room (walls, floor, ceiling), and that 3D point is
sampled from the keyframes whose own rays to it are most nearly parallel, with per-frame gain
compensation and feathered seams. What no keyframe saw (the floor patch underfoot, the ceiling cap)
is filled smoothly from the colours around it.

Layout (2:1): row 0 is straight up; the centre column (u = 0.5) looks along heading `yawDeg`
(atan2(x, z)); headings turn clockwise seen from above as u grows, so the image is not mirrored
when viewed from inside a sphere.
"""

from __future__ import annotations

import math

import cv2
import numpy as np

from .capture import panorama_file

try:
    import torch
except ImportError:  # pragma: no cover - torch is always present in the job
    torch = None


def _device():
    if torch is None:
        return None
    if torch.cuda.is_available():
        return torch.device("cuda")
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def pano_directions(width: int, height: int, yaw_deg: float) -> np.ndarray:
    """Unit world directions (height, width, 3) of an equirectangular image's pixel centres."""
    i = (np.arange(width) + 0.5) / width
    j = (np.arange(height) + 0.5) / height
    lam = math.radians(yaw_deg) - 2 * math.pi * (i - 0.5)
    phi = math.pi / 2 - math.pi * j
    cl, sl = np.cos(lam), np.sin(lam)
    cp, sp = np.cos(phi), np.sin(phi)
    d = np.empty((height, width, 3), np.float32)
    d[..., 0] = sl[None, :] * cp[:, None]
    d[..., 1] = sp[:, None]
    d[..., 2] = cl[None, :] * cp[:, None]
    return d


def wall_distances(centre_xz: np.ndarray, headings: np.ndarray, polygon: np.ndarray) -> np.ndarray:
    """Distance along the floor from the centre to the first wall, per heading (radians)."""
    h = np.stack([np.sin(headings), np.cos(headings)], -1)  # (W, 2) in (x, z)
    best = np.full(len(headings), np.inf)
    n = len(polygon)
    for k in range(n):
        a = polygon[k] - centre_xz
        b = polygon[(k + 1) % n] - centre_xz
        e = b - a
        # Solve s*h = a + t*e  ->  [h, -e] [s, t]^T = a
        den = h[:, 0] * (-e[1]) - h[:, 1] * (-e[0])
        with np.errstate(divide="ignore", invalid="ignore"):
            s = (a[0] * (-e[1]) - a[1] * (-e[0])) / den
            t = (h[:, 0] * a[1] - h[:, 1] * a[0]) / den
        ok = (np.abs(den) > 1e-9) & (s > 1e-3) & (t >= -1e-6) & (t <= 1 + 1e-6)
        best = np.where(ok & (s < best), s, best)
    return best


def room_polygon(out) -> np.ndarray | None:
    room = out.room
    if room and room.get("ok"):
        return np.asarray(room["points"], np.float64)
    # Without a closed outline: a box from the outermost walls in each direction.
    axes = out.extras.get("axes")
    if not out.walls or axes is None:
        return None
    t = {c: max((w.t for w in out.walls if w.cls == c), default=None) for c in range(4)}
    if any(v is None for v in t.values()):
        return None
    a0, a1 = -t[0], t[1]  # along u (see geometry.class_coords)
    b0, b1 = -t[2], t[3]  # along v
    corners = [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]
    return np.array([axes.from_frame(a, b) for a, b in corners])


def _gains(samples: list[tuple[np.ndarray, np.ndarray]], sigma_n=10.0 / 255, sigma_g=0.1) -> np.ndarray:
    """Per-frame gains that make overlapping frames agree (OpenCV's GainCompensator objective)."""
    n = len(samples)
    A = np.zeros((n, n))
    b = np.zeros(n)
    for i in range(n):
        Ii, Mi = samples[i]
        for j in range(i + 1, n):
            Ij, Mj = samples[j]
            m = Mi & Mj
            N = int(m.sum())
            if N < 40:
                continue
            a_ij = float(Ii[m].mean())
            a_ji = float(Ij[m].mean())
            # N * [(g_i a_ij - g_j a_ji)^2 / sn^2]
            A[i, i] += N * a_ij * a_ij / sigma_n**2
            A[j, j] += N * a_ji * a_ji / sigma_n**2
            A[i, j] -= N * a_ij * a_ji / sigma_n**2
            A[j, i] -= N * a_ij * a_ji / sigma_n**2
    total = max(1.0, float(np.trace(A)))
    reg = total / max(1, n) * 1e-3 + 1.0 / sigma_g**2
    A[np.diag_indices(n)] += reg
    b += reg
    try:
        g = np.linalg.solve(A, b)
    except np.linalg.LinAlgError:
        g = np.ones(n)
    return np.clip(g, 0.6, 1.6)


def _fill_holes(img: np.ndarray, weight: np.ndarray) -> np.ndarray:
    """Push-pull: fills pixels with no weight from blurred, coarser versions of the image."""
    acc = img * weight[..., None]
    w = weight.copy()
    pyr = [(acc, w)]
    while min(w.shape) > 4 and (w <= 1e-6).any():
        acc = cv2.pyrDown(acc)
        w = cv2.pyrDown(w)
        pyr.append((acc, w))
    filled = pyr[-1][0] / np.maximum(pyr[-1][1], 1e-6)[..., None]
    for acc_l, w_l in reversed(pyr[:-1]):
        up = cv2.resize(filled, (w_l.shape[1], w_l.shape[0]), interpolation=cv2.INTER_LINEAR)
        mine = acc_l / np.maximum(w_l, 1e-6)[..., None]
        alpha = np.clip(w_l / (w_l.max() * 0.05 + 1e-9), 0, 1)[..., None]
        filled = alpha * mine + (1 - alpha) * up
    return filled


def stitch(
    views_full: list[tuple[np.ndarray, object, object]],
    centre: np.ndarray,
    yaw_deg: float,
    polygon: np.ndarray | None,
    floor_y: float,
    ceiling_y: float,
    width: int = 4096,
    sigma_deg: float = 3.0,
) -> tuple[np.ndarray, dict]:
    """`views_full`: (RGB uint8 image, Intrinsics, Pose) per keyframe of the spot. Returns the
    panorama (uint8 RGB, width x width/2) and coverage figures."""
    height = width // 2
    dev = _device()
    use_t = dev is not None

    def geometry(w, h):
        d = pano_directions(w, h, yaw_deg)
        lam = math.radians(yaw_deg) - 2 * math.pi * ((np.arange(w) + 0.5) / w - 0.5)
        if polygon is not None and len(polygon) >= 3:
            r = wall_distances(centre[[0, 2]], lam, polygon)
        else:
            r = np.full(w, 3.0)
        r = np.where(np.isfinite(r), r, 8.0)
        cosphi = np.sqrt(np.maximum(1e-9, d[..., 0] ** 2 + d[..., 2] ** 2))
        tau = r[None, :] / cosphi
        with np.errstate(divide="ignore", invalid="ignore"):
            t_floor = np.where(d[..., 1] < -1e-6, (floor_y - centre[1]) / d[..., 1], np.inf)
            t_ceil = np.where(d[..., 1] > 1e-6, (ceiling_y - centre[1]) / d[..., 1], np.inf)
        tau = np.minimum(tau, np.minimum(t_floor, t_ceil))
        X = centre[None, None, :] + tau[..., None] * d
        return d, X.astype(np.float32)

    def sample_frame(img_t, K, pose, d, X, gain=1.0):
        """Weighted colour of frame samples for directions d (N, 3) hitting X (N, 3)."""
        R = pose.R.astype(np.float32)
        c = pose.c.astype(np.float32)
        if use_t:
            Rt = torch.from_numpy(R).to(dev)
            ct = torch.from_numpy(c).to(dev)
            xc = (X - ct) @ Rt
            z = xc[:, 2]
            u = K.fx * xc[:, 0] / z + K.cx
            v = K.fy * xc[:, 1] / z + K.cy
            Wf, Hf = K.width, K.height
            ok = (z > 0.05) & (u > -0.5) & (u < Wf - 0.5) & (v > -0.5) & (v < Hf - 0.5)
            edge = torch.minimum(torch.minimum(u + 0.5, Wf - 0.5 - u), torch.minimum(v + 0.5, Hf - 0.5 - v))
            feather = torch.clamp(edge / (0.12 * Wf), 0, 1) ** 1.5
            ray = X - ct
            ray = ray / torch.linalg.norm(ray, dim=1, keepdim=True).clamp_min(1e-6)
            cosang = (ray * d).sum(1).clamp(-1, 1)
            ang = torch.arccos(cosang)
            w = feather * (torch.exp(-((ang / math.radians(sigma_deg)) ** 2)) + 1e-4)
            w = torch.where(ok, w, torch.zeros_like(w))
            grid = torch.stack([(u + 0.5) / Wf * 2 - 1, (v + 0.5) / Hf * 2 - 1], -1)[None, None]
            col = torch.nn.functional.grid_sample(
                img_t, grid.float(), mode="bilinear", padding_mode="border", align_corners=False
            )
            col = col[0, :, 0, :].T * gain
            return col, w
        raise RuntimeError("torch is required for stitching")

    # Gains from a small panorama.
    gw = 512
    d_s, X_s = geometry(gw, gw // 2)
    d_s_t = torch.from_numpy(d_s.reshape(-1, 3)).to(dev)
    X_s_t = torch.from_numpy(X_s.reshape(-1, 3)).to(dev)
    imgs_t = []
    samples = []
    for img, K, pose in views_full:
        t_img = torch.from_numpy(img).to(dev).permute(2, 0, 1)[None].float() / 255.0
        imgs_t.append(t_img)
        col, w = sample_frame(t_img, K, pose, d_s_t, X_s_t)
        gray = col.mean(1).cpu().numpy()
        mask = (w > 0.05).cpu().numpy()
        samples.append((gray, mask))
    gains = _gains(samples)

    d, X = geometry(width, height)
    acc = torch.zeros((height * width, 3), device=dev)
    wsum = torch.zeros(height * width, device=dev)
    d_t = torch.from_numpy(d.reshape(-1, 3)).to(dev)
    X_t = torch.from_numpy(X.reshape(-1, 3)).to(dev)
    for (_img, K, pose), t_img, g in zip(views_full, imgs_t, gains):
        fwd = torch.from_numpy(pose.forward.astype(np.float32)).to(dev)
        half_diag = math.atan(math.hypot(K.width / (2 * K.fx), K.height / (2 * K.fy)))
        near = (d_t @ fwd) > math.cos(min(math.pi / 2, half_diag + math.radians(12)))
        idx = torch.nonzero(near).squeeze(1)
        if idx.numel() == 0:
            continue
        col, w = sample_frame(t_img, K, pose, d_t[idx], X_t[idx], float(g))
        acc.index_add_(0, idx, col * w[:, None])
        wsum.index_add_(0, idx, w)
    covered = (wsum > 1e-7).float()
    out = (acc / wsum.clamp_min(1e-6)[:, None]).clamp(0, 1)
    out = out.reshape(height, width, 3).cpu().numpy()
    wmap = covered.reshape(height, width).cpu().numpy()
    del acc, wsum, d_t, X_t, imgs_t
    # Soften the hole edges, then fill.
    wsoft = cv2.GaussianBlur(wmap, (0, 0), 2.0) * wmap
    if (wmap < 1).any():
        filled = _fill_holes(out.astype(np.float32), wsoft.astype(np.float32))
        out = np.where(wmap[..., None] > 0, out, filled)
    pano = np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)
    rows = wmap.mean(axis=1)
    covered_rows = np.nonzero(rows > 0.5)[0]
    info = {
        "covered": round(float(wmap.mean()), 3),
        "pitchRangeDeg": [
            round(90 - 180 * (covered_rows.max() + 1) / height, 1),
            round(90 - 180 * covered_rows.min() / height, 1),
        ]
        if len(covered_rows)
        else None,
        "gains": [round(float(x), 3) for x in gains],
    }
    return pano, info


# Keyframes wider than this are shrunk before stitching (a 4K frame adds nothing at 4096×2048).
MAX_STITCH_INPUT_WIDTH = 1920
# Panoramas stay under the client upload rule's 10 MB (the share flow updates their metadata).
MAX_PANO_BYTES = 9_500_000


def _stitch_input(img: np.ndarray, K, pose):
    if img.shape[1] <= MAX_STITCH_INPUT_WIDTH:
        return img, K, pose
    w = MAX_STITCH_INPUT_WIDTH
    h = int(round(img.shape[0] * w / img.shape[1]))
    return cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA), K.scaled(w, h), pose


def encode_jpeg(pano: np.ndarray, quality: int = 88, max_bytes: int = MAX_PANO_BYTES) -> tuple[bytes, int]:
    """JPEG bytes at the highest quality (from `quality` down) that fits `max_bytes`."""
    bgr = cv2.cvtColor(pano, cv2.COLOR_RGB2BGR)
    while True:
        ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
        if not ok:
            raise RuntimeError("could not encode the panorama")
        if len(buf) <= max_bytes or quality <= 40:
            return buf.tobytes(), quality
        quality -= 8


def stitch_spots(out, store, width: int = 4096, log=print) -> list[dict]:
    """Stitches and uploads one panorama per spot; returns the contract's TourSpot list."""
    polygon = room_polygon(out)
    floor_y = float(out.result["floorY"])
    ch = out.result.get("ceilingHeight") or 2.5
    images = out.extras["images_full"]
    spots = []
    info = []
    for s in sorted({v.frame.spot for v in out.views}):
        vs = [v for v in out.views if v.frame.spot == s]
        centre = np.mean([v.pose.c for v in vs], axis=0)
        level = [v for v in vs if abs(v.pose.pitch_deg) < 15] or vs
        yaw = float(level[0].pose.heading_deg)
        full = [_stitch_input(images[v.index], v.frame.K, v.frame.pose) for v in vs]
        pano, pinfo = stitch(full, centre, yaw, polygon, floor_y, floor_y + ch, width=width)
        data, quality = encode_jpeg(pano)
        pinfo["bytes"], pinfo["quality"] = len(data), quality
        rel = panorama_file(s)
        store.write(rel, data, "image/jpeg")
        spots.append(
            {
                "spot": int(s),
                "storagePath": store.full_path(rel),
                "width": int(pano.shape[1]),
                "height": int(pano.shape[0]),
                "position": [round(float(x), 4) for x in centre],
                "yawDeg": round(yaw, 3),
            }
        )
        info.append({"spot": int(s), **pinfo})
        log(f"panorama spot {s}: covered {pinfo['covered']}")
    out.info["panoramas"] = info
    return spots
