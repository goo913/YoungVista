"""Per-keyframe metric depth and normals.

`MogeDepth` runs MoGe-2 (MIT code and weights, microsoft/MoGe, `Ruicheng/moge-2-vitl-normal`) with
each frame's horizontal field of view from its fx. Its depth is "metric" but still off by a few
percent per frame; `scale.py` anchors every frame to the AR floor.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass

import numpy as np


@dataclass
class DepthMap:
    depth: np.ndarray  # (h, w) float32: camera z in the model's metres; nan where invalid
    normal: np.ndarray  # (h, w, 3) float32: unit normals in OpenCV camera axes (facing the camera)
    mask: np.ndarray  # (h, w) bool


def pick_device(prefer: str | None = None) -> str:
    import torch

    if prefer:
        return prefer
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


DEFAULT_CHECKPOINT = os.environ.get("MOGE_CHECKPOINT", "Ruicheng/moge-2-vitl-normal")


class MogeDepth:
    """MoGe-2 with normals. `checkpoint` is a local model.pt or a Hugging Face repo id."""

    def __init__(
        self,
        checkpoint: str = DEFAULT_CHECKPOINT,
        device: str | None = None,
        batch: int | None = None,
        num_tokens: int | None = None,
    ):
        import torch
        from moge.model.v2 import MoGeModel

        self.device = pick_device(device or os.environ.get("MOGE_DEVICE") or None)
        self.checkpoint = checkpoint
        # Fewer ViT tokens run faster on CPU (MoGe's default is its maximum, 3600 for MoGe-2).
        env_tokens = os.environ.get("MOGE_TOKENS")
        self.num_tokens = num_tokens or (int(env_tokens) if env_tokens else None)
        if self.device == "cpu":
            torch.set_num_threads(max(1, os.cpu_count() or 1))
        t0 = time.time()
        self.model = MoGeModel.from_pretrained(checkpoint).to(self.device).eval()
        self.load_seconds = time.time() - t0
        self.batch = batch or (4 if self.device == "cuda" else 1)
        self.fp16 = self.device in ("cuda", "mps")
        self._torch = torch

    @property
    def name(self) -> str:
        base = (
            os.path.basename(os.path.dirname(self.checkpoint)) if self.checkpoint.endswith(".pt") else self.checkpoint
        )
        return base.split("/")[-1]

    def __call__(self, images: list[np.ndarray], fov_x_deg: list[float]) -> list[DepthMap]:
        torch = self._torch
        out: list[DepthMap] = []
        for start in range(0, len(images), self.batch):
            chunk = images[start : start + self.batch]
            fovs = fov_x_deg[start : start + self.batch]
            same = all(im.shape == chunk[0].shape for im in chunk)
            groups = [list(range(len(chunk)))] if same else [[k] for k in range(len(chunk))]
            for g in groups:
                x = torch.stack(
                    [torch.from_numpy(chunk[k]).to(self.device).permute(2, 0, 1).float() / 255.0 for k in g]
                )
                fov = torch.tensor([fovs[k] for k in g], dtype=torch.float32, device=self.device)
                with torch.no_grad():
                    res = self.model.infer(x, fov_x=fov, num_tokens=self.num_tokens, use_fp16=self.fp16)
                depth = res["depth"].float().cpu().numpy()
                normal = res["normal"].float().cpu().numpy()
                mask = res["mask"].cpu().numpy().astype(bool)
                for b in range(len(g)):
                    d = depth[b].astype(np.float32)
                    m = mask[b] & np.isfinite(d) & (d > 0)
                    d[~m] = np.nan
                    n = normal[b].astype(np.float32)
                    out.append(DepthMap(depth=d, normal=n, mask=m))
        return out


class TruthDepth:
    """The harness's true depth and normals (resized to each image), optionally with a per-frame
    scale error and per-pixel noise, to test the steps after depth without the model."""

    name = "truth"
    device = "cpu"
    load_seconds = 0.0

    def __init__(self, truth_maps: list[tuple[np.ndarray, np.ndarray, np.ndarray]], scale_sigma=0.0, noise=0.0, seed=0):
        """`truth_maps`: per frame (depth (h, w), world normals (h, w, 3), camera R (3x3, OpenCV))."""
        self.maps = truth_maps
        self.scale_sigma = scale_sigma
        self.noise = noise
        self.rng = np.random.default_rng(seed)

    def __call__(self, images, fov_x_deg):
        import cv2

        out = []
        for im, (depth, normal_w, R) in zip(images, self.maps):
            h, w = im.shape[:2]
            d = cv2.resize(depth, (w, h), interpolation=cv2.INTER_NEAREST).astype(np.float32)
            nw = cv2.resize(normal_w.astype(np.float32), (w, h), interpolation=cv2.INTER_NEAREST)
            n = nw @ R  # world -> camera
            s = float(np.exp(self.rng.normal(0, self.scale_sigma))) if self.scale_sigma else 1.0
            if self.noise:
                d = d * (1 + self.rng.normal(0, self.noise, d.shape)).astype(np.float32)
            m = np.isfinite(d) & (d > 0)
            out.append(DepthMap(depth=(d * s).astype(np.float32), normal=n.astype(np.float32), mask=m))
        return out
