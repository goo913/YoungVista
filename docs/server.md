# The server side of the turn-around scan

How a turn-around scan is measured: the callable function `fitRoom`, the Cloud Run job `room-fit`
that does the work, how to deploy them, the permissions they need, what a run costs, and how the
accuracy is tested. The shared format (what the phone uploads, what the server writes) is
`packages/core/src/turn-scan.ts`; the reasoning behind the method is
`docs/research/room-capture-and-ai.md` (Q1 and Q3).

## What happens after a scan

1. The phone uploads the keyframes (`kf/000.jpg` …) and then `capture.json` to
   `users/{uid}/scans/{scanId}/` in Storage: 72 keyframes per spot (three rings at −35°, 0° and
   +35°, one per 15° bin), full-size JPEGs in sensor orientation (1920×1440, or the 16:9 video
   format when the 4:3 switch does not work), each with its own intrinsics; one or two spots.
2. The phone calls **`fitRoom({ scanId })`** (Cloud Functions, 2nd gen, `us-central1`;
   `functions/src/fit-room.ts`; its own region, memory, timeout and instance options, because
   `setGlobalOptions` in `index.ts` runs after imported modules define their functions). It:
   - needs a signed-in user (Firebase Auth; App Check is not enforced: the app has none yet);
   - reads `capture.json` from the caller's own folder and checks that it is theirs (`ownerId`),
     has the same `scanId` and a known `version`;
   - refuses a `scanFits/{scanId}` that belongs to someone else;
   - writes `scanFits/{scanId}` as `{ ownerId, status: 'queued', info: { queuedAt, runId } }`
     before anything else (the phone is already listening);
   - starts an execution of the Cloud Run job `room-fit` with `SCAN_ID`, `OWNER_ID` and
     `FIT_RUN_ID` as environment overrides, and returns at once with `{ scanId, status: 'queued',
     runId }`.

   **Every call starts again**, whatever the document says (the phone's "Try again" after a
   failure, or a fit that seems stuck): the document is reset to `queued` with a new `runId`. The
   job writes only while `info.runId` is its own (each write is a Firestore transaction), so an
   older execution that is still going stops touching the document. Scan ids are 8–128 characters
   of `A-Z a-z 0-9 _ -`. Errors are `HttpsError`s in plain words (`not-found` while the upload is
   not complete, `permission-denied`, `failed-precondition`, and `unavailable` if the job cannot
   start, in which case the document is also set to `failed`).
3. The job moves the document to `running`, then to `done` with `result`, or to `failed` with
   `error` (plain words for the user; never naming a model or a provider). `info` carries timings,
   model and code versions, per-wall details and the debug paths, for the team.

## The job, step by step (`services/room-fit/room_fit/`)

