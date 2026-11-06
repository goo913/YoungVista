"""End to end on a small rendered capture (low resolution, true depth): the fit, the result in the
contract's shape, the panorama and debug files, and the job runner's status document."""

import json

import numpy as np
import pytest

from helpers import small_capture
from room_fit import solver
from room_fit.main import run
from room_fit.pipeline import FitOptions, fit_capture
from room_fit.store import FileStatus, LocalStore

HAS_SOLVER = solver.solve_room(0.0, 0.0, None, []) is not None


@pytest.fixture(scope="module")
def capture(tmp_path_factory):
    return small_capture(tmp_path_factory.mktemp("cap"))


def test_fit_matches_the_room(capture, tmp_path):
    cap_dir, model, truth = capture
    store = LocalStore(cap_dir, out=tmp_path)
    out = fit_capture(store, model, FitOptions(pano_width=512, log=lambda *a: None))
    r = out.result
    assert set(r) == {"axesAngle", "floorY", "ceilingHeight", "marks", "openings", "spots"}
    assert len(r["marks"]) == 4
    for m in r["marks"]:
        assert set(m) == {"id", "point", "camera", "axis", "confidence"}
        assert m["axis"] in (0, 1) and 0 <= m["confidence"] <= 1
    assert r["ceilingHeight"] == pytest.approx(truth["ceilingHeight"], abs=0.04)
    # Panorama and debug bundle written next to the capture.
    assert r["spots"] and r["spots"][0]["storagePath"].endswith("pano/spot-0.jpg")
    assert r["spots"][0]["width"] == 2 * r["spots"][0]["height"]
    assert (tmp_path / "pano" / "spot-0.jpg").exists()
    for name in ("cloud.ply", "cues.png", "fit.json"):
        assert (tmp_path / "out" / name).exists()
    if HAS_SOLVER:
        assert out.room["ok"]
        true_len = sorted(w["length"] for w in truth["walls"])
        fit_len = sorted(w["length"] for w in out.room["walls"])
        assert np.allclose(fit_len, true_len, rtol=0.03)


def test_job_runner_writes_done_or_plain_failure(capture, tmp_path):
    cap_dir, model, _ = capture
    status = FileStatus(tmp_path / "scanfit.json")
    code = run(LocalStore(cap_dir, out=tmp_path), status, None, FitOptions(panoramas=False, debug=False), lambda: model)
    assert code == 0
    doc = json.loads((tmp_path / "scanfit.json").read_text())
    assert doc["status"] == "done" and len(doc["result"]["marks"]) == 4

    # A capture without a floor fails in plain words, without naming any model or provider.
    bad = tmp_path / "bad"
    bad.mkdir()
    m = json.loads((cap_dir / "capture.json").read_text())
    m["floor"]["y"] = 5.0
    (bad / "capture.json").write_text(json.dumps(m))
    status = FileStatus(bad / "scanfit.json")
    assert run(LocalStore(bad), status, None, FitOptions(panoramas=False, debug=False), lambda: model) == 0
    doc = json.loads((bad / "scanfit.json").read_text())
    assert doc["status"] == "failed"
    assert "floor" in doc["error"].lower()
    assert not any(w in doc["error"].lower() for w in ("moge", "gemini", "google", "vertex", "model"))
