"""Doors, windows and openings (optional, `ROOM_FIT_OPENINGS=1`): an AI model on Vertex AI draws 2D
boxes on level keyframes; every box edge is cast onto the fitted wall it lies on, and boxes seen
in several frames are merged by their medians. Every number comes from geometry; the AI only says
what and roughly where. Called with the job's service account (roles/aiplatform.user)."""

from __future__ import annotations

import base64
import json
import os
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

MODEL = os.environ.get("OPENINGS_MODEL", "gemini-3.8-flash")
LOCATION = os.environ.get("OPENINGS_LOCATION", "global")
MAX_FRAMES = int(os.environ.get("OPENINGS_MAX_FRAMES", "16"))

PROMPT = (
    "This is a photo taken inside a room. Find every door, window and open doorway (a gap in a wall "
    "leading to another space, with no door in it) in the room's walls. Do not include cupboard or "
    "wardrobe doors, mirrors, pictures, screens or furniture. Return a JSON list; each item has "
    '"label" (one of "door", "window", "opening") and "box_2d" as [ymin, xmin, ymax, xmax] '
    "normalised to 0-1000. Include ones that are only partly in the photo. Return [] if there are none."
)

SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "label": {"type": "STRING", "enum": ["door", "window", "opening"]},
            "box_2d": {"type": "ARRAY", "items": {"type": "INTEGER"}},
        },
        "required": ["label", "box_2d"],
    },
}


def _session():
    import google.auth
    from google.auth.transport.requests import AuthorizedSession

    creds, project = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    return AuthorizedSession(creds), os.environ.get("GOOGLE_CLOUD_PROJECT") or project


def detect(session, project: str, jpeg: bytes) -> list[dict]:
    host = "aiplatform.googleapis.com" if LOCATION == "global" else f"{LOCATION}-aiplatform.googleapis.com"
    url = f"https://{host}/v1/projects/{project}/locations/{LOCATION}/publishers/google/models/{MODEL}:generateContent"
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(jpeg).decode()}},
                    {"text": PROMPT},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
            "responseSchema": SCHEMA,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    r = session.post(url, json=body, timeout=60)
    r.raise_for_status()
    data = r.json()
    parts = data["candidates"][0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts)
    items = json.loads(text) if text.strip() else []
    out = []
    for it in items if isinstance(items, list) else []:
        box = it.get("box_2d")
        if it.get("label") in ("door", "window", "opening") and isinstance(box, list) and len(box) == 4:
            y0, x0, y1, x1 = (float(b) for b in box)
            if 0 <= x0 < x1 <= 1000 and 0 <= y0 < y1 <= 1000:
                out.append({"kind": it["label"], "box": (x0, y0, x1, y1)})
    return out


def pick_frames(views, per_spot: int) -> list:
    """Level keyframes spread around each spot."""
    chosen = []
    for s in sorted({v.frame.spot for v in views}):
        vs = [v for v in views if v.frame.spot == s]
        if not vs:
            continue
        level_ring = min(
            {v.frame.ring for v in vs},
            key=lambda r: abs(np.median([v.pose.pitch_deg for v in vs if v.frame.ring == r])),
        )
        ring = sorted([v for v in vs if v.frame.ring == level_ring], key=lambda v: v.pose.heading_deg)
        if not ring:
            continue
        step = max(1, int(round(len(ring) / per_spot)))
        chosen += ring[::step][:per_spot]
    return chosen


def _wall_hit(c: np.ndarray, d: np.ndarray, polygon: np.ndarray) -> tuple[int, float] | None:
    """The first outline edge the horizontal part of ray d from c meets: (edge index, distance)."""
    h = d[[0, 2]]
    hn = np.linalg.norm(h)
    if hn < 1e-6:
        return None
    h = h / hn
    best = None
    for k in range(len(polygon)):
        a = polygon[k] - c[[0, 2]]
        b = polygon[(k + 1) % len(polygon)] - c[[0, 2]]
        e = b - a
        den = h[0] * (-e[1]) - h[1] * (-e[0])
        if abs(den) < 1e-9:
            continue
        s = (a[0] * (-e[1]) - a[1] * (-e[0])) / den
        t = (h[0] * a[1] - h[1] * a[0]) / den
        if s > 0.05 and -0.02 <= t <= 1.02 and (best is None or s < best[1]):
            best = (k, s)
    return best


