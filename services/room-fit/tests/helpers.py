"""Small rendered captures for tests (low resolution, so a whole fit runs in seconds)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

import synth
from room_fit.depth import TruthDepth
from room_fit.geometry import Intrinsics, Pose, matrix_from_column_major

LOW_RES = Intrinsics(
    fx=1452 / 6, fy=1452 / 6, cx=(962.3 + 0.5) / 6 - 0.5, cy=(717.6 + 0.5) / 6 - 0.5, width=320, height=240
)


def small_capture(
    tmp: Path, room_name: str = "small", errors: synth.ArErrors | None = None
) -> tuple[Path, TruthDepth, dict]:
    room = next(r for r in synth.demo_rooms() if r.name == room_name)
    errors = errors or synth.ArErrors(0, 0, 0, 0)
    synth.write_capture(room, tmp, placement=synth.Placement(), errors=errors, K=LOW_RES, truth_scale=1, log=None)
    manifest = json.loads((tmp / "capture.json").read_text())
    maps = []
    for f in manifest["frames"]:
        t = np.load(tmp / "truth" / f"{f['index']:03d}.npz")
        pose = Pose.from_arkit(matrix_from_column_major(f["transform"]))
        maps.append((t["depth"], t["normal"].astype(np.float32), pose.R))
    truth = json.loads((tmp / "truth.json").read_text())
    return tmp, TruthDepth(maps), truth
