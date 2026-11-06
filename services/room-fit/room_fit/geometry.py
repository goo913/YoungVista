"""Camera and room-frame geometry shared by every step.

World: the AR session's frame (ARKit: metres, Y up, gravity aligned); the floor plan is (x, z).
Headings are `atan2(x, z)` of a direction, as in packages/core.

ARKit cameras look down -Z with +Y up the image; OpenCV cameras (and MoGe) look down +Z with +Y
down the image. So the OpenCV camera-to-world rotation is ARKit's with its y and z columns negated.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

ARKIT_TO_CV = np.diag([1.0, -1.0, -1.0])


def matrix_from_column_major(values) -> np.ndarray:
    """A 4x4 matrix from 16 numbers in column-major order (ARKit's simd_float4x4 layout)."""
    m = np.asarray(values, dtype=np.float64)
    if m.shape != (16,) or not np.all(np.isfinite(m)):
        raise ValueError("transform must be 16 finite numbers")
    return m.reshape(4, 4).T


@dataclass(frozen=True)
class Intrinsics:
    fx: float
    fy: float
    cx: float
    cy: float
    width: int
    height: int

    def scaled(self, width: int, height: int) -> Intrinsics:
        """The same camera for the image resized to `width` x `height` (pixel centres at integers)."""
        kx = width / self.width
        ky = height / self.height
        return Intrinsics(
            fx=self.fx * kx,
            fy=self.fy * ky,
            cx=(self.cx + 0.5) * kx - 0.5,
            cy=(self.cy + 0.5) * ky - 0.5,
            width=width,
            height=height,
        )

    @property
    def fov_x_deg(self) -> float:
        return math.degrees(2.0 * math.atan(self.width / (2.0 * self.fx)))

    @property
    def fov_y_deg(self) -> float:
        return math.degrees(2.0 * math.atan(self.height / (2.0 * self.fy)))

    def matrix(self) -> np.ndarray:
        return np.array([[self.fx, 0, self.cx], [0, self.fy, self.cy], [0, 0, 1.0]])


@dataclass(frozen=True)
class Pose:
    """An OpenCV camera-to-world pose: x = R @ x_cam + c."""

    R: np.ndarray  # 3x3, columns: camera right, down, forward in world
    c: np.ndarray  # 3, camera centre in world

    @staticmethod
    def from_arkit(c2w: np.ndarray) -> Pose:
        return Pose(R=c2w[:3, :3] @ ARKIT_TO_CV, c=c2w[:3, 3].copy())

    def arkit_matrix(self) -> np.ndarray:
        m = np.eye(4)
        m[:3, :3] = self.R @ ARKIT_TO_CV
        m[:3, 3] = self.c
        return m

    @property
    def forward(self) -> np.ndarray:
        return self.R[:, 2]

    @property
    def heading_deg(self) -> float:
        f = self.forward
        return math.degrees(math.atan2(f[0], f[2]))

    @property
    def pitch_deg(self) -> float:
        return math.degrees(math.asin(float(np.clip(self.forward[1], -1.0, 1.0))))

    def world_to_camera(self, X: np.ndarray) -> np.ndarray:
        """Points (..., 3) in world to OpenCV camera coordinates."""
        return (X - self.c) @ self.R


def pixel_grid(width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    u, v = np.meshgrid(np.arange(width, dtype=np.float32), np.arange(height, dtype=np.float32))
    return u, v


def pixel_rays(K: Intrinsics, pose: Pose, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """World directions (..., 3) of pixels, scaled so their camera z is 1 (depth multiplies them)."""
    x = (u - K.cx) / K.fx
    y = (v - K.cy) / K.fy
    R = pose.R.astype(np.float32)
    return x[..., None] * R[:, 0] + y[..., None] * R[:, 1] + R[:, 2]


def project(K: Intrinsics, pose: Pose, X: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Pixel coordinates and depth of world points (..., 3)."""
    xc = pose.world_to_camera(X)
    z = xc[..., 2]
    with np.errstate(divide="ignore", invalid="ignore"):
        u = K.fx * xc[..., 0] / z + K.cx
        v = K.fy * xc[..., 1] / z + K.cy
    return u, v, z


def heading_of(d: np.ndarray) -> np.ndarray:
    return np.degrees(np.arctan2(d[..., 0], d[..., 2]))


def wrap_deg(a):
    """Angles to (-180, 180]."""
    return (np.asarray(a) + 180.0) % 360.0 - 180.0


@dataclass(frozen=True)
class Axes:
    """The room's axes, as packages/core `roomAxes(angle)`: u at `angle` from +X toward +Z."""

    angle: float

    @property
    def u(self) -> np.ndarray:
        return np.array([math.cos(self.angle), math.sin(self.angle)])

    @property
    def v(self) -> np.ndarray:
        return np.array([-math.sin(self.angle), math.cos(self.angle)])

    def to_frame(self, p: np.ndarray) -> np.ndarray:
        """Floor-plan points (..., 2) as (p·u, p·v), like core's `toRoomFrame`."""
        return np.stack([p @ self.u, p @ self.v], axis=-1)

    def from_frame(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.asarray(a)[..., None] * self.u + np.asarray(b)[..., None] * self.v


# Wall classes: the direction a wall's visible face points (into the room).
# 0: +u (the wall is on the room's -u side), 1: -u, 2: +v, 3: -v.
# Walls of classes 0 and 1 run along v (core axis 1); classes 2 and 3 run along u (axis 0).
CLASS_AXIS = (1, 1, 0, 0)


def class_normal(axes: Axes, cls: int) -> np.ndarray:
    """The inward normal (into the room) of a wall class, on the floor plan."""
    return [axes.u, -axes.u, axes.v, -axes.v][cls]


def class_coords(axes: Axes, cls: int, p: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """For floor-plan points (..., 2): `t`, how far out toward the wall (larger is further from the
    room's middle), and `a`, the position along the wall in core's room frame."""
    n = class_normal(axes, cls)
    t = -(p @ n)
    along = axes.v if CLASS_AXIS[cls] == 1 else axes.u
    return t, p @ along


def class_point(axes: Axes, cls: int, t: float, a: float) -> np.ndarray:
    """The floor-plan point at outward offset `t` and along-position `a` of a wall class."""
    n = class_normal(axes, cls)
    along = axes.v if CLASS_AXIS[cls] == 1 else axes.u
    return -t * n + a * along


def classify_normals(axes: Axes, n_xz: np.ndarray, max_angle_deg: float = 25.0) -> np.ndarray:
    """Wall class (0..3) of horizontal normals (..., 2), or -1 when no class is within the angle."""
    norm = np.linalg.norm(n_xz, axis=-1)
    with np.errstate(invalid="ignore", divide="ignore"):
        n = n_xz / norm[..., None]
    du = n @ axes.u
    dv = n @ axes.v
    scores = np.stack([du, -du, dv, -dv], axis=-1)
    cls = np.argmax(scores, axis=-1)
    best = np.take_along_axis(scores, cls[..., None], axis=-1)[..., 0]
    ok = np.isfinite(best) & (best >= math.cos(math.radians(max_angle_deg)))
    return np.where(ok, cls, -1)
