#!/usr/bin/env bash
# Builds the room-fit image with Cloud Build and deploys the Cloud Run job (docs/server.md).
#
#   services/room-fit/deploy.sh            # L4 GPU (default)
#   GPU=0 services/room-fit/deploy.sh      # CPU fallback with the small MoGe-2 model
#   SKIP_BUILD=1 TAG=abc123 services/room-fit/deploy.sh   # redeploy an image already built
#
# Runs gcloud as the owner's Google account that owns young-vista (CLAUDE.md).
set -euo pipefail

ACCOUNT="${ACCOUNT:-goochoi913@gmail.com}"
PROJECT="${PROJECT:-young-vista}"
PROJECT_NUMBER="${PROJECT_NUMBER:-525602773881}"
REGION="${REGION:-us-central1}"
JOB="${JOB:-room-fit}"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/jobs/room-fit"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TAG="${TAG:-$(git -C "$ROOT" rev-parse --short HEAD)-$(date +%Y%m%d%H%M)}"
GPU="${GPU:-1}"
G=(gcloud --account "$ACCOUNT" --project "$PROJECT")

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  # 1. Bundle the shared room solver (packages/core) so the job runs it with plain Node.
  "$ROOT/node_modules/.bin/esbuild" "$HERE/solver/solve.ts" --bundle --platform=node \
    --target=node22 --format=esm --outfile="$HERE/solver/dist/solve.mjs" --log-level=warning

  # 2. Build and push the image (previous image as cache).
  "${G[@]}" builds submit "$HERE" --region "$REGION" --config "$HERE/cloudbuild.yaml" \
    --substitutions "_IMAGE=$IMAGE,_TAG=$TAG"
fi

# 3. Deploy the job. GPU jobs need zonal redundancy off; 15-minute task timeout; one retry.
if [[ "$GPU" == "1" ]]; then
  # MoGe-2 ViT-L at full token count on the L4.
  SHAPE=(--cpu 8 --memory 32Gi --gpu 1 --gpu-type nvidia-l4 --no-gpu-zonal-redundancy)
  CHECKPOINT=/models/moge-2-vitl-normal/model.pt
  TOKENS=""
else
  # CPU fallback: the small MoGe-2 (ViT-S) at 1800 ViT tokens.
  SHAPE=(--cpu 8 --memory 32Gi --gpu 0)
  CHECKPOINT=/models/moge-2-vits-normal/model.pt
  TOKENS=1800
fi
"${G[@]}" run jobs deploy "$JOB" --region "$REGION" --image "$IMAGE:$TAG" \
  --service-account "room-fit@$PROJECT.iam.gserviceaccount.com" \
  "${SHAPE[@]}" --tasks 1 --parallelism 1 --max-retries 1 --task-timeout 15m \
  --set-env-vars "BUCKET=$PROJECT.firebasestorage.app,GOOGLE_CLOUD_PROJECT=$PROJECT,MOGE_CHECKPOINT=$CHECKPOINT,MOGE_TOKENS=$TOKENS,ROOM_FIT_MAX_RETRIES=1,ROOM_FIT_OPENINGS=${OPENINGS:-0},PANO_WIDTH=4096" \
  --labels "app=youngvista,component=room-fit"

# 4. The Cloud Functions runtime account (the callable fitRoom) may run the job with per-scan
#    environment overrides.
"${G[@]}" run jobs add-iam-policy-binding "$JOB" --region "$REGION" \
  --member "serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role roles/run.jobsExecutorWithOverrides >/dev/null

echo "Deployed $JOB with $IMAGE:$TAG (GPU=$GPU)."