def _plane_hit(c: np.ndarray, d: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray | None:
    e = b - a
    n = np.array([-e[1], e[0]]) / max(1e-9, np.linalg.norm(e))
    den = d[0] * n[0] + d[2] * n[1]
    if abs(den) < 1e-9:
        return None
    t = ((a[0] - c[0]) * n[0] + (a[1] - c[2]) * n[1]) / den
    return c + t * d if t > 0 else None


def find_openings(out, store, log=print) -> tuple[list[dict], dict]:
    room = out.room
    if not room or not room.get("ok"):
        return [], {"skipped": "no closed outline"}
    polygon = np.asarray(room["points"], np.float64)
    walls = room["walls"]
    axes = out.extras["axes"]
    floor_y = float(out.result["floorY"])
    ceiling = out.result.get("ceilingHeight") or 2.5
    images = out.extras["images_full"]
    n_spots = len({v.frame.spot for v in out.views})
    frames = pick_frames(out.views, max(4, MAX_FRAMES // max(1, n_spots)))
    session, project = _session()

    def run(v):
        img = images[v.index]
        h, w = img.shape[:2]
        k = 1024 / w
        small = cv2.resize(img, (1024, int(round(h * k))), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", cv2.cvtColor(small, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 85])
        try:
            return v, detect(session, project, buf.tobytes()), None
        except Exception as e:  # noqa: BLE001 - a frame that fails is skipped
            return v, [], str(e)[:200]

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(run, frames))
    found = []
    errors = [e for _, _, e in results if e]
    for v, boxes, _ in results:
        K, pose = v.frame.K, v.frame.pose
        c = pose.c
        for bx in boxes:
            x0, y0, x1, y1 = bx["box"]
            X0, X1 = x0 / 1000 * K.width, x1 / 1000 * K.width
            Y0, Y1 = y0 / 1000 * K.height, y1 / 1000 * K.height
            xc, yc = 0.5 * (X0 + X1), 0.5 * (Y0 + Y1)
            ray = _pixel_ray(K, pose)
            hit = _wall_hit(c, ray(xc, yc), polygon)
            if hit is None:
                continue
            k = hit[0]
            a, b = polygon[k], polygon[(k + 1) % len(polygon)]
            pl, pr = _plane_hit(c, ray(X0, yc), a, b), _plane_hit(c, ray(X1, yc), a, b)
            pt, pb = _plane_hit(c, ray(xc, Y0), a, b), _plane_hit(c, ray(xc, Y1), a, b)
            if pl is None or pr is None or pt is None or pb is None:
                continue
            mark_ids = walls[k]["markIds"]
            if not mark_ids:
                continue
            axis = 0 if abs((b - a) @ axes.u) >= abs((b - a) @ axes.v) else 1
            along = axes.u if axis == 0 else axes.v
            lo_w, hi_w = sorted([float(a @ along), float(b @ along)])
            al, ar = float(pl[[0, 2]] @ along), float(pr[[0, 2]] @ along)
            found.append(
                {
                    "edge": k,
                    "markId": mark_ids[0],
                    "kind": bx["kind"],
                    "from": min(al, ar),
                    "to": max(al, ar),
                    "bottom": float(pb[1] - floor_y),
                    "top": float(pt[1] - floor_y),
                    "cut": {"l": x0 <= 5, "r": x1 >= 995, "t": y0 <= 5, "b": y1 >= 995},
                    "wall": (lo_w, hi_w),
                    "frame": v.index,
                }
            )
    merged = merge_openings(found, ceiling)
    return merged, {
        "model": MODEL,
        "frames": len(frames),
        "boxes": len(found),
        "errors": len(errors),
        "found": len(merged),
    }


def _pixel_ray(K, pose):
    """World direction through a full-resolution pixel of the frame."""

    def ray(px: float, py: float) -> np.ndarray:
        return pose.R @ np.array([(px - K.cx) / K.fx, (py - K.cy) / K.fy, 1.0])

    return ray


def _pick(group: list[dict], key: str, cut: str) -> float:
    """The median of an edge over the boxes where that edge is not cut off by the frame."""
    vals = [x[key] for x in group if not x["cut"][cut]]
    return float(np.median(vals)) if vals else float(np.median([x[key] for x in group]))


def merge_openings(found: list[dict], ceiling: float) -> list[dict]:
    """Groups boxes of the same wall and kind that overlap; medians of the edges not cut off."""
    groups: list[list[dict]] = []
    for f in sorted(found, key=lambda f: (f["edge"], f["kind"], f["from"])):
        for g in groups:
            r = g[0]
            if r["edge"] != f["edge"] or r["kind"] != f["kind"]:
                continue
            lo = max(np.median([x["from"] for x in g]), f["from"])
            hi = min(np.median([x["to"] for x in g]), f["to"])
            width = min(np.median([x["to"] - x["from"] for x in g]), f["to"] - f["from"])
            if hi - lo > 0.3 * max(width, 1e-6):
                g.append(f)
                break
        else:
            groups.append([f])
    out = []
    for g in groups:
        lo_w, hi_w = g[0]["wall"]
        frm = max(lo_w, _pick(g, "from", "l"))
        to = min(hi_w, _pick(g, "to", "r"))
        bottom = max(0.0, _pick(g, "bottom", "b"))
        top = min(ceiling, _pick(g, "top", "t"))
        kind = g[0]["kind"]
        # Doors and doorways stand on the floor: snap a bottom near it, or one no frame saw (level
        # keyframes often cut a door off above the floor).
        if kind in ("door", "opening") and (bottom < 0.2 or all(x["cut"]["b"] for x in g)):
            bottom = 0.0
        if to - frm < 0.4 or top - bottom < 0.4:
            continue
        frames = len({x["frame"] for x in g})
        conf = min(0.9, 0.35 + 0.15 * frames)
        if all(x["cut"]["l"] or x["cut"]["r"] for x in g):
            conf *= 0.7
        out.append(
            {
                "markId": g[0]["markId"],
                "kind": kind,
                "from": round(frm, 3),
                "to": round(to, 3),
                "bottom": round(bottom, 3),
                "top": round(top, 3),
                "confidence": round(conf, 3),
            }
        )
    return out
