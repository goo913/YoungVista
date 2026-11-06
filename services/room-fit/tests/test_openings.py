import json

import numpy as np
import pytest

from room_fit import openings
from room_fit.openings import _plane_hit, _wall_hit, merge_openings


def test_rays_find_the_wall_they_meet():
    square = np.array([[-2, -2], [2, -2], [2, 2], [-2, 2]], float)
    c = np.array([0.0, 1.4, 0.0])
    k, dist = _wall_hit(c, np.array([1.0, 0.0, 0.0]), square)
    assert k == 1 and dist == pytest.approx(2.0)
    p = _plane_hit(c, np.array([1.0, 0.25, 0.5]), square[1], square[2])
    assert p[0] == pytest.approx(2.0) and p[1] == pytest.approx(1.9) and p[2] == pytest.approx(1.0)


def box(edge, kind, frm, to, bottom, top, frame, cut=None):
    return {
        "edge": edge,
        "markId": f"w{edge}",
        "kind": kind,
        "from": frm,
        "to": to,
        "bottom": bottom,
        "top": top,
        "cut": cut or {"l": False, "r": False, "t": False, "b": False},
        "wall": (-2.0, 2.0),
        "frame": frame,
    }


def test_boxes_seen_in_several_frames_merge_by_median():
    found = [
        box(1, "door", 0.50, 1.40, 0.05, 2.02, 1),
        box(1, "door", 0.52, 1.43, 0.0, 2.06, 2),
        # Cut off on the right in this frame: its right edge is not used.
        box(1, "door", 0.48, 1.10, 0.02, 2.04, 3, cut={"l": False, "r": True, "t": False, "b": False}),
        box(2, "window", -1.0, 0.2, 0.9, 2.1, 4),
        box(2, "window", 1.2, 1.3, 0.9, 1.1, 4),  # too small: dropped
    ]
    out = merge_openings(found, ceiling=2.5)
    door = next(o for o in out if o["kind"] == "door")
    assert door["markId"] == "w1"
    assert door["from"] == pytest.approx(0.50, abs=0.01)
    assert door["to"] == pytest.approx(1.415, abs=0.01)
    assert door["bottom"] == 0.0  # snapped to the floor
    assert door["confidence"] > 0.7
    assert [o["kind"] for o in out].count("window") == 1
    # A door whose bottom no frame saw still stands on the floor.
    cut = {"l": False, "r": False, "t": False, "b": True}
    out = merge_openings([box(3, "door", 1.0, 1.9, 0.46, 2.05, 7, cut=cut)], ceiling=2.5)
    assert out[0]["bottom"] == 0.0


def test_detect_reads_boxes_from_the_model_reply():
    class Reply:
        def raise_for_status(self):
            pass

        def json(self):
            items = [{"label": "window", "box_2d": [100, 200, 600, 500]}, {"label": "sofa", "box_2d": [0, 0, 1, 1]}]
            return {"candidates": [{"content": {"parts": [{"text": json.dumps(items)}]}}]}

    class Session:
        def post(self, url, json=None, timeout=None):
            assert ":generateContent" in url and "thinkingConfig" in json["generationConfig"]
            return Reply()

    boxes = openings.detect(Session(), "young-vista", b"jpeg")
    assert boxes == [{"kind": "window", "box": (200.0, 100.0, 500.0, 600.0)}]
