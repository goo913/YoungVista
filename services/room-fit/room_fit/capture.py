"""The capture the phone uploads (packages/core/src/turn-scan.ts `CaptureManifest`), and the checks
it must pass before it is measured."""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field

import numpy as np

from .errors import capture_error
from .geometry import Intrinsics, Pose, matrix_from_column_major, wrap_deg

CAPTURE_VERSION = 1

# A ring may not have a gap wider than this between neighbouring keyframes (degrees): the phone
# keeps one keyframe per 15° bin, so neighbours are up to 30° apart in a complete ring; a gap over
# 35° (20° beyond a bin) means part of the turn was missed. A landscape frame is about 67° wide,
# so even a 35° gap leaves neighbours overlapping by about 30°.
MAX_YAW_GAP_DEG = 35.0
# More limited-tracking frames than this share fails the scan.
MAX_LIMITED_SHARE = 1 / 3
MIN_FRAMES = 12
# The camera must stand this high above the AR floor (m).
MIN_CAMERA_HEIGHT = 0.6
MAX_CAMERA_HEIGHT = 2.3


def capture_folder(uid: str, scan_id: str) -> str:
    return f"users/{uid}/scans/{scan_id}"


def keyframe_file(index: int) -> str:
    return f"kf/{index:03d}.jpg"


def panorama_file(spot: int) -> str:
    return f"pano/spot-{spot}.jpg"


@dataclass
class Frame:
    index: int
    file: str
    t: float
    spot: int
    ring: int
    yaw_deg: float
    pitch_deg: float
    pose: Pose
    K: Intrinsics
    tracking: str
    sharpness: float | None = None

    @property
    def heading_deg(self) -> float:
        return self.pose.heading_deg


@dataclass
class Capture:
    version: int
    scan_id: str
    owner_id: str
    mode: str
    floor_y: float
    frames: list[Frame]
    spots: dict[int, np.ndarray]
    device: dict = field(default_factory=dict)
    floor_history: list[tuple[float, float]] = field(default_factory=list)


def _num(d: dict, key: str) -> float:
    v = d.get(key)
    if not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v):
        raise capture_error("format", f"{key} is not a number")
    return float(v)


def parse_manifest(data: dict) -> Capture:
    """Reads `capture.json`. Raises CaptureError for anything the server cannot use."""
    if not isinstance(data, dict):
        raise capture_error("format", "manifest is not an object")
    version = data.get("version")
    if version != CAPTURE_VERSION:
        raise capture_error("version", f"capture version {version!r}")
    floor = data.get("floor")
    if not isinstance(floor, dict):
        raise capture_error("floor", "no floor in the manifest")
    try:
        floor_y = _num(floor, "y")
    except Exception:
        raise capture_error("floor", "floor.y is not a number") from None
    history = []
    for h in floor.get("history") or []:
        if isinstance(h, dict):
            try:
                history.append((_num(h, "t"), _num(h, "y")))
            except Exception:
                pass
    frames: list[Frame] = []
    for f in data.get("frames") or []:
        if not isinstance(f, dict):
            raise capture_error("format", "a frame is not an object")
        intr = f.get("intrinsics") or {}
        try:
            c2w = matrix_from_column_major(f.get("transform"))
        except ValueError as e:
            raise capture_error("format", f"frame {f.get('index')}: {e}") from None
        bottom = c2w[3]
        if not np.allclose(bottom, [0, 0, 0, 1], atol=1e-3):
            # A row-major transform puts the translation in the bottom row.
            raise capture_error("format", f"frame {f.get('index')}: transform is not column-major")
        R = c2w[:3, :3]
        if not np.allclose(R.T @ R, np.eye(3), atol=1e-2):
            raise capture_error("format", f"frame {f.get('index')}: rotation is not orthonormal")
        width = int(_num(f, "width"))
        height = int(_num(f, "height"))
        K = Intrinsics(
            fx=_num(intr, "fx"),
            fy=_num(intr, "fy"),
            cx=_num(intr, "cx"),
            cy=_num(intr, "cy"),
            width=width,
            height=height,
        )
        if K.fx <= 0 or K.fy <= 0 or width < 64 or height < 64:
            raise capture_error("format", f"frame {f.get('index')}: bad intrinsics")
        sharp = f.get("sharpness")
        frames.append(
            Frame(
                index=int(_num(f, "index")),
                file=str(f.get("file") or ""),
                t=float(f.get("t") or 0.0),
                spot=int(f.get("spot") or 0),
                ring=int(f.get("ring") or 0),
                yaw_deg=float(f.get("yawDeg") or 0.0),
                pitch_deg=float(f.get("pitchDeg") or 0.0),
                pose=Pose.from_arkit(c2w),
                K=K,
                tracking=str(f.get("tracking") or "normal"),
                sharpness=float(sharp) if isinstance(sharp, (int, float)) else None,
            )
        )
        if not frames[-1].file or ".." in frames[-1].file or frames[-1].file.startswith("/"):
            raise capture_error("format", f"frame {f.get('index')}: bad file name")
    spots = {}
    for s in data.get("spots") or []:
        try:
            spots[int(s["index"])] = np.asarray(s["position"], dtype=np.float64).reshape(3)
        except Exception:
            continue
    return Capture(
        version=CAPTURE_VERSION,
        scan_id=str(data.get("scanId") or ""),
        owner_id=str(data.get("ownerId") or ""),
        mode=str(data.get("mode") or "landscape-3"),
        floor_y=floor_y,
        frames=frames,
        spots=spots,
        device=data.get("device") if isinstance(data.get("device"), dict) else {},
        floor_history=history,
    )


