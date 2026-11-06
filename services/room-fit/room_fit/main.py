"""The Cloud Run job's entry point (and a local runner).

In Cloud Run, the callable `fitRoom` starts an execution with `SCAN_ID` and `OWNER_ID` as
environment overrides; the job reads `users/{OWNER_ID}/scans/{SCAN_ID}/` from the Storage bucket,
writes the panoramas and the debug bundle there, and moves `scanFits/{SCAN_ID}` to 'running' and
then 'done' (with the result) or 'failed' (with plain words).

Locally: python -m room_fit.main --local CAPTURE_DIR --out OUT_DIR
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import signal
import sys
import time
import traceback

from .capture import capture_folder
from .errors import MESSAGES, CaptureError

ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
TIME_BUDGET = float(os.environ.get("ROOM_FIT_TIME_BUDGET", "720"))  # seconds before optional steps stop

log = logging.getLogger("room-fit")


def _env_flag(name: str, default: bool = False) -> bool:
    v = os.environ.get(name)
    return default if v is None else v.strip().lower() in ("1", "true", "yes", "on")


def default_model():
    from .depth import MogeDepth

    return MogeDepth(os.environ.get("MOGE_CHECKPOINT", "Ruicheng/moge-2-vitl-normal"))


def run(store, status, owner_id: str | None, options, model_factory=default_model) -> int:
    from .pipeline import fit_capture

    attempt = int(os.environ.get("CLOUD_RUN_TASK_ATTEMPT", "0"))
    retries = int(os.environ.get("ROOM_FIT_MAX_RETRIES", "1"))
    last = attempt >= retries
    t0 = time.time()
    if not status.check_owner(owner_id):
        log.error("scanFits doc belongs to someone else; refusing")
        return 0

    def on_term(signum, frame):  # the task timed out or was cancelled
        if last:
            try:
                status.failed(MESSAGES["timeout"], {"code": "timeout", "attempt": attempt})
            except Exception:  # noqa: BLE001
                pass
        sys.exit(1)

    signal.signal(signal.SIGTERM, on_term)
    if status.running({"attempt": attempt, "execution": os.environ.get("CLOUD_RUN_EXECUTION", "local")}) is False:
        # "Try again" started a newer fit of this scan before this one began: nothing to do.
        log.info("superseded by a newer fit of this scan; stopping")
        return 0
    try:
        manifest_owner = json.loads(store.read("capture.json")).get("ownerId")
        if owner_id and manifest_owner and manifest_owner != owner_id:
            raise CaptureError("format", MESSAGES["format"], "manifest ownerId does not match")
        model = model_factory()
        options.deadline = t0 + TIME_BUDGET
        out = fit_capture(store, model, options)
        if status.done(out.result, out.info) is False:
            log.info("superseded by a newer fit of this scan: result not written")
            return 0
        log.info(
            "done in %.1f s: %d marks, %d spots", time.time() - t0, len(out.result["marks"]), len(out.result["spots"])
        )
        return 0
    except CaptureError as e:
        # The capture itself cannot be measured: no retry.
        log.warning("capture failed: %s", e)
        status.failed(e.message, {"code": e.code, "detail": e.detail, "seconds": round(time.time() - t0, 1)})
        return 0
    except Exception as e:  # noqa: BLE001
        log.error("fit crashed: %s\n%s", e, traceback.format_exc())
        info = {"code": "server", "detail": f"{type(e).__name__}: {e}"[:500], "attempt": attempt}
        if last:
            status.failed(MESSAGES["server"], info)
        else:
            status.running({**info, "retrying": True})
        return 1


def main(argv=None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stdout)
    ap = argparse.ArgumentParser(description="Fit a turn-around scan.")
    ap.add_argument("--local", help="a local capture folder instead of Storage")
    ap.add_argument("--out", help="where local runs write (default: the capture folder)")
    ap.add_argument("--no-panoramas", action="store_true")
    ap.add_argument("--openings", action="store_true")
    args = ap.parse_args(argv)

    from .pipeline import FitOptions
    from .store import FileStatus, FirestoreStatus, GcsStore, LocalStore

    options = FitOptions(
        openings=args.openings or _env_flag("ROOM_FIT_OPENINGS"),
        panoramas=not args.no_panoramas and _env_flag("ROOM_FIT_PANORAMAS", True),
        pano_width=int(os.environ.get("PANO_WIDTH", "4096")),
        log=log.info,
    )
    if args.local:
        out = args.out or args.local
        store = LocalStore(args.local, out=out)
        status = FileStatus(os.path.join(out, "scanfit.json"))
        return run(store, status, None, options)

    scan_id = os.environ.get("SCAN_ID", "")
    owner_id = os.environ.get("OWNER_ID", "")
    if not ID.match(scan_id) or not ID.match(owner_id):
        log.error("SCAN_ID and OWNER_ID must be set (got %r, %r)", scan_id, owner_id)
        return 2
    project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("PROJECT_ID")
    bucket = os.environ.get("BUCKET", "young-vista.firebasestorage.app")
    store = GcsStore(bucket, capture_folder(owner_id, scan_id), project=project)
    status = FirestoreStatus(scan_id, owner_id, project=project, run_id=os.environ.get("FIT_RUN_ID") or None)
    return run(store, status, owner_id, options)


if __name__ == "__main__":
    sys.exit(main())