| Step | Module | What it does |
| --- | --- | --- |
| Load and validate | `capture.py`, `pipeline.py` | Parses the manifest (column-major ARKit transforms, per-frame intrinsics) and decodes each JPEG as stored (EXIF orientation ignored). Fails the scan, in plain words, for: an unknown version; more than a third of frames with limited tracking (limited frames are dropped); a ring of a spot with a gap over 35° between neighbouring keyframes (one keyframe per 15° bin puts neighbours up to 30° apart; 35° means part of the turn is missing); no floor (the AR floor must be 0.6–2.3 m below the cameras); keyframes missing or not the size the intrinsics say. |
| Axes | `geometry.py` | ARKit cameras look down −Z with +Y up; OpenCV (and the depth model) look down +Z with +Y down, so the camera-to-world rotation's y and z columns are negated. Checked by floor reprojection: pixels whose normals face world-up must lie below the horizon (median agreement at least 0.6, else the scan fails as "camera data doesn't line up"). The phone's `yawDeg`/`pitchDeg` are compared with the transforms too (a warning). |
| Depth | `depth.py` | MoGe-2 (`microsoft/MoGe`, MIT; weights `Ruicheng/moge-2-vitl-normal` and `-vits-normal`, MIT on Hugging Face) on every keyframe at 960 px wide, with `fov_x` from that frame's fx: metric depth plus normals. |
| Scale | `scale.py` | Every frame that sees floor gets its scale from the ratio of true depth (its ray meeting the AR floor plane) to predicted depth over its up-facing pixels. Furniture tops also face up but give larger ratios, so the floor is the lowest sizeable cluster (other clusters are kept as alternatives). Frames without floor take their scale from overlap: a joint least squares in log scale over the anchors and pairwise overlap ratios (Cauchy loss). An anchor that disagrees with its neighbours is swapped for a cluster that agrees, or dropped. Once the ceiling is measured, ceiling anchors are added and the scales solved again. Frames more than 15% from the median scale are left out of fusion, band points and free space; they still give junction rays, which do not depend on the scale. |
| Fuse | `cloud.py` | Points of all trusted frames, voxelised at 3 cm, with normals and colours. |
| Ceiling | `cloud.py`, `walls.py` | RANSAC on downward-facing points above 1.9 m (level planes only). Then, like the tap flow's `measureCeiling` but over thousands of pixels: ceiling-junction rays are cast onto the walls found by their floor lines; their median height is the ceiling when it agrees tightly (spread under 6 cm), else the RANSAC plane. |
| Yaw | `cloud.py`, `pipeline.py` | The peak of horizontal wall-normal directions modulo 90°, refined within ±2.5° so that floor-line points line up sharpest. |
| Cues | `cues.py` | (a) floor-line rays: junctions of floor and vertical pixels, cast onto the AR floor plane (scale-free, like a tap); (b) ceiling-line rays, cast onto the ceiling; (c) band points: vertical surfaces between 1.3 m and 10 cm under the ceiling; (d) free space: floor-plan cells crossed by camera-to-point rays. |
| Fit | `walls.py` | Per wall direction, junction offsets are clustered and candidates taken outermost first. A candidate that mostly stands in front of an accepted wall is furniture; so is one the room is seen past (band points 0.2–2.6 m further out, or free space just beyond), unless its own ceiling line is seen (furniture never meets the ceiling). Band-only walls fill stretches with no junctions. Each wall's line is the inverse-variance weighted median of its junction points: a point at distance d from a camera h above the line errs by about (d² + h²)/h per radian of tilt, so near views count most. |
| Confidence | `walls.py` | From floor-line against ceiling-line agreement (or against band points when only one line was seen), the spread of the supporting points, how much of the wall was seen against its length in the solved room, free space beyond it, how far away it was seen from and, for band-only walls, the frames' scale spread. Band-only walls stay under 0.5 (`LOW_CONFIDENCE`), so the phone asks for a mark. |
| Marks | `walls.py`, `solver.py` | One `FittedMark` per wall (ids `w0`, `w1`, …) in the middle of what was seen, `camera` at the spot that saw it most. The marks go through the shared solver (`packages/core`: `fitMarks`, `groupWallMarks`, `solveRoomLeavingOut`, bundled into `solver/dist/solve.mjs` and run with Node), so the server sees the outline the phone will build; wall lengths feed the confidences. |
| Openings (optional) | `openings.py` | Behind `ROOM_FIT_OPENINGS=1` (off by default). Up to 16 level keyframes go to an AI model on Vertex AI (`gemini-3.8-flash`, `global` endpoint, thinking off, JSON boxes on a 0–1000 grid; the job's account). Each box's edges are cast onto the wall its centre ray meets, and boxes of the same wall and kind are merged by the medians of the edges not cut off by the frame. |
| Panoramas | `panorama.py` | One 4096×2048 equirectangular JPEG per spot at `pano/spot-{n}.jpg` (`image/jpeg`, kept under 10 MB for the client upload rule): every panorama ray from the spot's mean camera position is cast onto the solved room (walls, floor, ceiling) and sampled from the keyframes whose rays to that point are most nearly parallel, with per-frame gain compensation and feathered seams; the floor patch underfoot and the ceiling cap are filled from the colours around them. Layout as `panoramaDirection` (packages/core `tour.ts`): column u looks along heading `yawDeg − (u − 0.5) × 360°` (heading `atan2(x, z)` in the scan's world), row v at pitch `(0.5 − v) × 180°`, top row straight up; `position` is the camera centre in world metres. |
| Debug bundle | `debug.py` | `out/cloud.ply` (fused points with normals and colours), `out/cues.png` (top-down: free space grey, floor-line points blue, ceiling-line red, band green, walls black with confidences, the solved outline orange) and `out/fit.json` (the whole report). |

A capture that cannot be measured ends as `failed` with the user's message and no retry. Anything
unexpected exits non-zero, so Cloud Run retries once; the last attempt writes `failed`. A task that
is stopped (the 15-minute timeout) writes `failed` from its SIGTERM handler on the last attempt.
After 12 minutes the optional steps (openings, panoramas, debug) are skipped.

### What the job adds to the contract

