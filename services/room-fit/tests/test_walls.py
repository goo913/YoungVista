import math

import numpy as np
import pytest

from room_fit.cues import BAND, CEILING_LINE, FLOOR_LINE, FreeSpace
from room_fit.geometry import Axes, class_coords, class_normal
from room_fit.walls import Evidence, fit_walls, marks_from_walls, wall_confidence

AXES = Axes(math.radians(10))
RNG = np.random.default_rng(0)


def line_points(cls, t, a0, a1, n, cue, noise=0.01, dist=2.0):
    a = RNG.uniform(a0, a1, n)
    tt = t + RNG.normal(0, noise, n)
    return Evidence(
        cls=np.full(n, cls),
        t=tt,
        a=a,
        cue=np.full(n, cue, np.int8),
        dist=np.full(n, dist),
        frame=np.zeros(n, int),
        spot=np.zeros(n, int),
    )


def room_evidence(furniture=True):
    """A 4 x 3 m room centred on the origin, in the room's frame: |p·u| <= 2, |p·v| <= 1.5."""
    floor, ceil, band = [], [], []
    for cls, t, half in ((0, 2.0, 1.5), (1, 2.0, 1.5), (2, 1.5, 2.0), (3, 1.5, 2.0)):
        ceil.append(line_points(cls, t, -half, half, 600, CEILING_LINE))
        band.append(line_points(cls, t, -half, half, 3000, BAND, noise=0.03))
        if not (furniture and cls == 3):
            floor.append(line_points(cls, t, -half, half, 600, FLOOR_LINE))
    if furniture:
        # A bed along the class-3 wall: its side is 1.4 m in front of the wall, and its floor line
        # is all the camera sees at the bottom of that wall.
        floor.append(line_points(3, 0.1, -1.0, 1.0, 900, FLOOR_LINE))
        floor.append(line_points(3, 1.5, 1.2, 2.0, 150, FLOOR_LINE))
    return Evidence.concat(floor), Evidence.concat(ceil), Evidence.concat(band)


def test_fits_the_four_walls_and_not_the_bed():
    f, c, b = room_evidence()
    walls, report = fit_walls(AXES, f, c, b, None)
    assert sorted((w.cls, round(w.t, 2)) for w in walls) == [(0, 2.0), (1, 2.0), (2, 1.5), (3, 1.5)]
    rejected = [r for cr in report["classes"] for r in cr["candidates"] if r.get("rejected")]
    assert any(abs(r["t"] - 0.1) < 0.05 for r in rejected)  # the bed's side
    for w in walls:
        w.confidence = wall_confidence(w)
        assert w.confidence > 0.7


def test_free_space_rejects_a_front_with_nothing_else_behind_it():
    f = line_points(3, 0.1, -1.0, 1.0, 900, FLOOR_LINE)
    empty = Evidence.concat([f.take(np.zeros(len(f), bool))])
    # Free space crossing the band just beyond the front, as rays over furniture would.
    free = FreeSpace(origin=np.array([-5.0, -5.0]), cell=0.05, counts=np.full((200, 200), 5, np.int32))
    walls, _ = fit_walls(AXES, f, empty, empty, free)
    assert walls == []


def test_l_shape_keeps_both_walls_of_one_direction():
    # Class 1 (the +u side): an outer wall at t = 3 for v in [-1.5, 0.3], a notch wall at t = 1.2
    # for v in [0.5, 1.5].
    f = Evidence.concat(
        [line_points(1, 3.0, -1.5, 0.3, 500, FLOOR_LINE), line_points(1, 1.2, 0.5, 1.5, 400, FLOOR_LINE)]
    )
    empty = f.take(np.zeros(len(f), bool))
    walls, _ = fit_walls(AXES, f, empty, empty, None)
    assert sorted(round(w.t, 2) for w in walls) == [1.2, 3.0]


def test_confidence_drops_when_floor_and_ceiling_disagree():
    f, c, b = room_evidence(furniture=False)
    walls, _ = fit_walls(AXES, f, c, b, None)
    w = walls[0]
    sure = wall_confidence(w)
    w.t_ceil = w.t_floor + 0.2
    assert wall_confidence(w) < sure - 0.3


def test_marks_face_the_room():
    f, c, b = room_evidence()
    walls, _ = fit_walls(AXES, f, c, b, None)
    marks = marks_from_walls(AXES, walls, {0: np.zeros(2)})
    assert len(marks) == 4
    for m, w in zip(marks, walls):
        p = np.array([m["point"]["x"], m["point"]["z"]])
        cam = np.array([m["camera"]["x"], m["camera"]["z"]])
        assert (cam - p) @ class_normal(AXES, w.cls) > 0
        t, _ = class_coords(AXES, w.cls, p[None, :])
        assert t[0] == pytest.approx(w.t, abs=1e-3)
        assert m["axis"] == (1 if w.cls < 2 else 0)


def test_noisy_band_points_beyond_a_wall_do_not_make_it_furniture():
    # Floor and ceiling lines agree on the wall; band points from badly scaled frames sit 27 cm out
    # (seen on the live run with the small model).
    f = line_points(2, 1.3, -1.0, 1.0, 600, FLOOR_LINE)
    c = line_points(2, 1.3, -1.0, 1.0, 900, CEILING_LINE)
    b = line_points(2, 1.57, -1.0, 1.0, 4000, BAND, noise=0.05)
    walls, _ = fit_walls(AXES, f, c, b, None)
    assert [round(w.t, 2) for w in walls if w.kind == "boundary"] == [1.3]
