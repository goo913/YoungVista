"""A keyframe at working resolution, with its depth, normals and rays in the world."""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from .capture import Frame
from .depth import DepthMap
from .geometry import Intrinsics, Pose, pixel_grid, pixel_rays


@dataclass
class View:
    frame: Frame
    K: Intrinsics  # at working resolution
    image: np.ndarray  # (h, w, 3) uint8 RGB, working resolution
    depth: np.ndarray  # (h, w) float32, model metres (unscaled), nan where invalid
    normal_w: np.ndarray  # (h, w, 3) float32 world normals
    valid: np.ndarray  # (h, w) bool: depth valid, not on a depth edge, not grazing
    rays: np.ndarray  # (h, w, 3) float32 world directions with camera z = 1
    scale: float = float("nan")  # true metres = scale * depth; nan when not trusted for fusion
    # The best available scale even when it is not trusted (its own solve, else the room's median):
    # enough to tell floor and ceiling pixels and to check junctions, which do not depend on it.
    scale_hint: float = float("nan")
    info: dict = field(default_factory=dict)

    @property
    def pose(self) -> Pose:
        return self.frame.pose

    @property
    def index(self) -> int:
        return self.frame.index

    def points(self, scale: float | None = None) -> np.ndarray:
        s = self.scale if scale is None else scale
        return self.pose.c.astype(np.float32) + (s * self.depth)[..., None] * self.rays


def working_size(width: int, height: int, max_width: int) -> tuple[int, int]:
    if width <= max_width:
        return width, height
    k = max_width / width
    return max_width, int(round(height * k))


def depth_edges(depth: np.ndarray, threshold: float = 0.06) -> np.ndarray:
    """Pixels on or next to a depth jump (relative change per pixel above `threshold`)."""
    with np.errstate(invalid="ignore", divide="ignore"):
        ld = np.log(depth)
    ld = np.where(np.isfinite(ld), ld, 0).astype(np.float32)
    gx = np.abs(cv2.Sobel(ld, cv2.CV_32F, 1, 0, ksize=3)) / 4
    gy = np.abs(cv2.Sobel(ld, cv2.CV_32F, 0, 1, ksize=3)) / 4
    edge = (np.maximum(gx, gy) > threshold) | ~np.isfinite(depth)
    return cv2.dilate(edge.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0


def make_view(frame: Frame, image: np.ndarray, K: Intrinsics, dm: DepthMap) -> View:
    h, w = image.shape[:2]
    u, v = pixel_grid(w, h)
    rays = pixel_rays(K, frame.pose, u, v).astype(np.float32)
    R = frame.pose.R.astype(np.float32)
    n = dm.normal @ R.T
    norm = np.linalg.norm(n, axis=-1, keepdims=True)
    n = np.where(norm > 1e-6, n / np.maximum(norm, 1e-6), 0).astype(np.float32)
    # Normals face the camera; flip any that do not (the model is not always consistent).
    facing = (n * rays).sum(-1)
    n = np.where((facing > 0)[..., None], -n, n)
    ray_len = np.linalg.norm(rays, axis=-1)
    grazing = np.abs((n * rays).sum(-1)) / ray_len < 0.12
    valid = dm.mask & np.isfinite(dm.depth) & ~depth_edges(dm.depth) & ~grazing
    return View(frame=frame, K=K, image=image, depth=dm.depth, normal_w=n, valid=valid, rays=rays)