Only `info` fields (free-form in `ScanFitDoc`): `queuedAt`, `runId` and `execution` (from the
callable), `attempt`, `startedAt`, `finishedAt` (epoch ms), `code` and `detail` on failures,
`version`, `model`, `device`, `capture` (mode, video format, image sizes, yaw gaps, camera
height), `framesUsed`, `axesCheck`, `scale`, `frameScales`, `ceiling`, `yawStrength`, `cues`,
`walls` (per wall: cue offsets and counts, spread, seen length, length, distance, confidence),
`solve`, `openings`, `panoramas`, `timings`, `debug`. `result` is exactly the contract's.

## Hosting

- **Job:** `room-fit`, `us-central1`, 1 task, parallelism 1, 1 retry, 15-minute task timeout,
  service account `room-fit@young-vista.iam.gserviceaccount.com`.
- **Image:** `us-central1-docker.pkg.dev/young-vista/jobs/room-fit` (Artifact Registry repository
  `jobs`): Python 3.12, PyTorch 2.14.1 built for CUDA 13.0 (it also runs on CPU), MoGe-2 pinned to
  commit `07444410`, both weights baked in (ViT-L for the GPU, ViT-S for the CPU), Node 22 for the
  solver. About 4.7 GB.
- **GPU or CPU: today it runs on CPU.** The project has no Cloud Run L4 quota in `us-central1` (0,
  with and without zonal redundancy; the automatic first-deployment grant did not happen), so a GPU
  deployment fails with "You do not have quota for using GPUs without zonal redundancy". The job
  is deployed as the fallback: **8 vCPU, 32 GiB, no GPU, MoGe-2 ViT-S at 1800 tokens**. To move to
  the GPU shape (one L4, 8 vCPU, 32 GiB, zonal redundancy off, ViT-L at full resolution), the
  owner requests quota at g.co/cloudrun/gpu-quota ("Total Nvidia L4 GPU allocation without zonal
  redundancy" for Cloud Run, `us-central1`, 1–3 GPUs), then runs `services/room-fit/deploy.sh`
  (GPU is its default).

## Deploy

As the owner's Google account (CLAUDE.md), from the repository root, after `npm ci`:

```sh
GPU=0 services/room-fit/deploy.sh      # build with Cloud Build and deploy the CPU fallback (today)
services/room-fit/deploy.sh            # build and deploy on an L4 (needs the GPU quota)
SKIP_BUILD=1 TAG=<tag> GPU=0 services/room-fit/deploy.sh   # redeploy an image already built
OPENINGS=1 GPU=0 services/room-fit/deploy.sh               # with doors and windows switched on
```

`deploy.sh` bundles the solver with esbuild, runs `gcloud builds submit` (regional Cloud Build,
`cloudbuild.yaml`: the previous image is pulled as cache, so a code-only build takes about two
minutes), deploys with `gcloud run jobs deploy`, and grants the functions' account the right to
run the job. The functions themselves deploy with GitHub Actions on every push to `main`, as
before. To run one scan by hand (the document is created if the callable did not):

```sh
gcloud --account goochoi913@gmail.com --project young-vista run jobs execute room-fit \
  --region us-central1 --update-env-vars SCAN_ID=<scanId>,OWNER_ID=<uid> --wait
```

## Permissions

| Who | Role | On | Why |
| --- | --- | --- | --- |
| `room-fit@young-vista.iam.gserviceaccount.com` (the job) | Storage Object User (`roles/storage.objectUser`) | bucket `young-vista.firebasestorage.app` | read captures, write panoramas and the debug bundle |
| same | Cloud Datastore User (`roles/datastore.user`) | project | write `scanFits/{scanId}` |
| same | Vertex AI User (`roles/aiplatform.user`) | project | doors and windows (only when switched on) |
| `525602773881-compute@developer.gserviceaccount.com` (the Cloud Functions runtime, which runs `fitRoom`) | Cloud Run Jobs Executor With Overrides (`roles/run.jobsExecutorWithOverrides`: `run.jobs.run`, `run.jobs.runWithOverrides`, `run.executions.cancel`) | job `room-fit` | start an execution with per-scan environment overrides |

**CI note:** the GitHub Actions deployer (`github-deployer@`) needs nothing new: `fitRoom` deploys
like any function, and its new npm dependency (`@google-cloud/run`) installs in Cloud Build. The
job is deployed by hand with `deploy.sh` as the owner; CI does not build or deploy it, and the
Python tests are not in CI yet.

## Cost and latency (measured on the deployed CPU job)

Two live runs of a synthetic 72-keyframe bedroom uploaded under a test user (since deleted):

| | Run 1 (new image) | Run 2 |
| --- | --- | --- |
| `fitRoom`'s job start (Cloud Run Admin API) | 0.5 s | 0.6 s |
| `queued` → `running` (instance, image import, Python start) | 3 min 9 s (image import 1 min 23 s) | 1 min 26 s |
| `running` → `done` | 4 min 11 s | 4 min 30 s |
| of which depth (ViT-S, 72 frames, 8 vCPU) | 165 s | 180 s |
| of which scale, cues, fit, ceiling re-anchoring | 79 s | 74 s |
| of which panorama (4096×2048) and debug bundle | 12 s | 13 s |
| Execution, start to completion | 5 min 56 s | 5 min 51 s |

Cost (Cloud Run rates checked in the research on 2026-11-06: $0.000018 per vCPU-second and
$0.000002 per GiB-second; jobs bill the whole instance lifetime, at least a minute): 8 vCPU and
32 GiB cost $0.000208 per second, so a one-spot scan is about **$0.06–0.07** (5 min 50 s billed at
most). Two spots double the frames: about 8–9 minutes and $0.11–0.12, still inside the 15-minute
timeout. The three test executions of this work cost about $0.22; with the image builds and AI
calls the whole test spend was under $1, plus about $0.50 a month to keep the image (about 5 GB of
layers) in Artifact Registry.

On the GPU shape (not measured: no quota) the depth step should shrink to seconds; the other CPU
steps (about 75 s) and the start-up would remain, so about 2.5 minutes and $0.05–0.06 per spot at
$0.000395 per second (L4 without zonal redundancy plus 8 vCPU and 32 GiB).

Ways to cut latency, not done yet: a CPU-only image for the fallback (no CUDA libraries, ViT-S
only: about a third of the size, so a faster image import), fewer frames in the pairwise scale
step, and the GPU quota.

## Accuracy

### The harness (`services/room-fit/harness/`)

`synth.py` renders turn-around captures of rooms with known geometry, in the upload format: a
3.6 × 4.2 m bedroom (bed along a wall, wardrobe 2 m tall, desk, chair, nightstand), a 2.9 × 3.2 m
small bedroom (walls under 1.5 m away), an L-shaped living room (5.4 × 4.6 m less a 2.2 × 1.8 m
corner, two spots) and a 3.3 × 6.2 m long room (two spots). Ceilings 2.45–2.7 m; textured floor,
walls and ceiling; doors, windows, pictures, baseboards; lamp lighting with furniture shadows and
dark inner corners; the camera about 1.4 m up, an arm's length (24 cm) in front of the turning
axis; three landscape rings at −35°, 0° and +35°, one keyframe per 15° (±2°), small tilt and roll;
iPhone 15 intrinsics (1920×1440, fx 1452 px; or 1920×1080 for the 16:9 format). What the phone
reports carries AR errors: the floor plane 1 cm high, 0.2° orientation noise per frame, 5 mm
position noise and a 0.3° heading drift; the **hard** set has 2.5 cm, 0.5°, 15 mm and 1.5°. Wall
lengths come from the room the phone would build (the shared solver).

```sh
cd services/room-fit
python harness/run.py render OUT [--size 1920x1080]    # renders the four rooms (cached)
python harness/run.py fit OUT --depth moge --depth-cache CACHE           # MoGe-2 ViT-L
python harness/run.py fit OUT --depth moge --device cpu --tokens 1800 \
  --checkpoint <moge-2-vits-normal/model.pt> --depth-cache CACHE         # the CPU fallback
python harness/run.py fit OUT --depth truth            # true depth: everything after depth
python harness/run.py repose HARD --src OUT            # the same frames with larger AR errors
python harness/real_video.py VIDEO.MOV OUT             # MoGe-2 on real frames (no poses)
```

Results, wall-length errors over 18 walls (4 rooms, 6 spots), all rooms closed:

| Depth | AR errors | Median | 90th percentile | Worst | Ceiling |
| --- | --- | --- | --- | --- | --- |
| MoGe-2 ViT-L | normal | 0.45% | 0.66% | 0.67% | −1.3 to −1.6 cm |
| MoGe-2 ViT-S, 1800 tokens (deployed) | normal | 0.41% | 0.87% | 1.51% | −1.1 to −1.6 cm |
| MoGe-2 ViT-L | hard | 1.02% | 2.11% | 4.4% | −2.5 to −4.7 cm |
| MoGe-2 ViT-S, 1800 tokens (deployed) | hard | 1.54% | 2.76% | 3.29% | −3.3 to −5.4 cm |

In the 16:9 format (1920×1080, the rings overlap by only about 6°) the deployed ViT-S closes both
rooms tried (the bedroom and the L-shaped room, 10 walls): median 0.30%, 90th percentile 0.92%,
worst 1.42%, ceiling −0.9 and −1.4 cm (ViT-L: 0.42%, 0.54%, 0.77%). The small model's own scale wanders: its median correction
is 0.80 with a 20% spread, so about half its frames fall outside the 15% band and are left out of
fusion, band points and free space; the walls still come out right because every frame's junction
rays are kept and the ceiling is measured from rays.

On the hard set the one wall placed far off (the L-room's 4.6 m wall, 15 cm out) is the only one
under 0.5 confidence with either model, so the phone would ask for a mark on it. The live run on
the deployed job (the bedroom, run 2) gave 3.593 and 4.185 m for 3.600 and 4.200 m (−0.19% and
−0.36%), area −0.55%, ceiling −1.1 cm. These are synthetic rooms: real captures will do worse
(see below).

### Real iPhone frames (no poses)

The owner's bedroom video (`IMG_4639.MOV`, iPhone 15, 5 s, portrait, cluttered: bed, desk, chair, a
person, blinds, two doors) has no AR poses, so it cannot be measured against a tape. `real_video.py`
runs MoGe-2 ViT-L on 24 of its frames (field of view estimated by the model: 45–64° across the
narrow side) and checks what the fit relies on:

- **Surfaces separate cleanly.** Floor, ceiling, wall above furniture height and furniture come
  apart on every frame (`overlay.jpg`); the floor is flat to 0.6 cm RMS and walls stand square to it
  within 1.5° (median). Wall above 1.3 m covers about a quarter of each frame (median 24%), so the
  band and ceiling-line cues have plenty to work with behind the bed and desk.
- **The model's own scale wanders, which is why each frame is anchored.** The camera height it
  implies has a median of 1.30 m but spreads 17% across frames (0.98–1.57 m, p10–p90). With the
  phone's intrinsics the spread should be smaller, but that is not measured.
- **A bed top is a big up-facing plane.** Taking the largest up-facing plane as the floor (as a
  first version of this check did) takes the mattress for the floor in frames that look down at
  the bed; the pipeline instead takes the lowest sizeable cluster against the AR floor, and a unit
  test covers a bed filling most of the view.
- **Floor and ceiling come out parallel** (within 5°, median 2.4°) in 70% of the frames that show
  both; the rest are close-ups of doors and blinds, where the "ceiling" is the top of a door frame.
  The job only takes ceiling pixels with AR gravity and above 1.7–1.9 m, so these do not reach it.

### Tests

`cd services/room-fit && python -m pytest` (needs the Python packages of the Dockerfile; the
solver checks run when `solver/dist/solve.mjs` has been built): geometry and axis conventions,
manifest checks, floor anchoring with a bed filling the view, the joint scale solve, the wall fit
(furniture rejected, L shapes, noisy band points behind a wall, confidences, marks facing the
room), openings merging, the panorama layout against `panoramaDirection` and a stitched panorama
against a ray-traced one, the JPEG size cap, the run-id rule, and a whole low-resolution fit plus
the job runner's status document. The callable has vitest tests in
`functions/test/fit-room.test.ts`.

## Not proven yet

- **Real captures.** Nothing here has run on a real turn-around capture from the phone: the
  numbers above are synthetic renders, which are cleaner than real rooms (exact intrinsics, flat
  walls, no motion blur, no auto-exposure, no glass or mirrors, no real ARKit drift). The research's
  estimate (median 3–6%, 90th percentile about 10%) still has to be checked against a laser meter
  on real rooms (`docs/research/room-capture-and-ai.md`, "How to measure it").
- **ARKit itself:** how well the AR floor height and the poses hold during a body turn, and whether
  ViroReact's world matches the recorded transforms. The hard set assumes 2.5 cm, 0.5° and 1.5°.
- **The GPU path** (no quota): the L4 shape, ViT-L in the container, and its timing and cost.
- **16:9 captures** on a real phone, where the rings overlap by only about 6° (covered by the
  ceiling re-anchoring in the synthetic test above).
- **Doors and windows** (switched off). Run against the live model on two synthetic rooms (28
  frames, a few cents), it placed both windows within 3 cm in width and 5 cm in height, found all
  three doors but 10–40 cm too narrow (their bottoms, cut off in level frames, are now snapped to
  the floor), and reported four framed pictures as windows. Real rooms are unmeasured; switch it on
  only after a test set of real keyframes.
- **Glass, mirrors and open doorways**: a mirror wardrobe or a window view can put points beyond a
  wall; nothing masks them yet (the research's segmentation step is not built).
- **Panoramas from real frames**: exposure changes, motion blur and furniture parallax (the room
  shell is the only proxy, so furniture near the camera can ghost).
