# room-fit: the turn-around scan's Cloud Run job (docs/server.md). Built by deploy.sh with Cloud
# Build; runs on an NVIDIA L4 (driver 580, CUDA 13.0) or, as a fallback, on CPU.
FROM mirror.gcr.io/library/python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates libglib2.0-0 libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Node runs the shared room solver (packages/core, bundled into solver/dist/solve.mjs by deploy.sh).
COPY --from=mirror.gcr.io/library/node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node

# PyTorch built for CUDA 13.0 (it also runs on CPU).
RUN pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cu130

COPY requirements.txt /tmp/requirements.txt
RUN pip install -r /tmp/requirements.txt

# MoGe-2 (MIT) and its geometry helper (MIT), pinned. Their other dependencies are for training and
# the demo app, so they are left out.
RUN pip install --no-deps \
    "moge @ git+https://github.com/microsoft/MoGe.git@07444410f1e33f402353b99d6ccd26bd31e469e8" \
    "utils3d @ git+https://github.com/EasternJournalist/utils3d.git@3fab839f0be9931dac7c8488eb0e1600c236e183"

# Weights baked into the image (MIT, checked on Hugging Face): ViT-L for the GPU, ViT-S for the CPU
# fallback. Nothing is downloaded at run time.
RUN python -c "from huggingface_hub import hf_hub_download as get; \
get('Ruicheng/moge-2-vitl-normal', 'model.pt', revision='cb0e8bbd6b1e243589717c78e750b1ba4c093acf', local_dir='/models/moge-2-vitl-normal'); \
get('Ruicheng/moge-2-vits-normal', 'model.pt', revision='26b477f41595707c5db6770294c0d1721e8ed4ed', local_dir='/models/moge-2-vits-normal')"

ENV HF_HUB_OFFLINE=1 \
    MOGE_CHECKPOINT=/models/moge-2-vitl-normal/model.pt \
    ROOM_FIT_SOLVER=/app/solver/solve.mjs

WORKDIR /app
COPY solver/dist/solve.mjs /app/solver/solve.mjs
COPY room_fit /app/room_fit

ENTRYPOINT ["python", "-m", "room_fit.main"]
