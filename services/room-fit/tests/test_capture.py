import copy

import numpy as np
import pytest

from room_fit.capture import max_yaw_gap, parse_manifest, validate
from room_fit.errors import CaptureError
from synth import look_rotation_arkit


def manifest(n_per_ring=24, rings=(-35, 0, 35), floor_y=-1.4, step=None):
    frames = []
    step = step or 360 / n_per_ring
    i = 0
    for r, pitch in enumerate(rings):
        for k in range(n_per_ring):
            h = k * step
            m = np.eye(4)
            m[:3, :3] = look_rotation_arkit(h, pitch)
            m[:3, 3] = (0.2 * np.sin(np.radians(h)), 0.0, 0.2 * np.cos(np.radians(h)))
            frames.append(
                {
                    "index": i,
                    "file": f"kf/{i:03d}.jpg",
                    "t": i * 0.4,
                    "spot": 0,
                    "ring": r,
                    "yawDeg": ((h + 180) % 360) - 180,
                    "pitchDeg": pitch,
                    "transform": list(m.flatten(order="F")),
                    "intrinsics": {"fx": 1450, "fy": 1450, "cx": 960, "cy": 720},
                    "width": 1920,
                    "height": 1440,
                    "tracking": "normal",
                }
            )
            i += 1
    return {
        "version": 1,
        "scanId": "s1",
        "ownerId": "u1",
        "createdAt": "2026-11-06T00:00:00Z",
        "mode": "landscape-3",
        "device": {"model": "iPhone15,4", "os": "27", "app": "1", "viro": "3.0.3"},
        "floor": {"y": floor_y},
        "spots": [{"index": 0, "position": [0, 0, 0]}],
        "frames": frames,
    }


def code(fn):
    with pytest.raises(CaptureError) as e:
        fn()
    return e.value.code


def test_a_good_capture_passes():
    cap = parse_manifest(manifest())
    frames, info = validate(cap)
    assert len(frames) == 72
    assert info["cameraHeight"] == pytest.approx(1.4)
    assert max(info["yawGaps"].values()) == pytest.approx(15, abs=0.01)
    assert info["poseCheck"]["pitchDiffDeg"] < 0.01 and info["poseCheck"]["yawDiffDeg"] < 0.01


def test_refuses_unknown_versions_and_broken_transforms():
    m = manifest()
    m["version"] = 2
    assert code(lambda: parse_manifest(m)) == "version"
    m = manifest()
    M = np.array(m["frames"][3]["transform"]).reshape(4, 4).T
    m["frames"][3]["transform"] = list(M.flatten())  # row-major by mistake
    assert code(lambda: parse_manifest(m)) == "format"
    m = manifest()
    m["frames"][0]["file"] = "../../other/kf.jpg"
    assert code(lambda: parse_manifest(m)) == "format"
    m = manifest()
    del m["floor"]
    assert code(lambda: parse_manifest(m)) == "floor"


def test_refuses_gaps_lost_tracking_and_a_bad_floor():
    m = manifest()
    # Remove two neighbouring keyframes of the level ring: a 45° gap.
    m["frames"] = [f for f in m["frames"] if not (f["ring"] == 1 and f["index"] in (30, 31))]
    assert code(lambda: validate(parse_manifest(m))) == "coverage"
    m = manifest()
    for f in m["frames"][:30]:
        f["tracking"] = "limited"
    assert code(lambda: validate(parse_manifest(m))) == "tracking"
    m = manifest(floor_y=0.5)  # floor above the camera
    assert code(lambda: validate(parse_manifest(m))) == "floor"
    m = copy.deepcopy(manifest())
    m["frames"] = m["frames"][:8]
    assert code(lambda: validate(parse_manifest(m))) == "too-few"


def test_yaw_gap_wraps_around():
    assert max_yaw_gap([350, 5, 20]) == pytest.approx(330)
    assert max_yaw_gap(np.arange(0, 360, 15)) == pytest.approx(15)
