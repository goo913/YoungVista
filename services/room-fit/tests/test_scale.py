import math

import numpy as np
import pytest

import synth
from helpers import LOW_RES
from room_fit.capture import Frame
from room_fit.depth import DepthMap
from room_fit.geometry import Pose
from room_fit.scale import PairRatio, anchor_scales, plane_anchor, solve_scales
from room_fit.views import make_view


def view_of(room, heading, pitch, depth_scale=1.0, index=0, body=(1.5, 1.6)):
    placement = synth.Placement()
    c_room = np.array([body[0], 1.4, body[1]])
    c = placement.to_world(c_room[None, :])[0]
    hw = math.degrees(
        math.atan2(*(placement.R() @ [math.sin(math.radians(heading)), 0, math.cos(math.radians(heading))])[[0, 2]])
    )
    R = synth.look_rotation_arkit(hw, pitch)
    img, depth, nrm = synth.render_frame(room, placement, R, c, LOW_RES)
    M = np.eye(4)
    M[:3, :3] = R
    M[:3, 3] = c
    pose = Pose.from_arkit(M)
    frame = Frame(index, f"kf/{index:03d}.jpg", 0.0, 0, 0 if pitch < 0 else 1, 0.0, pitch, pose, LOW_RES, "normal")
    n_cam = nrm @ pose.R
    dm = DepthMap(
        depth=(depth * depth_scale).astype(np.float32), normal=n_cam.astype(np.float32), mask=np.isfinite(depth)
    )
    rgb = (np.clip(img, 0, 1) * 255).astype(np.uint8)
    return make_view(frame, rgb, LOW_RES, dm), placement


def bed_room():
    room = synth.rect_room("t", 3.6, 4.2, 2.6, spots=[(1.8, 2.1)], lights=[(1.8, 2.4, 2.1)])
    room.boxes = [synth.Box("bed", (0.2, 0.0, 0.0), (3.4, 0.55, 2.0), (0.5, 0.7, 0.8))]
    return room


def test_floor_anchor_finds_the_floor_even_when_a_bed_fills_the_view():
    room = bed_room()
    # Looking down at the bed (which covers most of the view), with depth 20% too short.
    v, placement = view_of(room, 180, -35, depth_scale=1 / 1.2, body=(1.8, 3.3))
    a = plane_anchor(v, placement.floor_y)
    assert a is not None
    assert math.exp(a.log_scale) == pytest.approx(1.2, rel=0.01)
    # The bed top is kept as an alternative cluster (it is above the floor: a larger ratio).
    assert any(alt > a.log_scale + 0.2 for alt, _ in a.alternatives)


def test_joint_solve_carries_scale_to_frames_without_floor():
    anchors = {0: plane_anchor_stub(0.10), 1: plane_anchor_stub(0.12)}
    pairs = [PairRatio(1, 2, 0.05, 0.01, 500), PairRatio(2, 3, -0.02, 0.01, 500)]
    x = solve_scales(5, anchors, pairs, {i: i for i in range(5)})
    assert x[2] == pytest.approx(0.17, abs=0.01)
    assert x[3] == pytest.approx(0.15, abs=0.01)
    assert math.isnan(x[4])  # not connected to any anchor


def plane_anchor_stub(log_scale):
    from room_fit.scale import Anchor

    return Anchor(log_scale=log_scale, sigma=0.01, pixels=1000, spread=0.01)


def test_anchor_scales_on_rendered_views():
    room = bed_room()
    views = []
    for k, (h, p) in enumerate([(0, -35), (60, -35), (120, -35), (180, -35), (0, 0), (60, 0), (0, 35), (60, 35)]):
        v, placement = view_of(room, h, p, depth_scale=1 / (1.1 + 0.02 * k), index=k)
        views.append(v)
    info = anchor_scales(views, placement.floor_y)
    assert info["scaled"] >= 6
    for k, v in enumerate(views):
        if math.isfinite(v.scale):
            assert v.scale == pytest.approx(1.1 + 0.02 * k, rel=0.03)
