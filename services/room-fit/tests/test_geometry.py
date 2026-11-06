import math

import numpy as np
import pytest

from room_fit.geometry import (
    Axes,
    Intrinsics,
    Pose,
    class_coords,
    class_point,
    classify_normals,
    matrix_from_column_major,
    pixel_rays,
    project,
)
from synth import look_rotation_arkit

K = Intrinsics(fx=1450, fy=1450, cx=959.5, cy=719.5, width=1920, height=1440)


def arkit_pose(heading, pitch, c=(0.0, 1.4, 0.0)):
    m = np.eye(4)
    m[:3, :3] = look_rotation_arkit(heading, pitch)
    m[:3, 3] = c
    return m


def test_column_major_transform():
    m = arkit_pose(30, -20, (1, 2, 3))
    assert np.allclose(matrix_from_column_major(m.flatten(order="F")), m)
    with pytest.raises(ValueError):
        matrix_from_column_major([1, 2, 3])


def test_arkit_to_opencv_looks_the_right_way():
    # Heading 90° (+X), pitched 30° down: forward must point to +X and down.
    pose = Pose.from_arkit(arkit_pose(90, -30))
    assert pose.heading_deg == pytest.approx(90, abs=1e-6)
    assert pose.pitch_deg == pytest.approx(-30, abs=1e-6)
    # Floor reprojection: a floor point straight ahead lands below the image centre, a point on
    # the camera's right lands right of centre.
    ahead = pose.c + np.array([2.0, -1.4, 0.0])
    u, v, z = project(K, pose, ahead)
    assert z > 0 and v > K.cy
    right = pose.c + np.array([2.0, 0.0, 1.0])  # facing +X with +Y up, the right is +Z
    u2, _, _ = project(K, pose, right)
    assert u2 > K.cx


def test_rays_and_projection_round_trip():
    pose = Pose.from_arkit(arkit_pose(-140, 12, (0.3, -0.2, 1.1)))
    u = np.array([0.0, 959.5, 1500.2])
    v = np.array([0.0, 719.5, 1200.7])
    d = pixel_rays(K, pose, u.astype(np.float32), v.astype(np.float32)).astype(np.float64)
    X = pose.c + 3.0 * d
    u2, v2, z = project(K, pose, X)
    assert np.allclose(u2, u, atol=1e-3) and np.allclose(v2, v, atol=1e-3)
    assert np.allclose(z, 3.0)


def test_scaled_intrinsics_keep_the_field_of_view():
    k2 = K.scaled(960, 720)
    assert k2.fov_x_deg == pytest.approx(K.fov_x_deg)
    assert k2.cx == pytest.approx((K.cx + 0.5) / 2 - 0.5)


def test_axes_and_wall_classes():
    axes = Axes(math.radians(20))
    p = np.array([[1.2, -0.7], [0.3, 2.0]])
    for cls in range(4):
        t, a = class_coords(axes, cls, p)
        back = np.array([class_point(axes, cls, ti, ai) for ti, ai in zip(t, a)])
        assert np.allclose(back, p)
    # A wall facing +u (class 0) lies on the room's -u side: further out means smaller p·u.
    t0, _ = class_coords(axes, 0, (-2.0 * axes.u)[None, :])
    assert t0[0] == pytest.approx(2.0)
    n = np.array([axes.u, -axes.u, axes.v, -axes.v, (axes.u + axes.v) / math.sqrt(2)])
    assert list(classify_normals(axes, n)) == [0, 1, 2, 3, -1]
