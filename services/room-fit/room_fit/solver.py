"""Runs the shared room solver (packages/core, bundled as solver/solve.mjs) on the fitted marks, so
the server sees the same outline the phone will build."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_BUNDLE = os.environ.get("ROOM_FIT_SOLVER", str(HERE.parent / "solver" / "dist" / "solve.mjs"))


def solve_room(
    axes_angle: float, floor_y: float, ceiling_height: float | None, marks: list[dict], bundle: str = DEFAULT_BUNDLE
) -> dict | None:
    """The solver's answer ({ok, points, walls, area, ...} or {ok: False, error, reason}); None when
    Node or the bundle is missing."""
    node = shutil.which("node")
    if not node or not Path(bundle).exists():
        return None
    payload = json.dumps({"axesAngle": axes_angle, "floorY": floor_y, "ceilingHeight": ceiling_height, "marks": marks})
    try:
        res = subprocess.run([node, bundle], input=payload, capture_output=True, text=True, timeout=30, check=True)
        return json.loads(res.stdout)
    except (subprocess.SubprocessError, json.JSONDecodeError) as e:
        return {"ok": False, "error": "solver", "reason": str(e)[:300]}
