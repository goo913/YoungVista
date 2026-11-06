import json
import math

import cv2
import numpy as np
import pytest

import synth
from helpers import small_capture
from room_fit.capture import parse_manifest
from room_fit.panorama import MAX_PANO_BYTES, encode_jpeg, pano_directions, stitch, wall_distances


def test_layout_centre_column_and_turning_direction():
    d = pano_directions(360, 180, yaw_deg=30)
    centre = d[90, 180]
    assert math.degrees(math.atan2(centre[0], centre[2])) == pytest.approx(30, abs=1)
    # Moving right in the image turns right (clockwise seen from above): the heading decreases.
    right = d[90, 200]
    assert math.degrees(math.atan2(right[0], right[2])) < 30
    assert d[0, 0, 1] > 0.99 and d[-1, 0, 1] < -0.99  # top row up, bottom row down


def panorama_direction(yaw_deg, u, v):
    """packages/core/src/tour.ts `panoramaDirection`, which the 360° viewers use."""
    heading = math.radians(yaw_deg - (u - 0.5) * 360)
    pitch = (0.5 - v) * math.pi
    c = math.cos(pitch)
    return [c * math.sin(heading), math.sin(pitch), c * math.cos(heading)]


def test_layout_is_the_viewers_panorama_direction():
    w, h, yaw = 64, 32, -37.5
    d = pano_directions(w, h, yaw)
    for i, j in [(0, 0), (5, 9), (31, 16), (63, 31), (40, 3)]:
        want = panorama_direction(yaw, (i + 0.5) / w, (j + 0.5) / h)
        assert d[j, i] == pytest.approx(want, abs=1e-6)


def test_panorama_jpeg_stays_under_the_upload_limit():
    # Even pure noise at 4096×2048 fits at the default quality; a tighter cap lowers the quality.
    noise = np.random.default_rng(0).integers(0, 256, (2048, 4096, 3), dtype=np.uint8)
    data, quality = encode_jpeg(noise)
    assert len(data) <= MAX_PANO_BYTES and quality == 88
    data, quality = encode_jpeg(noise, max_bytes=3_000_000)
    assert len(data) <= 3_000_000 and quality < 88


def test_wall_distances_in_a_square_room():
    square = np.array([[-2, -2], [2, -2], [2, 2], [-2, 2]], float)
    r = wall_distances(np.zeros(2), np.radians([0, 45, 90, 180]), square)
    assert r == pytest.approx([2, 2 * math.sqrt(2), 2, 2])


def test_stitched_panorama_matches_the_room(tmp_path):
    cap_dir, _, truth = small_capture(tmp_path)
    cap = parse_manifest(json.loads((cap_dir / "capture.json").read_text()))
    frames = [(cv2.cvtColor(cv2.imread(str(cap_dir / f.file)), cv2.COLOR_BGR2RGB), f.K, f.pose) for f in cap.frames]
    centre = np.mean([f.pose.c for f in cap.frames], axis=0)
    polygon = np.asarray(truth["points"])
    floor_y = truth["floorY"]
    pano, info = stitch(frames, centre, 0.0, polygon, floor_y, floor_y + truth["ceilingHeight"], width=512)
    assert pano.shape == (256, 512, 3)
    assert info["covered"] > 0.6
    # The true panorama from the centre, ray traced through the same room.
    room = next(r for r in synth.demo_rooms() if r.name == "small")
    placement = synth.Placement()
    d = pano_directions(512, 256, 0.0).reshape(-1, 3).astype(np.float64) @ placement.R()
    o = placement.to_room(centre[None, :])[0]
    t, kind, idx, normal = synth.trace(room, o, d)
    col = synth.shade(room, o, d, t, kind, idx, normal)
    want = (np.power(np.clip(col, 0, 1), 1 / 2.2) * 255).reshape(256, 512, 3)
    rows = slice(256 // 2 - 50, 256 // 2 + 50)  # well inside what the rings cover
    diff = np.abs(pano[rows].astype(float) - want[rows]).mean()
    assert diff < 20