def max_yaw_gap(headings_deg) -> float:
    """The widest gap (degrees) between neighbouring headings around the full circle."""
    h = np.sort(np.mod(np.asarray(headings_deg, dtype=np.float64), 360.0))
    if len(h) == 0:
        return 360.0
    gaps = np.diff(np.concatenate([h, [h[0] + 360.0]]))
    return float(gaps.max())


def validate(capture: Capture) -> tuple[list[Frame], dict]:
    """The frames to measure, and what was checked. Raises CaptureError when the capture fails."""
    frames = capture.frames
    sizes = sorted({f"{f.K.width}x{f.K.height}" for f in frames})
    info: dict = {
        "frames": len(frames),
        "mode": capture.mode,
        "videoFormat": capture.device.get("videoFormat"),
        "imageSizes": sizes,
        "spots": len({f.spot for f in frames}),
        "warnings": [],
    }
    if len(frames) < MIN_FRAMES:
        raise capture_error("too-few", f"{len(frames)} frames")
    limited = [f for f in frames if f.tracking != "normal"]
    info["limitedFrames"] = len(limited)
    if len(limited) > MAX_LIMITED_SHARE * len(frames):
        raise capture_error("tracking", f"{len(limited)} of {len(frames)} frames limited")
    kept = [f for f in frames if f.tracking == "normal"]

    heights = np.array([f.pose.c[1] - capture.floor_y for f in kept])
    info["cameraHeight"] = round(float(np.median(heights)), 3)
    if not (MIN_CAMERA_HEIGHT <= np.median(heights) <= MAX_CAMERA_HEIGHT):
        raise capture_error("floor", f"camera {np.median(heights):.2f} m above the AR floor")

    # Coverage: every ring of every spot goes all the way around without a gap over 20°.
    rings: dict[tuple[int, int], list[float]] = defaultdict(list)
    for f in kept:
        rings[(f.spot, f.ring)].append(f.heading_deg)
    gaps = {}
    for (spot, ring), hs in sorted(rings.items()):
        gaps[f"{spot}/{ring}"] = round(max_yaw_gap(hs), 1)
    info["yawGaps"] = gaps
    worst = max(gaps.values()) if gaps else 360.0
    if worst > MAX_YAW_GAP_DEG:
        raise capture_error("coverage", f"yaw gap {worst:.0f}° (spot/ring {max(gaps, key=gaps.get)})")

    # The phone's own heading and tilt should match the transforms (ARKit axes, column-major).
    d_yaw = np.abs(wrap_deg([f.heading_deg - f.yaw_deg for f in kept]))
    d_pitch = np.abs([f.pose.pitch_deg - f.pitch_deg for f in kept])
    info["poseCheck"] = {
        "yawDiffDeg": round(float(np.median(d_yaw)), 2),
        "pitchDiffDeg": round(float(np.median(d_pitch)), 2),
    }
    if np.median(d_yaw) > 10 or np.median(d_pitch) > 10:
        info["warnings"].append("phone yaw/pitch disagree with the transforms")
    return kept, info
