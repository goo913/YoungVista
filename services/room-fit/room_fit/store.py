"""Where a scan's files live (a Storage folder, or a local folder for the harness), and where the
fit's status goes (`scanFits/{scanId}`, or a JSON file locally)."""

from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def _now_ms() -> int:
    """Epoch milliseconds, like the callable's `info.queuedAt` (Date.now())."""
    return int(time.time() * 1000)


class LocalStore:
    def __init__(self, root: str | Path, out: str | Path | None = None):
        self.root = Path(root)
        self.out = Path(out) if out else self.root
        self.folder = str(self.root)

    def read(self, rel: str) -> bytes:
        return (self.root / rel).read_bytes()

    def exists(self, rel: str) -> bool:
        return (self.root / rel).exists()

    def read_many(self, rels: list[str]) -> list[bytes | None]:
        return [self.read(r) if self.exists(r) else None for r in rels]

    def write(self, rel: str, data: bytes, content_type: str) -> str:
        p = self.out / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return str(p)

    def full_path(self, rel: str) -> str:
        return f"{self.folder}/{rel}"


class GcsStore:
    """A scan folder in the Firebase Storage bucket (Admin access through the job's account)."""

    def __init__(self, bucket: str, folder: str, project: str | None = None):
        from google.cloud import storage

        self.client = storage.Client(project=project)
        self.bucket = self.client.bucket(bucket)
        self.folder = folder.rstrip("/")

    def _blob(self, rel: str):
        return self.bucket.blob(f"{self.folder}/{rel}")

    def read(self, rel: str) -> bytes:
        return self._blob(rel).download_as_bytes(timeout=60)

    def exists(self, rel: str) -> bool:
        return self._blob(rel).exists()

    def read_many(self, rels: list[str]) -> list[bytes | None]:
        from google.api_core.exceptions import NotFound

        def get(rel):
            try:
                return self.read(rel)
            except NotFound:
                return None

        # The client keeps 10 connections per host; more threads only churn connections.
        with ThreadPoolExecutor(max_workers=8) as pool:
            return list(pool.map(get, rels))

    def write(self, rel: str, data: bytes, content_type: str) -> str:
        blob = self._blob(rel)
        blob.cache_control = "private, max-age=3600"
        blob.upload_from_string(data, content_type=content_type, timeout=120)
        return f"{self.folder}/{rel}"

    def full_path(self, rel: str) -> str:
        return f"{self.folder}/{rel}"


class FileStatus:
    """The fit document as a local JSON file (harness and local runs)."""

    def __init__(self, path: str | Path, owner_id: str = "local"):
        self.path = Path(path)
        self.doc: dict = {"ownerId": owner_id, "status": "queued", "info": {}}

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.doc, indent=1))

    def check_owner(self, owner_id: str) -> bool:
        return True

    def running(self, info: dict):
        self.doc.update(status="running")
        self.doc["info"].update(info)
        self._save()

    def done(self, result: dict, info: dict):
        self.doc.update(status="done", result=result)
        self.doc.pop("error", None)
        self.doc["info"].update(info)
        self._save()

    def failed(self, error: str, info: dict):
        self.doc.update(status="failed", error=error)
        self.doc.pop("result", None)
        self.doc["info"].update(info)
        self._save()


def plain(value):
    """Firestore-ready values: numpy numbers and arrays become Python ones, tuples become lists."""
    try:
        import numpy as np
    except ImportError:  # pragma: no cover
        np = None
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    if np is not None:
        if isinstance(value, np.ndarray):
            return [plain(v) for v in value.tolist()]
        if isinstance(value, np.generic):
            return value.item()
    return value


def superseded(doc: dict | None, run_id: str | None) -> bool:
    """A newer fit of the same scan owns the document: the callable gave it another `info.runId`."""
    if not run_id or not doc:
        return False
    current = (doc.get("info") or {}).get("runId")
    return bool(current) and current != run_id


class FirestoreStatus:
    """`scanFits/{scanId}`: the callable created it ({ownerId, status: 'queued', info.runId}); the
    job moves it to 'running' and then 'done' or 'failed'. Only the server writes it. Every write
    is a transaction that first checks the document still belongs to this run (`FIT_RUN_ID`): after
    a "Try again", an older execution that is still going writes nothing."""

    def __init__(self, scan_id: str, owner_id: str, project: str | None = None, run_id: str | None = None):
        from google.cloud import firestore

        self._fs = firestore
        self.client = firestore.Client(project=project)
        self.ref = self.client.collection("scanFits").document(scan_id)
        self.owner_id = owner_id
        self.run_id = run_id or None
        self.stale = False

    def check_owner(self, owner_id: str) -> bool:
        snap = self.ref.get()
        if not snap.exists:
            return True
        return (snap.to_dict() or {}).get("ownerId") == owner_id

    def _info(self, info: dict) -> dict:
        return {f"info.{k}": plain(v) for k, v in info.items()}

    def _write(self, fields: dict) -> bool:
        fs = self._fs

        @fs.transactional
        def write(tx) -> bool:
            snap = self.ref.get(transaction=tx)
            doc = snap.to_dict() if snap.exists else None
            if superseded(doc, self.run_id):
                return False
            if doc is None:
                # Started by hand (no callable): create the document.
                info = {k[5:]: v for k, v in fields.items() if k.startswith("info.")}
                base = {k: v for k, v in fields.items() if not k.startswith("info.") and v is not fs.DELETE_FIELD}
                tx.set(self.ref, {"ownerId": self.owner_id, **base, "info": info})
            else:
                tx.update(self.ref, fields)
            return True

        ok = write(self.client.transaction())
        if not ok:
            self.stale = True
        return ok

    def running(self, info: dict):
        return self._write(
            {"status": "running", "error": self._fs.DELETE_FIELD, **self._info({**info, "startedAt": _now_ms()})}
        )

    def done(self, result: dict, info: dict):
        return self._write(
            {
                "status": "done",
                "result": plain(result),
                "error": self._fs.DELETE_FIELD,
                **self._info({**info, "finishedAt": _now_ms()}),
            }
        )

    def failed(self, error: str, info: dict):
        return self._write(
            {
                "status": "failed",
                "error": error,
                "result": self._fs.DELETE_FIELD,
                **self._info({**info, "finishedAt": _now_ms()}),
            }
        )
