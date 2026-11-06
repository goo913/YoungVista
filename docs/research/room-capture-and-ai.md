# Measure rooms from one recorded turn

The best way to turn a stand-and-turn capture into a measured room on an iPhone 15 is this. Capture the turn with a small native module that grabs full 4:3 ARKit keyframes, each with its exact pose and intrinsics. ViroReact's new session recorder serves as the prototype that needs no native code. Then fit the room in a Cloud Run job on an L4 GPU: run an MIT-licensed metric depth model (MoGe-2) on 48–72 keyframes, anchor each frame's scale to the AR floor plane, and fit square-cornered walls from four cues. The cues are floor-line rays, ceiling-line rays, wall points above furniture height, and free space. No published study measures wall lengths for this exact setup. So the expected result, about **3–6% median wall-length error and about 10% at the 90th percentile**, is an error-budget estimate. It must be proven with a laser meter before launch. Today's marked-wall flow stays as the fallback, per wall and for the whole scan, so the worst case stays at today's ~90% accuracy. The other routes fail on evidence or licence:
- Panorama layout networks and SpatialLM have no commercially usable weights.
- Multi-view models (VGGT, MASt3R, π³) lose pose accuracy with little parallax, and most are non-commercial.
- General multimodal LLMs miss distances by roughly 25–45%.
- No commercial non-LiDAR SDK embeds in a consumer app with fast results.

An ordinary Camera-app panorama cannot be measured to ±10%: the guessed camera height alone costs −9% to +15%. The same turn inside the app can be measured, and it also yields 360° tours with true-size furniture drawn in. For AI images, the pick is Google's **Nano Banana 2.1 on Vertex AI** (`gemini-nano-banana-2.1`, GA, $0.05 per 2K image). Its editing quality is in the top cluster at about one-sixth of OpenAI's top price, it takes 14 reference images, and it needs no new account. The image price and the Cloud Run L4 GPU rate were both re-checked on Google's official pages on 2026-11-06 ([Vertex pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing); [Cloud Run pricing](https://cloud.google.com/run/pricing)).

## Decisions at a glance

| Question | Decision | Fallback | Confidence |
|---|---|---|---|
| **Q1. Turn-around to measured room** | 1. Scan in landscape (the owner's choice) with three rings: down, level and up. Portrait with two rings is the faster option. <br>2. A small native module grabs 48–72 posed 4:3 keyframes (JPEG + JSON) and uploads them to Firebase Storage. `_startRecording` is the first prototype and the fallback. <br>3. A Cloud Run L4 job runs MoGe-2 depth, anchors scale to the floor plane, and fits a multi-cue Manhattan room. <br>4. AI labels doors and windows on keyframes; code places them on the walls. <br>5. The app shows each wall with a confidence. | Today's marked-wall flow: for each low-confidence wall (same AR session), or for the whole scan if the server fails. Test `map-anything-apache` with ARKit poses as the multi-view upgrade. | **Medium.** Each step is proven on its own; the combination is untested on a phone. |
| **Q2. Camera-app panorama to 3D room** | **No**, not for measurement. Use the same turning gesture inside the app, with AR. | Import a Camera-app panorama only as a picture, or as a sketch scaled by a typed wall length and labelled approximate. | **High** |
| **Q3. "Move around using real pictures"** | **Yes.** <br>- Stitch one panorama per standing spot on the server, by reprojecting keyframes through the fitted room. <br>- Show it in a custom React Three Fiber viewer: on the website, and in a WebView in the app. <br>- Draw GLB furniture with wall occlusion and floor shadows. | Photo Sphere Viewer (MIT) with its virtual-tour plugin, if ready-made tour UI matters more than control. | **Medium-high** for viewing. **Medium** for stitching, which is custom code. |
| **Q4. AI images** | **Nano Banana 2.1 on Vertex AI**, `global` endpoint, 2K output, called from a server function. <br>- Render to photo: send a textured render with ambient occlusion plus product thumbnails. <br>- Staging: send the AR screenshot, with the furniture already at true size. | - Nano Banana 2, if US or EU data residency is required. <br>- Nano Banana Pro for hard edits. <br>- GPT-Image-2.5 Sunburst and FLUX 3 only as evaluation arms. | **Medium.** The quality rank is measured; geometry fidelity on our rooms is not. |

## What the team must provide or set up

1. **In the existing `young-vista` project (no new account):**
   - Enable the Cloud Run Admin, Artifact Registry and Cloud Build APIs, for building and running the GPU job.
   - Enable the Agent Platform API, formerly the Vertex AI API, whose service name is still `aiplatform.googleapis.com` ([Firebase AI Logic FAQ](https://firebase.google.com/docs/ai-logic/faq-and-troubleshooting)).
   - If the server function is a 2nd-gen Cloud Function, it also needs the Cloud Functions and Eventarc APIs. That list is background knowledge, not from a fetched page; verify it in the console.
2. **L4 GPU quota in `us-central1`,** the same region as the project's Storage bucket (`decisions.md`). A first deployment in a region automatically gets 3 L4 GPUs of quota with zonal redundancy off, and GPU jobs must run without zonal redundancy ([Cloud Run GPU](https://docs.cloud.google.com/run/docs/configuring/services/gpu); [Cloud Run GPU jobs](https://docs.cloud.google.com/run/docs/configuring/jobs/gpu)).
3. **Service accounts:**
   - **The job's account** needs read/write on the scan files in Storage, write access to Firestore, and the Vertex AI User role (`roles/aiplatform.user`) for the AI labelling call.
   - **The callable function's account** needs permission to run the job with per-scan arguments, plus `roles/aiplatform.user` for image calls.
   - The role name comes from a search snippet ([Vertex model reference](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/overview)), and its display name after the rename is unverified.
4. **New accounts, optional:**
   - **Hugging Face (free).** Needed only to accept SAM 3's gated licence ([facebookresearch/sam3](https://github.com/facebookresearch/sam3)). OWLv2 (Apache-2.0) or Florence-2 (MIT) avoid it.
   - **OpenAI (with Organization Verification) and Black Forest Labs.** Only to benchmark against Nano Banana 2.1, not for production.
5. **Legal and privacy:**
   - **Consent:** add a consent screen before home photos go to AI. Apple requires apps to disclose, and get permission, before sharing personal data with third-party AI ([Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/); from the 2026-11-05 notes).
   - **Counsel review:**
     - whether dataset terms flow down to Apache-labelled weights (DA3METRIC-LARGE was partly trained on ARKitScenes, whose licence is non-commercial);
     - the SAM licence, which Meta can change.
   - **No NC-trained weights:** confirm that no weights trained on Matterport3D, ZInD or Structured3D run anywhere in the product.
6. **Device facts to measure in the first week on the iPhone 15** (all unverified today):
   - which video format Viro's session runs: 4:3 at 1920×1440, or 4K at 16:9, which in landscape covers only about 41° vertically. Check whether the native module must set the 4:3 format;
   - the video size and focal length in the `session.jsonl` header;
   - whether recording lowers the AR frame rate;
   - whether Viro's scene coordinates equal the recorded ARKit poses;
   - how repeatable the floor-plane height is;
   - the upload size per scan.
7. **A ground-truth kit:** a laser distance meter, 10–12 rooms in at least 3 homes, and 3 testers (see the test protocol below).
8. **Engineering work:**
   - one small iOS native module, an Expo module in Objective-C++, that reaches ViroKit's `ARSession` (see the capture section);
   - one Python GPU container;
   - one callable function.

Nothing in the recommended path needs a new vendor account. Gemini (image and labelling), Claude as an optional checker on Agent Platform billed by Google, and the Cloud Run GPU all bill to the existing project ([Claude on Google Cloud](https://platform.claude.com/docs/en/build-with-claude/claude-models-on-google-cloud/google-managed); [Firebase AI Logic models](https://firebase.google.com/docs/ai-logic/models)). In the app, every one of these features is labelled only "AI".

## Q1: floor-anchored depth beats five other routes on evidence and licence

### The six routes side by side

The table summarises the evidence; sources are in the route notes that follow. "Derived" means my arithmetic from cited prices or specs. "Estimate" means no measurement exists.

| Route | Best published accuracy | Furniture and partial coverage | Licence: code / weights | Hosting | Cost per scan | Latency | Verdict |
|---|---|---|---|---|---|---|---|
| **(a) Panorama layout networks** (HorizonNet, LGT-Net, DOPNet, Bi-Layout) | <ul><li>84–85% 2D IoU on MatterportLayout</li><li>~92% on ZInD-Simple</li><li>≈4–9% length error (derived)</li><li>50–63% on hard cases</li></ul> | <ul><li>Priors guess hidden floor lines.</li><li>Trained on unfurnished ZInD.</li><li>Collapse on partial input unless retrained.</li></ul> | MIT or Apache code. **Every released weight set was trained on academic-only data.** | Cloud Run CPU (estimate) | <$0.01 (estimate) | ~1–2 s per panorama on CPU (estimate) | Reuse the code only |
| **(b) Metric depth + AR poses, scale anchored to the floor** (MoGe-2/3, DA3METRIC) | <ul><li>Single images: 4.4–5.6% metric point error (NYUv2, iBims-1).</li><li>42 mm mean vs LiDAR after a per-frame fit.</li><li>No wall-length study.</li></ul> | Wall points above furniture, ceiling lines and free space still locate walls. Glass and mirrors must be masked. | MoGe-2/3 ViT-L: MIT. DA3METRIC-LARGE: Apache-2.0. | Cloud Run L4 job | $0.03–0.05 (derived) | ~10–25 s warm, ~30–55 s cold, plus upload (estimate) | **Primary** |
| **(c) Multi-view 3D foundation models** (VGGT, MASt3R-SLAM, MapAnything, π³, DA3 any-view) | <ul><li>MapAnything scale error: 13% → 2% with metric poses (50 views).</li><li>VGGT pose error: 17.4° below 1° parallax.</li></ul> | Like (b) once fused. Image-only pose fails at low parallax. | <ul><li>Clean: `map-anything-apache` and DA3-Base/Small (Apache).</li><li>Gated: VGGT-1B-Commercial.</li><li>Not commercial: π³, MASt3R, VGGT-Ω, DA3-Large/Giant.</li></ul> | Cloud Run L4 (fits 24 GB, estimate) | $0.03–0.05 (derived) | Seconds plus model load (unmeasured) | **Upgrade path**, fed ARKit poses |
| **(d) Structured layout models** (SpatialLM, RoomFormer, SceneScript, CAGE) | <ul><li>Room F1 97–99 on synthetic Structured3D.</li><li>SpatialLM on real video clouds: wall F1 ≈ 68 at a loose 2D IoU of 0.25.</li><li>No dimension error published.</li></ul> | Density-map methods tolerate furniture. Noisy clouds degrade them. | <ul><li>SpatialLM: NC encoder.</li><li>SceneScript: CC BY-NC.</li><li>RoomFormer: MIT code, weights trained on licensed data.</li><li>PolyRoom, FRI-Net: no licence.</li></ul> | GPU | Not reported | Not reported | Not usable now |
| **(e) Multimodal LLMs** (Gemini 4 Argon / 3.8 Flash, GPT-6 / 5.x, Claude 5.x) | <ul><li>GPT-5 on VSI-Bench: room size 50.7, distance 28.8 (≈25–45% typical error).</li><li>No scores for current models.</li></ul> | Finds doors, windows and furniture in 2D. No metric output. | Commercial API terms | Vertex AI or Firebase AI Logic | $0.005–0.49 per 20 keyframes (derived) | Seconds (unmeasured) | **Labels only** |
| **(f) Commercial non-LiDAR SDKs and APIs** (PLNAR, Hover, CubiCasa, NSDK) | Vendor claims of 95–98%, with no method and no independent test | Human quality checks | Proprietary | Vendor app or cloud | Mostly unpublished | ~2–24 h | Not for the core scan |

### (a) Panorama layout networks are accurate enough but legally unusable

**Accuracy is flat and decent.** Single-panorama layout accuracy has barely moved since 2022:
- **MatterportLayout:** Bi-Layout scores 84.56% 2D IoU and 82.05% 3D IoU ([Bi-Layout](https://arxiv.org/abs/2404.09993)); Seg2Reg scores 85.27% and 82.83% ([Seg2Reg](https://arxiv.org/abs/2311.18695)).
- **ZInD's easier "simple" split:** DOPNet scores 91.94% 2D IoU ([DOPNet-ext](https://arxiv.org/abs/2312.16268)).
- **ZInD-All:** 82–86%.
- **Bi-Layout's hard subset:** 53–63% ([Bi-Layout](https://arxiv.org/abs/2404.09993)).

If both room dimensions are off by e, 2D IoU ≈ 1/(1+e)². So 92% IoU is about 4.3% length error, 85% about 8.5%, and 80% about 11.8% (derived). One wall alone off by e gives IoU ≈ 1/(1+e), so 90% IoU means about 11% error (derived).

**Scale is the camera height.** The networks output layout only up to scale and assume the camera is 1.6 m high ([HorizonNet](https://arxiv.org/abs/1901.03861)). With the true height known, the per-column depth error is about 0.11 m on ZInD and 0.20 m on MatterportLayout ([LGT-Net](https://arxiv.org/abs/2203.01824)).

**Furniture and partial input defeat them:**
- They handle hidden floor lines with priors. DOPNet, for example, uses floor–ceiling symmetry ([DOPNet](https://arxiv.org/abs/2303.00971)).
- ZInD, the largest real dataset, shows **unfurnished** homes ([ZInD](https://github.com/zillow/zind)).
- Moving to a new domain can cost up to about 28 points: HorizonNet pre-trained on ZInD falls to 63.57% 2D IoU on challenge data ([DOPNet-ext](https://arxiv.org/abs/2312.16268)).
- Panorama-trained models collapse on narrow-view input. LGT-Net scores 6.86% on LSUN images, while uLayout, trained for both kinds of input, reaches 83.61% ([uLayout](https://arxiv.org/abs/2503.21562)).

**The licence is the blocker.** The code is MIT or Apache, but every released checkpoint was trained on academic-only data:
- **Matterport3D:** its terms ban non-academic use of "any models trained on the Matterport Dataset" ([Matterport3D ToS](http://kaldir.vc.in.tum.de/matterport/MP_TOS.pdf)).
- **ZInD:** it lists as unacceptable using its data "to improve algorithms in a product or service" ([ZInD](https://github.com/zillow/zind)).

**This changes the coordinator's guidance.** Running these weights "as a second opinion" in the product is product use. Even internal benchmarking to improve the product falls inside ZInD's stated exclusion. So these weights should not run anywhere until counsel says otherwise. The commercial path is to retrain the MIT code on YoungVista's own consented scans, or to license ZInD from Zillow, which forwards commercial requests to a business representative ([ZInD](https://github.com/zillow/zind)).

**Compute is not an issue.** The models are small, 82–137M parameters ([Bi-Layout](https://arxiv.org/abs/2404.09993)). HoHoNet runs at 52 FPS on a 512×1024 panorama on an RTX 2080 Ti ([HoHoNet](https://arxiv.org/abs/2011.11498)). None outputs doors or windows.

### (b) Metric depth anchored to the AR floor is the strongest licence-clean route

**Two commercially clean metric models:**
- **MoGe-2** (Microsoft):
  - MIT code; weights tagged MIT ([HF moge-2-vitl-normal](https://huggingface.co/Ruicheng/moge-2-vitl-normal)).
  - Outputs a metric point map plus normals. It accepts a known field of view, which ARKit provides.
  - ViT-L runs in 39 ms at 700² on an A100 in FP16 and needs 1.1 GB ([MoGe-2](https://arxiv.org/html/2507.02546)).
  - Its zero-shot metric point error is 4.44% on NYUv2 and 5.63% on iBims-1. Across seven datasets it averages 8.19%, against 10.1% for UniDepth V2 and 13.7% for Depth Pro, although UniDepth V2 is better on iBims-1 (5.23%) ([MoGe-2](https://arxiv.org/html/2507.02546)).
- **MoGe-3 ViT-L** (released 2026-08-18; HF tag MIT):
  - Raises average metric depth δ1 from 77.3 to 82.7 across nine benchmarks ([MoGe-3](https://arxiv.org/html/2607.17967v2); [HF moge-3-vitl](https://huggingface.co/Ruicheng/moge-3-vitl)).
  - Costs about 3× the latency (121 ms on an A100).
  - Needs Linux, Triton and CUDA 13 ([microsoft/MoGe](https://github.com/microsoft/MoGe)). That matches Cloud Run's CUDA 13.0 driver ([Cloud Run GPU](https://docs.cloud.google.com/run/docs/configuring/services/gpu)).
- **DA3METRIC-LARGE** (ByteDance):
  - Apache-2.0. It needs the focal length: `metric_depth = focal × net_output / 300` ([DA3](https://github.com/ByteDance-Seed/Depth-Anything-3)).
  - An independent ARKit test found its per-frame scale varied **0.92×–1.67×** within one room ([indoor_3d](https://github.com/YonatanSimson/indoor_3d)).
  - Its training data includes ARKitScenes ([DA3 paper](https://arxiv.org/html/2511.10647)), whose licence is "personal, non-commercial" ([ARKitScenes LICENSE](https://github.com/apple-aiml-research/ARKitScenes/blob/HEAD/LICENSE)). That is a question for counsel.
- **Other strong models are not commercial:** UniDepthV2 is CC BY-NC ([UniDepth](https://github.com/lpiccinelli-eth/UniDepth)), and Depth Anything V2 Base and Large are CC-BY-NC ([DA V2](https://github.com/DepthAnything/Depth-Anything-V2)).

**So the coordinator's "MoGe-2 or DA3METRIC" becomes "MoGe-2 first, MoGe-3 as an A/B test, DA3METRIC third"**, on this evidence. MoGe-2's own training-data terms were not checked.

**"Metric" models still need anchoring.** The published recipe fits a per-frame scale and shift to sparse metric points by least squares. VI-Depth cut AbsRel from 0.069 to 0.046 with a learned correction on top ([VI-Depth](https://github.com/isl-org/VI-Depth)). After a per-frame fit, DA3METRIC sat 42.3 mm from LiDAR on average, against 111.3 mm raw ([indoor_3d](https://github.com/YonatanSimson/indoor_3d)).

**Floor-only anchoring is new.** YoungVista's anchor is better than sparse points: every floor pixel's true depth follows exactly from its camera ray and the AR floor plane. No study has evaluated floor-only anchoring indoors. The closest, PALMS+, assumed a 1.5 m camera height instead of measuring it ([PALMS+](https://arxiv.org/html/2511.09724)).

**Single frames are not good walls.** On iBims-1 the leading models show about 0.095 m planarity error and about 19° plane-orientation error ([Depth Pro paper](https://arxiv.org/html/2410.02073v2)). Walls must therefore be fitted from many frames, with gravity forcing them vertical. Windows and glass pull in outside geometry, and masking them improved PALMS+'s results from 30.4% to 38.0% ([PALMS+](https://arxiv.org/html/2511.09724)). **No study reports wall-length error for monocular depth plus AR poses without LiDAR**, which is why the accuracy below is an estimate.

**On the phone (iOS only), depth helps the user but does not measure:**
- **Apple's Core ML Depth Anything V2 Small:**
  - Apache-2.0, 24.8M parameters, 49.8 MB at Float16.
  - 33.9 ms on an iPhone 15 Pro Max ([Apple Core ML models](https://developer.apple.com/machine-learning/models/); [HF](https://huggingface.co/apple/coreml-depth-anything-v2-small)). The base iPhone 15 is not listed, so ~30–35 ms is an estimate.
  - Output is relative depth only.
- **`react-native-executorch`** offers DA V2 Small, DA3 Small and ZipDepth with a Core ML backend, also relative only ([RNE depth docs](https://docs.swmansion.com/react-native-executorch/docs/next/extensions/depth-estimation)).
- **ViroReact 3.0.3's own monocular depth** (`depthEnabled`, `occlusionMode: 'depthBased'`, `preferMonocularDepth`):
  - It runs a native `VROMonocularDepthEstimator` that its header describes as "Apple's Depth Pro or similar".
  - It needs a `DepthPro.mlmodelc` that the framework does not ship; a `VROModelDownloader` can fetch it at runtime. Depth reaches JavaScript only through hit tests (installed ViroKit headers, `VROMonocularDepthEstimator.h` and `VROModelDownloader.h`, checked by the owner and re-checked here).
  - **Licence:** Depth Pro's weights are unresolved, research-tagged `apple-amlr` on Hugging Face ([HF apple/DepthPro](https://huggingface.co/apple/DepthPro)). Its Core ML package is 1.9 GB ([HF DepthPro-coreml](https://huggingface.co/coreml-projects/DepthPro-coreml)), so do not ship it until both are resolved.
  - **Swapping models:** whether DA V2 Small (Apache) can replace it depends on the estimator's input and output contract, which is untested.

**Use on-device depth for live occlusion and coaching** (for example, "this wall isn't covered yet"). Keep the measured room on the server.

### (c) Multi-view foundation models need ARKit's poses to survive a turn in place

**Turning in place gives little parallax** (derived). With the phone on a 0.3–0.5 m circle, frames 5–10° apart sit 3–9 cm apart. That gives triangulation angles of about 0.3–3.3° to walls 1.5–5 m away. In that regime, VGGT's median pairwise pose error on 7-Scenes rises from about 3.0° at high parallax to **17.4° below 1° parallax**, and 22% of those low-parallax pairs fail catastrophically, by more than 30° ([GeoCond](https://arxiv.org/html/2609.18465)). A MASt3R-SLAM user panning 0–170° in place saw pose "displacements in the range of several tens of centimeters" ([issue #54](https://github.com/rmurai0610/MASt3R-SLAM/issues/54)).

**Those are pose failures, and ARKit already supplies metric poses.** MapAnything accepts per-view intrinsics, OpenCV cam2world poses and a metric flag ([MapAnything](https://github.com/facebookresearch/map-anything)). With 50 views, its scale error falls from 0.13 with images only to 0.02 with intrinsics plus metric poses ([MapAnything paper](https://arxiv.org/html/2509.13414)). That test used ETH3D, ScanNet++ and TartanAir, not rotation-only captures.

**Caveats:**
- The commercially usable `map-anything-apache` weights are Apache-2.0 but were trained on 6 datasets and score below the CC-BY-NC version ([HF](https://huggingface.co/facebook/map-anything-apache); [paper](https://arxiv.org/html/2509.13414)).
- The model "does not explicitly account for noise or uncertainty in geometric inputs" (same paper).
- Users report scale bias outside its training domains ([issue #99](https://github.com/facebookresearch/map-anything/issues/99); [issue #168](https://github.com/facebookresearch/map-anything/issues/168)).
- DA3's pose conditioning cut 7Scenes F1 from 58.4 to 46.0 in its own ablation ([DA3 paper](https://arxiv.org/html/2511.10647)).

**Licences remove most famous names:**
- π³ weights are non-commercial ([Pi3](https://github.com/yyfz/Pi3)).
- MASt3R and MASt3R-SLAM are CC BY-NC-SA ([MASt3R](https://github.com/naver/mast3r/blob/HEAD/LICENSE)).
- VGGT-Ω carries the FAIR non-commercial licence ([HF](https://huggingface.co/facebook/VGGT-Omega)).
- VGGT is commercial only through the gated, manually approved `VGGT-1B-Commercial` ([HF](https://huggingface.co/facebook/VGGT-1B-Commercial)).
- WorldMirror 2.0 posts the best prior-conditioned 7-Scenes accuracy (0.013) in its own table ([HY-World 2.0](https://github.com/Tencent-Hunyuan/HY-World-2.0)). But its licence excludes the EU, the UK and South Korea ([License](https://github.com/Tencent-Hunyuan/HY-World-2.0/blob/HEAD/License.txt)).

**Memory is not a constraint.** VGGT-Ω needs 9.66 GB for 50 frames on an A100 ([vggt-omega](https://github.com/facebookresearch/vggt-omega)), so 30–60 frames should fit a 24 GB L4 (estimate).

**Verdict:** `map-anything-apache` fed with ARKit poses and intrinsics is the right **upgrade experiment**, run on the same keyframes as route (b). It is not the primary route, because nobody has tested it on rotation-only captures.

### (d) Structured layout models have no clean weights and no dimension results

**SpatialLM 1.1:**
- It outputs walls, doors, windows and object boxes from a metric, z-up point cloud whose walls are aligned to the x and y axes ([SpatialLM](https://github.com/manycore-research/SpatialLM)).
- On synthetic Structured3D it reaches 94.3 layout F1 after fine-tuning.
- On 107 real clouds reconstructed from RGB video with MASt3R-SLAM, zero-shot **wall F1 falls to about 68 at a loose 2D IoU of 0.25**, with doors and windows at 47–51. No wall-length or area error is published (same README).
- Its own custom-video guide fixes scale by resizing the cloud "to have a height of 2.5 meters" ([EXAMPLE.md](https://github.com/manycore-research/SpatialLM/blob/HEAD/EXAMPLE.md)).
- Its encoders are CC-BY-NC, even where Hugging Face tags the Llama variant `llama3.2` ([SpatialLM](https://github.com/manycore-research/SpatialLM)).

**The other layout models:**
- **SceneScript** is CC BY-NC ([SceneScript](https://github.com/facebookresearch/scenescript)).
- **RoomFormer** has MIT code, but its weights were trained on Structured3D and SceneCAD ([RoomFormer](https://github.com/ywyue/RoomFormer)).
- **PolyRoom and FRI-Net** have no licence files ([PolyRoom](https://github.com/3dv-casia/PolyRoom); [FRI-Net](https://github.com/Daisy-1227/FRI-Net)).
- **Floor-plan models are near saturated on synthetic data.** On Structured3D, RoomFormer scores room F1 97.3 in 0.01 s and CAGE 99.1 ([CAGE](https://arxiv.org/html/2509.15459)).

**Density-map methods tolerate furniture.** They project wall points straight down, so wall points above the furniture still count.

**The way forward is retraining.** Retrain a density-map model with MIT code (RoomFormer) on YoungVista's own scans once enough consented data exists. Until then, the classical fit in the pipeline below does the same job with no licence risk.

### (e) Multimodal LLMs label rooms well but miss distances by 25–45%

**What the scores mean.** VSI-Bench scores numeric answers with Mean Relative Accuracy (MRA). An answer within 10% earns at least 0.9 credit ([VSI-Bench](https://arxiv.org/html/2412.14171)).

**Measured accuracy:**
- **GPT-5 on VSI-Bench** scores 50.7 on room size, **28.8 on absolute distance** and 68.9 on object size ([GR3D](https://arxiv.org/html/2603.08592)). That implies typical distance errors of roughly 35–45% (derived).
- **Gemini 3 Pro Preview** averages 52.5 across VSI-Bench tasks ([arXiv 2602.06037](https://arxiv.org/html/2602.06037)).
- **Even with reference objects of known size in the prompt,** GPT-5-mini and Gemini 2.5 Flash reach only 34–38 MRA on Metric-Bench ([Metric-Bench](https://arxiv.org/html/2609.25841v1)).
- **No spatial scores exist** for Gemini 4 Argon, Gemini 3.8 Flash, GPT-6 or Claude 5.x. Argon's model card lists no spatial benchmark ([Gemini 4 Argon card](https://deepmind.google/models/model-cards/gemini-4-argon/)).

**The fix is to hand the model geometry.** With deterministic tools over a ground-truth 3D scene graph, GPT-4.1 reached 94.9 MRA on distances ([RieMind](https://arxiv.org/html/2603.15386)). With reconstructed geometry written into the prompt, GPT-5's room-size score rose from 50.7 to 72.1 ([GR3D](https://arxiv.org/html/2603.08592)).

**Detection is usable, with checks:**
- Gemini returns 2D boxes on a 0–1000 grid and advises "For better results, disable thinking" ([Gemini image understanding](https://aistudio.google.com/docs/image-understanding)).
- OpenAI says its models struggle with "precise spatial localization" ([OpenAI vision](https://developers.openai.com/api/docs/guides/images-vision)). Anthropic calls Claude's coordinates "approximate" ([Claude vision](https://platform.claude.com/docs/en/build-with-claude/vision)).
- **No evaluation of doors, windows, glass or curtains** exists for any current LLM.

**Cost is trivial.** Twenty keyframes on `gemini-3.8-flash` cost about $0.017 in input tokens today and $0.034 after its 2027-01-01 price change (derived). That uses 1,120 tokens per image and $0.75 → $1.50 per million input tokens ([media resolution](https://aistudio.google.com/docs/media-resolution); [AI Studio pricing](https://aistudio.google.com/docs/pricing)). Those are Gemini Developer API prices; Agent Platform list prices were not fetched.

**Account and access:**
- Gemini is in Firebase AI Logic and on Vertex, with no new account ([Firebase AI Logic models](https://firebase.google.com/docs/ai-logic/models)).
- GPT models need an OpenAI account.

**Verdict:** use Gemini 3.8 Flash only for labels and 2D positions of openings. Every metric number comes from geometry.

### (f) No commercial SDK embeds non-LiDAR room measurement in a consumer app

**Apple RoomPlan** needs LiDAR, so it does not run on the iPhone 15 ([WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/)).

**The non-LiDAR services are B2B and slow:**
- **PLNAR:**
  - Its photo path works on "any supported smartphone" and returns "quality-inspected models within 24 hours".
  - It is the only vendor that advertises "Embed Plnar capture in your app, under your brand".
  - Prices are hidden behind "Start free. Pay as you go", with $120 of trial credits. Its "98%" accuracy claim has no stated method ([plnar.ai](https://plnar.ai/)).
- **Hover:**
  - Non-LiDAR interior scans take about 15 minutes to capture and about 3 hours to process.
  - The app may ask the user to type a hand-measured length for scale.
  - It makes no numeric accuracy claim, and capture happens in Hover's app ([Hover help](https://help.hover.to/en/articles/9264961-interior-scans-non-lidar)).
- **CubiCasa:**
  - Claims 95–97% average accuracy, "within 3%" on LiDAR devices ([CubiCasa help](https://help.cubi.casa/en/articles/6662584-how-accurate-are-your-plans)).
  - Delivers in up to 24 hours, with capture in its own app ([App Store](https://apps.apple.com/us/app/cubicasa/id1439879192)).
- **Niantic's NSDK** meshes without LiDAR but is Unity-only, returns an unlabelled mesh, and has contact-sales pricing ([NSDK meshing](https://nianticspatial.com/docs/nsdk/features/meshing/); [pricing](https://www.nianticspatial.com/pricing)).
- **CamPlan** shows that non-LiDAR video scans with one typed wall length can sell as a consumer app ($7.99–$24.99 in-app purchases), but it has no SDK ([App Store](https://apps.apple.com/us/app/floor-plan-ai-home-camplan/id6444421373)).

**Verdict:**
- Buy nothing for the core scan.
- At most, call PLNAR's sales team about embedding, platform and pricing.
- Consider Hover or CubiCasa later as a paid "professional floor plan" add-on.

### Recommendation: one primary pipeline, with today's flow as its floor

**Primary: floor-anchored metric depth with a multi-cue Manhattan fit.** The phone captures posed keyframes during a guided turn. A Cloud Run L4 job:
- runs MoGe-2 on every keyframe;
- anchors each frame's scale to the AR floor plane;
- fuses the frames in the ARKit world frame;
- fits square-cornered walls from four independent cues;
- places doors and windows that AI found in 2D onto the fitted walls.

The job returns **wall observations with confidences** in the same form as today's tap marks, not a finished polygon. Then the existing, tested room builder in `packages/core` assembles the room. That keeps one solver and makes per-wall fallback a simple merge.

**Fallback: today's marked-wall flow, at two levels:**
1. **Per wall.** The user stays in the live AR session while the job runs. Walls the server flags as low-confidence are highlighted in the camera view, and the app asks for that wall's usual mark: its bottom edge, or its top edge behind furniture. These marks share the session's world frame, so they merge directly with the server's walls.
2. **Whole scan.** If the upload or the job fails, times out, or returns too few walls, the app switches to the full marked-wall scan.

**Why this fallback:**
- It has run on the target phone and gives about 90% of true lengths today.
- It needs no network.
- It already refuses impossible marks, such as a wall that a furniture top reaches through (`decisions.md`).
- Its marks are the same ray-to-plane geometry as the server's strongest cue, so the two combine cleanly.
- **The worst case is therefore today's accuracy, never worse.**
- The review screen's drag-corner editor and optional tape-measured scale stay as they are.

**Upgrade experiment:** run `map-anything-apache` with ARKit poses and intrinsics on the same keyframes, and keep it only if it beats MoGe-2 on the test rooms.

**Not used in the product:** panorama-layout and SpatialLM-style weights (licence), LLM metric estimates (accuracy), and the commercial SDKs (latency and fit).

### Capture: three landscape rings by default, from posed 4:3 keyframes

**What the camera can see.** ARKit world tracking renders from the 1× wide camera. Apple's engineers say it uses the ultra-wide internally but "it is unavailable in the API, because it is not configurable" ([Apple Developer Forums 831657](https://developer.apple.com/forums/thread/831657)). So **0.5× is not available to an AR scan.**

**Field of view per frame** (derived from the 26 mm-equivalent spec in [iPhone 15 Tech Specs](https://support.apple.com/en-us/111831); treat as ±3–5° until fx is read on the device):
- 4:3 frame (1920×1440): about 67° × 53°.
- 4K frame (3840×2160, 16:9): about 67° × 41°.

**Which format ViroReact runs is unconfirmed.** ARKit offers binned 1920×1440 at up to 60 fps and 4K at 30 fps ([WWDC22 session 10126](https://developer.apple.com/videos/play/wwdc2022/10126/)). ViroReact's default "High" quality picks the format with the tallest image ([virocore VROARSessioniOS.cpp](https://github.com/ReactVision/virocore/blob/main/ios/ViroKit/VROARSessioniOS.cpp)), so on the iPhone 15 it probably runs 4K 16:9.

**Holding the phone sideways matters only if the format stays 4K.** The screen crop changes what the user sees, not what is recorded.

**Ring coverage options** (all derived; camera 1.4 m above the floor, ceiling 2.4 m):

| Setup | Vertical coverage | Floor–wall line visible beyond | Ceiling line visible beyond | Time at 10°/s |
|---|---|---|---|---|
| One level ring, landscape 4:3 | ±26.5° | 2.8 m (misses most bedroom walls) | 2.0 m | ~36 s |
| One level ring, portrait | ±33.5° | 2.2 m | 1.5 m | ~36 s |
| **Landscape 4:3, three rings at −35°, 0°, +35° (default)** | ±61.5°, ~18° overlaps | **0.76 m** | **0.54 m** | **~110 s** |
| Landscape 4K, three rings at −30°, 0°, +30° | ±50.5°, ~11° overlaps | 1.15 m | 0.82 m | ~110 s |
| **Portrait, two rings at −25°, +25° (faster option)** | ±58.5°, ~17° overlap | **0.86 m** | **0.61 m** | **~72 s** |

**The default follows the owner's wish to keep AR screens in landscape.** Landscape also shows the user more sideways (about 67° × 34° on screen), and its level ring gives the cleanest horizon band for 360° tours (Q3).

**The native module should switch the session to the 4:3 format.** With 4K frames at ±35°, the landscape rings overlap by only about 6°.

**The phone's height is the reason the scan stays in AR** (derived). Leaving ARKit to use the 0.5× camera would lose each frame's metric position. Floor-line distance error equals δh/h, so a 10 cm change in phone height during the sweep would cost about 7%. 0.5× remains, at most, a later option for prettier tour panoramas.

**Protocol for the user:**
1. **Prepare the room.** Lights on. Doors closed: a doorway closes the room, and Apple's RoomPlan guidance also asks for closed doors ([WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/)). Curtains open, so windows can be found. People and pets out of view.
2. **Find the floor first,** as today. ARKit warns that a newly detected plane "may be inaccurate" and refines it over time ([Apple: world tracking](https://developer.apple.com/documentation/arkit/understanding-world-tracking)). Keep the floor plane updating during the turn, and record its final height.
3. **Stand in the open floor near the middle of the room.** Stay at least 1 m from walls and tall furniture, where you can see over beds and sofas to the ceiling line. Never stand between a bed and a wall. In rooms longer than about 5 m, or L-shaped rooms, add a second spot in the same AR session.
4. **Hold the phone near the chest with elbows bent, and turn on your heels in small steps.** This is Zillow's and Google's capture advice, seen only in search snippets ([Zillow 3D Home FAQ](https://www.zillow.com/3d-home/faq/); [Android Central](https://www.androidcentral.com/google-releases-new-photosphere-tutorial-video)). It keeps the turning radius near 0.15–0.2 m, which halves stitching parallax for Q3.
5. **Turn about 10° per second.** That is about 36 s per ring; overlap the start by about 30°.
   - **Order:** down ring first, then level, then up (portrait: down, then up).
   - **Blur arithmetic** (derived, assuming a 1/60 s indoor exposure):
     - 4:3 landscape frames carry about 28.5 px per degree, so 10°/s smears about 5 px.
     - 4K frames carry about 57 px per degree, so 15°/s smears about 14 px and 30°/s about 28 px.
   - Warn above 15°/s. Keep the sharpest frame in each yaw bin.
6. **On-screen coaching:**
   - targets around each ring that fill in as covered, as in Google's Photo Sphere (third-party description: [Screen Rant](https://screenrant.com/google-pixel-capture-360-degree-photo-spheres-vr/));
   - a pitch guide with a ±5° tolerance;
   - a speed warning;
   - "go back to fill the gap".
7. **Exposure.** Optionally lock exposure and white balance per ring through `configurableCaptureDeviceForPrimaryCamera`. Apple warns that extreme settings can hurt tracking ([WWDC22 10126](https://developer.apple.com/videos/play/wwdc2022/10126/)).

### What the phone uploads

**Production: a small native module grabs keyframes on the phone.** ViroKit's shipped headers expose the session:
- `VROViewAR` has `getARSession`;
- the iOS subclass `VROARSessioniOS` has `ARSession *getARSession()` and `getSessionConfiguration()`.

Both were confirmed in the installed 3.0.3 headers. Through that `ARSession`, an Objective-C++ Expo module, shaped like the app's existing `scene-capture` module, can read each frame's full `capturedImage`, `camera.intrinsics`, `camera.transform` and timestamp. It can also call `captureHighResolutionFrame` for stills that carry the pose ([Apple](https://developer.apple.com/documentation/arkit/arsession/capturehighresolutionframe(completion:).md)).

The module:
1. bins frames by yaw per ring, every 10–15°, for 48–72 keyframes in total;
2. keeps the sharpest and steadiest frame in each bin;
3. writes a JPEG plus a JSON line per frame.

Unlike the recorder, it stores intrinsics **per frame**, which matters because autofocus moves the focal length by about 3% during a session ([indoor_3d](https://github.com/YonatanSimson/indoor_3d)).

**Risk:** the module depends on ViroKit's C++ ABI, which can break on ViroReact upgrades.

The same handle also exposes ARKit's world map, which might later relocalize saved rooms automatically (outside this report's questions; untested).

**First prototype and fallback, no native code: `_startRecording(outputDir)`.** It writes two files:
- **`video.mp4`:** H.264 at about 11 Mbps, from ARKit's own pixel buffers, sensor-native.
- **`session.jsonl`:** a header with intrinsics, written once; one pose per frame with a nanosecond timestamp and gravity; raw IMU lines.

Sources: [VROARSessionRecorderIOS.mm](https://github.com/ReactVision/virocore/blob/main/ios/ViroKit/VROARSessionRecorderIOS.mm); [ViroARSceneNavigator.tsx](https://github.com/ReactVision/viro/blob/main/components/AR/ViroARSceneNavigator.tsx).

How to use it:
- Decode with `ffmpeg -noautorotate`, because the 90° rotation sits only in the container ([virocore CHANGELOG](https://github.com/ReactVision/virocore/blob/main/CHANGELOG.md)).
- Pair poses to frames by position; duplicates are dropped "whole, pose included" (same changelog).

Caveats:
- It shipped in August 2026 for offline SLAM replay, so treat it as beta.
- It costs about 82 MB per minute (derived from 11 Mbps), so 100–165 MB per scan.
- At about 0.044 bits per pixel in 4K, flat walls will show compression.

**Last resort:** `_takeScreenshot` saves the GL view as a PNG, with rendered content and the screen crop ([virocore VROViewRecorder.mm](https://github.com/ReactVision/virocore/blob/main/ios/ViroKit/VROViewRecorder.mm)).

| Upload (Storage `users/{uid}/scans/{scanId}/`) | Contents | Size |
|---|---|---|
| `kf/000.jpg` … | 48–72 full 4:3 frames, sensor orientation | ~25–45 MB (estimate, ~0.4–0.6 MB each) |
| `frames.json` | Per frame:<br>- timestamp, ring id and yaw bin;<br>- 4×4 ARKit camera transform;<br>- fx, fy, cx, cy and image size;<br>- tracking state, exposure, sharpness | <1 MB |
| `capture.json` | - Floor plane: height, normal, extent, and its estimate over time;<br>- other AR planes;<br>- app and ViroReact versions, video format;<br>- any user marks;<br>- capture mode (landscape-3 or portrait-2) | <1 MB |
| Prototype only: `video.mp4` + `session.jsonl` | Recorder output | ~80 MB per minute |

**Two checks before trusting any upload:**
- Confirm that Viro's scene coordinates, where the floor plane lives, are the same frame as the recorded camera transforms. If the app ever moves the world origin, record that transform.
- Convert ARKit's camera axes to the OpenCV convention the models expect, by flipping y and z. Verify it by projecting the floor plane into a frame.

### Server pipeline, step by step

**Trigger.**
1. When the upload finishes, the app calls a callable function `fitRoom({ scanId })`, guarded by Firebase Auth and App Check.
2. The function writes `scanFits/{scanId}` with status `queued` and executes the Cloud Run job `room-fit`, passing the scan ID as an argument override.
3. The app listens to that Firestore document while the user stays in the AR view.

**The job:**
1. **Load and validate.**
   - Read `frames.json` and `capture.json`.
   - Reject the scan if tracking was limited, if any ring has a yaw gap over 20°, or if there is no floor plane.
   - Convert camera axes to OpenCV and check the conversion with a floor reprojection.
   - For recorder input, decode with `ffmpeg -noautorotate`, bin frames by yaw per ring, and keep the sharpest per bin.
2. **Mask what lies.**
   - Segment windows, glass doors, mirrors, screens and people, and exclude them from fusion.
   - Keep the door and window boxes for step 9.
   - **Tools:** SAM 3 with text prompts, or OWLv2 or Florence-2 boxes plus SAM 3 masks.
     - SAM 3's licence is royalty-free and covers the weights, but bans military uses and lets Meta change terms ([SAM 3 LICENSE](https://github.com/facebookresearch/sam3/blob/main/LICENSE)).
     - OWLv2 is Apache-2.0 ([HF](https://huggingface.co/google/owlv2-large-patch14-ensemble)); Florence-2 is MIT ([HF](https://huggingface.co/microsoft/Florence-2-large)).
   - Avoid ADE20K-trained segmenters, whose image terms are "non-commercial research and educational purposes" only ([ADE20K terms](https://ade20k.csail.mit.edu/terms)).
3. **Depth.** Run MoGe-2 ViT-L-normal on each keyframe, with `fov_x` from that frame's fx. Output: a metric point map plus normals.
4. **Anchor scale per frame.**
   - Take pixels whose normals point up and whose rays meet the AR floor plane inside its extent. Their true depth is exact.
   - Fit each frame's scale robustly with a Huber loss or RANSAC.
   - **Frames that see no floor** (the up ring) take their scale from overlap with already-anchored frames on shared wall surfaces, and later from the fitted ceiling.
   - Reject frames more than 15% from the room's median scale.
5. **Fuse** in the ARKit world frame. Voxelize at 2–3 cm with Open3D (MIT, v0.20.0, released 2026-09-16; [LICENSE](https://raw.githubusercontent.com/isl-org/Open3D/main/LICENSE); [release](https://api.github.com/repos/isl-org/Open3D/releases/latest)), keeping the normals, counts and camera-to-point rays.
6. **Floor, ceiling and yaw.**
   - The floor is the AR plane.
   - The ceiling is the dominant downward-facing plane above about 2.0 m, fitted with Open3D's `segment_plane` RANSAC ([Open3D docs](https://www.open3d.org/docs/release/tutorial/geometry/pointcloud.html)).
   - The room's yaw is the peak of a histogram of horizontal wall-normal directions, modulo 90°. Gravity is already known.
7. **Four wall cues** on a 2D floor grid of 2–5 cm cells:
   - (a) **Floor-line rays.** Find pixels where the floor meets a vertical surface that belongs to the fused wall, not to furniture. Cast each ray onto the AR floor plane. This is today's solver maths, applied to thousands of pixels instead of one tap.
   - (b) **Ceiling-line rays,** cast onto the fitted ceiling plane, for walls whose floor line is hidden.
   - (c) **Band points:** wall-facing points between about 1.3 m and 10 cm below the ceiling, above most furniture.
   - (d) **Free space.** Cells crossed by camera-to-point rays are empty, so a wall must lie beyond them. Points beyond a wall (window views, mirror reflections) are dropped.
8. **Fit walls and score them.**
   - For each Manhattan direction, take a weighted median offset per wall; boundary rays weigh most.
   - Confidence comes from:
     - floor-line vs ceiling-line agreement;
     - the spread of inliers;
     - how much of the wall was seen;
     - frame-scale consistency.
   - Emit wall observations in the format of today's marks, plus the ceiling height. `packages/core` closes the polygon (rectangle, L or U), as it does for taps.
9. **Doors and windows.**
   - On 10–20 keyframes facing the walls, ask Gemini 3.8 Flash for `box_2d` boxes of doors, windows and openings, with thinking off. Alternatively, use OWLv2 boxes.
   - Cast each box's edges onto the fitted wall plane to get the room model's `offset`, `width`, `height` and `sill`.
   - Take the median across frames, and mark each opening for the user to confirm.
10. **Write the results.**
    - To `scanFits/{scanId}`: walls with confidences, ceiling height, openings, frame scales, timings and model versions.
    - To Storage: a debug bundle with a PLY point cloud and a cue image.
    - The app draws the room over the real walls in AR and highlights flagged walls for marking.

### Hosting, cost and latency: a Cloud Run job costs about 4 cents per room

**The job's configuration:**
- Region `us-central1`, next to the Storage bucket.
- One L4 GPU (24 GB), 8 vCPU and 32 GiB, Google's recommended shape for L4.
- No zonal redundancy: GPU jobs require it ([Cloud Run GPU jobs](https://docs.cloud.google.com/run/docs/configuring/jobs/gpu)).
- A 15-minute task timeout and one retry.
- Weights baked into the image, since images suit models under 10 GB ([GPU best practices](https://docs.cloud.google.com/run/docs/configuring/services/gpu-best-practices)).
- PyTorch with CUDA 13 wheels, Open3D, OpenCV, and Node to run `packages/core`.

**Rates, verified on the official page on 2026-11-06:**
- L4 without zonal redundancy: **$0.0001867 per second**; with it: $0.0002909.
- CPU: $0.000018 per vCPU-second. Memory: $0.000002 per GiB-second.
- Jobs bill "for the entire lifetime of any instance started, with a minimum of 1 minute" ([Cloud Run pricing](https://cloud.google.com/run/pricing)).

**Cost per scan** (derived from those rates):
- The recommended shape costs $0.0003947 per second, so a 90-second scan costs **$0.036**.
- 1,000 scans a month cost about **$30** after the free tier.
- Gemini labelling adds about $0.02, so a room costs about **$0.05–0.06** in all.

**Why a job and not a service.** A scale-to-zero service may keep an idle GPU instance "up to … 10 minutes for GPUs" ([Cloud Run autoscaling](https://docs.cloud.google.com/run/docs/about-instance-autoscaling)). That would bill about $0.27 for an isolated scan (derived). A warm service with one minimum instance costs about $1,040 a month (derived). Vertex AI's g2-standard-4 is cheaper per hour at $0.81293, but its pricing page says such deployments "cannot scale down to zero nodes" ([Vertex pricing](https://cloud.google.com/vertex-ai/pricing)). A Preview doc conflicts with that.

**Latency** (estimate; no measured L4 figures exist for these models):

| Step | Time |
|---|---|
| Upload of 25–45 MB at 20 Mbps | ~10–18 s (derived) |
| GPU ready | "approximately 5 seconds" ([Cloud Run GPU](https://docs.cloud.google.com/run/docs/configuring/services/gpu)) |
| Model load when cold | ~15–30 s (estimate, from Google's 11–35 s for 1.7–7.4 GB LLMs: [Google Cloud blog](https://cloud.google.com/blog/products/application-development/run-your-ai-inference-applications-on-cloud-run-with-nvidia-gpus)) |
| MoGe-2 on 72 frames | ~7–12 s. A100: 39 ms per frame; L4 assumed 2.6–4× slower from dense FP16 throughput, 121 vs 312 TFLOPS ([NVIDIA L4](https://www.nvidia.com/en-us/data-center/l4/); [A100](https://www.nvidia.com/en-us/data-center/a100/)) |
| Masks, fitting, labelling | A few seconds to ~20 s (unmeasured) |
| **End of capture to result** | **About 40–90 s** |

### Expected accuracy: an error budget, not a measurement

**No study** reports wall-length error for monocular depth plus AR poses without LiDAR (route b), or for any open "video to floor plan" pipeline without LiDAR. The SpatialLM results above are detection scores, not dimensions. So the numbers below are an **estimate** built from geometry and from the per-pixel results cited above.

**The ray geometry** (derived): a floor-line distance is d = h·cot α, where α is the angle below the horizon. Its relative error is δd/d = 2δα / sin 2α plus δh/h. The table assumes a wall 2 m away, a camera 1.4 m up and a ceiling 1.0 m above the camera.

| Error source | Assumed size | Effect on that wall's distance |
|---|---|---|
| Floor-plane height | 1–2 cm | 0.7–1.4%, on floor-line rays and on every frame's scale anchor |
| Boundary angle | 0.3° per ray | ~1.1% per ray. Averaging thousands of pixels leaves only bias (baseboards, shadows): ~0.5% assumed |
| Camera pitch error during the turn | 0.2–0.5° (unmeasured for ARKit) | 0.7–1.9% |
| Ceiling height (walls found by their ceiling line) | 2–3 cm | 2–3% |
| Depth band only (no boundary visible) | 4–7% per-pixel error after anchoring ([VI-Depth](https://github.com/isl-org/VI-Depth); [indoor_3d](https://github.com/YonatanSimson/indoor_3d)) | ~2–4% after fusing thousands of points. More for far walls, because the floor anchor is extrapolated |
| Wrong surface (a furniture front, wardrobe or glass) | Gross | 0.3–1.5 m. Free-space and cue-agreement checks should flag it; otherwise the fallback tap fixes it |

**Combining the terms** by root-sum-square gives about 1.5–2.5% per wall distance where the floor line is visible, 2.5–3.5% where only the ceiling line is, and 3–5% from band points alone. A wall's length is the distance between its two neighbouring walls, so its error is similar.

**The estimate.** Pad the budget for effects it does not model: pose drift across the turn, misdetected boundaries, out-of-square rooms snapped to 90°, and bias in the floor plane. That gives **a median wall-length error of about 3–6%, about 10% at the 90th percentile, and a ceiling height within about 2–4 cm.**

**How that compares:**
- Today's tap flow: about 10%.
- CubiCasa's self-reported, method-free average: 95–97% ([CubiCasa help](https://help.cubi.casa/en/articles/6662584-how-accurate-are-your-plans)).

**Two risks could break the estimate:**
- **ARKit pose quality during a body turn has not been measured.**
- **Bare white rooms.** A 2026 preprint of 600 gimbal-controlled phone runs found 21% of bare-room runs ended more than 0.5 m from their origin, against 3% in a textured room ([Research Square preprint](https://www.researchsquare.com/article/rs-10991704)). Not peer-reviewed.

### How to measure it: a 120-capture test against a laser meter

**Rooms.** Use 10–12 rooms in at least 3 homes:
- 4 bedrooms with a bed against a wall. That is the case that made the second iPhone 15 scan 1.5 m short (`decisions.md`).
- 2 living rooms.
- 1 kitchen or dining room with cabinets.
- 1 small room or hallway with walls under 1.5 m away.
- 1 room with a wall over 5 m.
- 1 L-shaped room.
- 1 bare white room.
- 1 room with a big window, glass door or mirror wardrobe.

**Ground truth.**
- With a laser distance meter, measure:
  - every wall's length at about 1 m height, and at floor level where reachable;
  - the ceiling height at two points;
  - both diagonals;
  - each door's and window's width, height, sill and distance from a corner.
- Measure each twice and average.
- Store the results in a team-only `scanTruth/{roomKey}` document.

**Captures.**
- 3 testers, one of them new to the app.
- In each room, each tester makes 2 turn-around captures and 2 tap-flow captures on the iPhone 15, alternating which method goes first. Over 10 rooms that is 120 captures.
- Add one portrait two-ring capture in half the rooms, to settle the default capture mode.
- Run a 3-room pilot first.

**Metrics:**
- per-wall signed and absolute length error (%), and the worst wall per room;
- ceiling-height error (cm);
- floor-area error (%), and 2D IoU against the laser-measured polygon;
- whether the shape is right (wall count; rectangle vs L or U);
- door and window recall and precision (found within 20 cm), and width error (cm);
- repeatability across captures and testers (standard deviation, %);
- process figures: flagged walls per room, full fallbacks, capture time, upload size and time, job time and cost.

**Proposed acceptance thresholds:**
- Median absolute wall error ≤5%, 90th percentile ≤10%, and no wall over 15% after per-wall fallback.
- Ceiling height within ±5 cm in 90% of rooms.
- Between-tester standard deviation ≤3%.
- **No worse than taps.** Compare wall by wall in pairs: the turn-around's median absolute error may be at most 1 percentage point worse than the tap flow's, and its 90th percentile no worse.
- At least 80% of doors and windows proposed, with widths within ±10 cm.
- At least 90% of scans without a full fallback, and no more than 1 flagged wall per room on average.

**Logging to `scanLogs`.**
- Bump `SCAN_LOG_VERSION` in `apps/mobile/scan/scan-log.ts` to 2, and add:
  - `captureMode`: `turn-landscape-3`, `turn-portrait-2` or `marks`;
  - `scanId`, linking the Storage folder and `scanFits`;
  - for each wall: the winning cue, its confidence, whether it was flagged, and any fallback mark;
  - the video format and fx;
  - yaw-gap statistics and the maximum turn speed;
  - timings for capture, upload and job;
  - model versions;
  - during the evaluation, `truthRoomKey`.
- `firestore.rules` caps a log at 60 keys and forbids updates. So write the log once, after the result arrives, and extend `validScanLog` for any new lists.
- A small script then joins `scanLogs`, `scanFits` and `scanTruth` to produce the metrics above.

## Q2: a Camera-app panorama cannot be measured to ±10%, but the same turn in the app can

**The direct answer is no.** A normal ~270° Camera-app panorama cannot be turned into a room measured to within 10%. It could give a rough 3D shape, but only with a layout model retrained for partial panoramas, and its size would rest on a guess. It is **worse than the in-app turn on every factor that sets accuracy.**

**The guessed camera height alone costs −9% to +15%.** Layout networks get scale only from the camera height and assume 1.6 m ([HorizonNet](https://arxiv.org/abs/1901.03861); [LGT-Net](https://arxiv.org/abs/2203.01824)). Zillow needed a calibration target "to allow camera height to be computed" ([ZInD](https://github.com/zillow/zind)). The arithmetic (derived):
- Standing eye height spans about 142–175 cm across the 5th–95th percentiles of US women and men ([NCSU anthropometry tables](https://ergocenter.ncsu.edu/wp-content/uploads/sites/358/2026/02/01-Anthropometry-Summary-Tables.pdf); column order unverified).
- Assume the phone sits 10–15 cm below the eyes. Then the true camera height is 1.30–1.65 m.
- A fixed 1.50 m guess then scales the room by −9% to +15%. The networks' 1.6 m default gives −3% to +23%.

**Even perfect inputs reach only 4–9%.** On proper 360° panoramas with the true height, the best networks score 84–92% 2D IoU, about 4–9% length error (derived), before the problems below are added.

| Limit | Camera-app panorama | In-app AR turn |
|---|---|---|
| **Scale** | Guessed camera height: −9% to +15% | Measured from the AR floor plane |
| **Vertical view** | <ul><li>1×: about ±32° (derived), so the floor line shows only for walls over ~2.3 m away. In a 3 × 3.5 m bedroom shot from the middle, that misses almost every floor line.</li><li>0.5× (about ±51°) is documented only by third parties ([PictureCorrect](https://www.picturecorrect.com/how-to-take-panoramas-with-an-iphone/); [Geeky Gadgets](https://www.geeky-gadgets.com/iphone-panorama-mode-everything-you-need-to-know/)).</li></ul> | Three landscape rings: about ±61°. Two portrait rings: about ±58°. |
| **Projection and horizon** | <ul><li>Undocumented, with no gravity metadata and no capture API in the iOS 27 SDK ([Apple Developer Forums 849360](https://developer.apple.com/forums/thread/849360)).</li><li>A wrong vertical-mapping guess costs about 3° at 30° below the horizon, or about 12% in distance (derived).</li></ul> | Exact intrinsics and gravity for every frame |
| **Stitching and parallax** | <ul><li>Handheld turns pivot around the body, and the stitcher hides the resulting parallax by warping slices ([Apple Developer Forums 849360](https://developer.apple.com/forums/thread/849360)).</li><li>About 7° of parallax at a wall 1.5 m away for frames 30° apart with a 0.35 m offset (derived).</li></ul> | Each frame's true ray origin is known. Measuring needs no stitching. |
| **The missing 90°** | <ul><li>A wall 1.75 m behind the user in a 3 m-wide room spans about 81° (derived), so it and both its corners can vanish. Its distance is then never observed.</li><li>Standing in a corner, or with your back nearer a wall than half the room's width, keeps every wall partly visible (derived).</li></ul> | Full 360° with coverage guidance |
| **Sweep** | Reportedly capped at 240°, a 2012-era figure seen only in snippets ([Skylum](https://blog.skylum.com/how-to-take-panoramic-photo-on-iphone/)). A 13,986 × 3,788 px example ([David Smith](https://www.david-smith.org/blog/2024/02/26/super-resolution-panoramas)) implies about 265° if it is a 26 mm cylinder (derived), so the true cap on the iPhone 15 is unknown. | 360° plus overlap |
| **Models** | Off-the-shelf networks collapse on partial or narrow input ([uLayout](https://arxiv.org/abs/2503.21562)), and no released weights are commercial (Q1a) | No layout network needed |

**Commercial products confirm the ceiling.** Matterport reportedly put 360-camera captures at 4–8% error (webinar transcript, snippet only: [WGAN](https://www.wegetaroundnetwork.com/topic/14220/transcript-video-matterport-shoptalk-16-webinar-10-feb-2021/)). A benchmark run by a competitor found Zillow's floor-plan living area 9.9% off (snippet only: [WGAN](https://wegetaroundnetwork.com/topic/19262/benchmarking-floor-plans-matterport-zillow-cubicasa-and-urbanimmersive)). Both used 360° cameras, calibration and human clean-up. **No product publishes an accuracy figure for an ordinary phone panorama.**

**The better idea is the same gesture inside the app.** Call it "panorama mode" in the UI:
- the user turns slowly, as in the Camera app;
- the app records poses and the floor plane, which makes the result metric;
- the same frames build a better 360° picture for tours (Q3).

**If a user imports a Camera-app panorama,** use it only as a backdrop picture. At most, offer a sketch scaled by one typed wall length, clearly labelled approximate.

## Q3: the same capture builds walkable 360° tours with true-size furniture inside

**Yes, the capture supports stitched equirectangular panoramas from posed keyframes, with several spots to jump between.** Each standing spot gives one panorama. Spots captured in one AR session already share one metric, gravity-aligned world frame, so they need no alignment step (derived). The only hard part is stitching.

### Stitch through the fitted room, not around a single point

**Off-the-shelf stitchers break on an arm's-length turn.** OpenCV's panorama mode, Hugin and PTGui all assume the camera rotates about its own optical centre ([OpenCV stitching.hpp](https://github.com/opencv/opencv/blob/4.x/modules/stitching/include/opencv2/stitching.hpp); [PanoTools wiki: Parallax](https://wiki.panotools.org/Parallax)). The panotools formula gives the misalignment in an 8192 px panorama (derived):

| Distance from the turning axis | Error at 1.5 m | Error at 3 m |
|---|---|---|
| 0.02 m (tripod-like) | ~7 px | ~4 px |
| 0.4 m (24° steps) | ~144 px | ~72 px |

**So reproject through the room YoungVista has just measured:**
1. Put the panorama centre c at the mean camera position, at the measured camera height.
2. Cast each panorama pixel's ray from c onto the fitted walls, floor and ceiling, giving a 3D point X.
3. Sample the keyframe whose own ray to X is most nearly parallel to the panorama ray. This is the strip-selection idea behind concentric mosaics and MegaParallax ([MegaParallax](https://richardt.name/megaparallax/)). Project X with that frame's intrinsics and pose.
4. Blend with OpenCV's graph-cut seams, block gain compensation and multiband blending ([stitching_detailed.cpp](https://github.com/opencv/opencv/blob/4.x/samples/cpp/stitching_detailed.cpp)).

**How exact it is.** The result is exact on flat room surfaces when the poses are good. Using the Q1 depth cloud as the proxy, as OmniPhotos does with its fitted proxy geometry ([OmniPhotos](https://richardt.name/omniphotos/)), shrinks errors on furniture. **No open-source project does this from ARKit-posed phone frames yet**, so it is custom code (Python with OpenCV `remap`). It can run as an extra step in the same Cloud Run job.

**Licences:**
- OpenCV is Apache-2.0 ([opencv/opencv](https://github.com/opencv/opencv)).
- Hugin and libpano13 are GPLv2 ([SourceForge](https://sourceforge.net/projects/hugin/)), so run them only as separate tools, never linked.
- PTGui is a paid, GUI-first product ([PTGui FAQ](https://www.ptgui.com/faq)).

**Coverage.** Three landscape rings cover about ±61° of pitch, and two portrait rings about ±58°. Fill the missing floor patch and ceiling cap from the room model's colours. Store the result as a partial panorama with Google's cropped-area tags (`FullPanoWidthPixels`, `CroppedAreaTopPixels` and so on: [Photo Sphere XMP](https://developers.google.com/streetview/spherical-metadata)).

**Resolution** (derived): 4:3 landscape frames carry about 28.5 px per degree. Deliver 8192×4096 (22.8 px per degree) for the web and 4096×2048 for phones. An 8K panorama needs about 128 MiB of GPU memory.
- About 99% of iOS WebGL reports allow 16384 px textures (snippet: [web3dsurvey](https://web3dsurvey.com/webgl/parameters/MAX_TEXTURE_SIZE)).
- WebKit has a reported bug where texture-heavy pages are killed under memory pressure (snippet: [WebKit bug 300782](https://bugs.webkit.org/show_bug.cgi?id=300782)).
- So tile anything above 8K.

**Photo quality.**
- Lock exposure per ring, or rely on gain compensation.
- ViroReact cannot bracket exposures, so windows will clip in plain JPEGs.
- The native keyframe module beats the recorder's 11 Mbps video on quality.

### Viewers: a custom React Three Fiber view, with Photo Sphere Viewer as the ready-made option

| Library | Licence | Status | Partial panoramas | Tours | Custom 3D furniture | Verdict |
|---|---|---|---|---|---|---|
| **Photo Sphere Viewer** | MIT | v5.15.1 (2026-08-02), active ([GitHub](https://github.com/mistic100/Photo-Sphere-Viewer)) | `panoData` or XMP ([docs](https://photo-sphere-viewer.js.org/guide/adapters/equirectangular.html)) | Virtual-tour plugin with fades and 3D arrows, markers, plan, map and gyroscope ([docs](https://photo-sphere-viewer.js.org/plugins/virtual-tour.html)) | `renderer.addObject()` ([Renderer.ts](https://github.com/mistic100/Photo-Sphere-Viewer/blob/main/packages/core/src/services/Renderer.ts)). But the panorama sphere has radius 10 and depth testing off, so furniture draws on top unless you add depth proxies ([constants.ts](https://github.com/mistic100/Photo-Sphere-Viewer/blob/main/packages/core/src/data/constants.ts); [EquirectangularAdapter.ts](https://github.com/mistic100/Photo-Sphere-Viewer/blob/main/packages/core/src/adapters/EquirectangularAdapter.ts)) | **Best off-the-shelf** |
| **Pannellum** | MIT | 2.5.7 (2026-02-19), which fixed CVE-2026-27210 ([release](https://github.com/mpetroff/pannellum/releases/tag/2.5.7)) | `haov`, `vaov`, `vOffset` ([reference](https://pannellum.org/documentation/reference/)) | Scenes and hot spots | No: it has its own WebGL renderer | Minimal viewer only |
| **Marzipano** | Apache-2.0 | Archived, last push 2023-10-08 ([GitHub](https://github.com/google/marzipano)) | — | — | — | Avoid |
| **Panolens.js** | MIT | Archived, v0.12.1 from 2021 ([GitHub](https://github.com/pchen66/panolens.js)) | — | — | — | Avoid |
| **Plain three.js / R3F + drei** | MIT | three.js r187 (2026-10-30), R3F 9.8.2 ([three.js](https://github.com/mrdoob/three.js); [R3F](https://github.com/pmndrs/react-three-fiber)) | Custom | Custom | Native, with every building block below | **Recommended.** The website already uses R3F |
| **krpano** | Commercial: €179, plus €299 for a branding-free licence ([krpano](https://krpano.com/buy/)) | 1.24 (2026-06-25) | Yes | Yes | Its own engine | Only if a closed viewer is acceptable |

**In the phone app, use a WebView running the same web viewer** (react-native-webview v17.1.0, released 2026-11-04: [releases](https://github.com/react-native-webview/react-native-webview/releases)).

**Gyroscope look-around in the WebView:**
- It needs `DeviceOrientationEvent.requestPermission()`, called from a tap, over HTTPS ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static)).
- react-native-webview never merged its iOS permission-delegate PR ([PR #2944](https://github.com/react-native-webview/react-native-webview/pull/2944)), and WebKit answers "prompt" when the delegate is missing ([Apple WebKit docs](https://developer.apple.com/documentation/webkit/wkuidelegate/webview(_:requestdeviceorientationandmotionpermissionfor:initiatedbyframe:decisionhandler:).md)).
- So put the "use motion" button inside the page, and expect iOS to show its own prompt (unverified on a device).

**ViroReact's `Viro360Image` is a cruder alternative.** It shows equirectangular images, including `.hdr` and stereo layouts ([Viro docs](https://viro-community.readme.io/docs/viro360image)). Paired with `Viro3DObject` furniture and an `.hdr` `ViroLightingEnvironment` ([docs](https://viro-community.readme.io/docs/virolightingenvironment)), it can show a furnished panorama. But:
- its docs describe no touch or gyroscope look-around outside VR mode;
- `ViroSceneNavigator` is deprecated ([docs](https://viro-community.readme.io/docs/viroscenenavigator));
- occlusion and shadow catchers are harder.

### Furniture drawn into the real picture, at true size

**Yes, the furniture can be drawn in.** The panorama, the fitted room and the placed furniture all live in one metric, gravity-aligned frame, so GLBs line up without any extra registration (derived). The recipe for the R3F viewer:
1. **Camera.** Put the virtual camera at the spot's centre c, at camera height h. For a quick version, drei's `<Environment ground>` or three.js `GroundedSkybox` projects the panorama onto a floor at "how far the camera that took the photo was above the ground" ([GroundedSkybox.js](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/GroundedSkybox.js); [drei Environment](https://github.com/pmndrs/drei/blob/master/src/core/Environment.tsx)).
2. **Room shell (better version).** Project the panorama onto the fitted wall, floor and ceiling meshes from c, with a small custom shader. Walls and corners then sit at their true positions.
3. **Furniture.** Load the GLBs at their saved poses, unchanged from the 3D and AR placement data.
4. **Shadows.** Add a `ShadowMaterial` floor, which "can receive shadows, but otherwise is completely transparent" ([ShadowMaterial.js](https://github.com/mrdoob/three.js/blob/dev/src/materials/ShadowMaterial.js)), lit by a light aimed from the brightest window.
5. **Occlusion.** Draw the walls depth-only first, using `colorWrite = false` with `renderOrder` ([Material.js](https://github.com/mrdoob/three.js/blob/dev/src/materials/Material.js)). Real furniture already in the room needs a depth-only proxy, built from the Q1 depth cloud. Without one, keep new pieces in clear floor areas.
6. **Lighting.** Use the panorama itself as the scene environment for reflections and fill light.

**Moving between spots.** Animate the camera from spot A to spot B, cross-fading the two projections on the same room shell. This is the standard image-based-rendering approach; Matterport patents smooth transitions ([US 9,786,097](https://uspto.report/patent/grant/9786097)) but has published no renderer details. A cheaper option is Photo Sphere Viewer's fade-plus-rotation transition ([Virtual Tour plugin](https://photo-sphere-viewer.js.org/plugins/virtual-tour.html)).

**Spots per room:**
- One spot for a small room (about 12 m² or less).
- Two or three for large or L-shaped rooms, 1.5–2.5 m apart and in sight of each other.
- One near each doorway, so the tour connects rooms.

This follows ZInD's average of about 3 panoramas per room layout (67,448 panoramas for 22,484 layouts, derived from [ZInD](https://github.com/zillow/zind)) and practitioners' 5–8 ft scan spacing (snippet: [We-Get-Around forum](https://forum.we-get-around.com/topic/917/distance-between-scans-for-warehouse/)).

## Q4: Nano Banana 2.1 on Vertex AI wins on price, setup and reference count

### The field in November 2026

**Who leads.** OpenAI's GPT-Image-2.5 Sunburst leads every leaderboard. Google's Nano Banana 2.1 sits in the top editing cluster at about one-sixth of the price. Leaderboard positions come from Artificial Analysis's editing board ([AA editing](https://artificialanalysis.ai/image/leaderboard/editing)) and Arena's edit board, dated Nov 2, 2026 ([Arena](https://arena.ai/leaderboard/image-edit)). Both are general-purpose boards with no interior or geometry category.

| Model (access) | Editing rank | Price per output image | Reference images | Max output | Region control | New account? |
|---|---|---|---|---|---|---|
| **Nano Banana 2.1** (`gemini-nano-banana-2.1`, Vertex GA since Oct 6, 2026, `global` only) | AA #5 (Elo 1152, tied #4–7); Arena #8 (1427, preliminary) | **1K $0.034 · 2K $0.05 · 4K $0.113**, plus $0.00168 per input image; batch half price (verified 2026-11-06) | 14 (10 object + 4 character) | 4K | Prompt-only "semantic masking"; no seed or temperature | **No** |
| Nano Banana 2 (`gemini-3.1-flash-image`) | AA #11 (1125) | 1K $0.067 · 2K $0.101 · 4K $0.151 | 14 | 4K | Prompt | No. Also offers US and EU multi-region |
| Nano Banana Pro (`gemini-3-pro-image`) | AA #18 (1109) | 1K/2K $0.134 · 4K $0.24 | 6 object + 5 character + 3 style | 4K | Prompt, with thinking | No |
| Imagen | — | Shut down ([Firebase AI Logic models](https://firebase.google.com/docs/ai-logic/models)) | — | — | — | — |
| GPT-Image-2.5 Sunburst (OpenAI API) | **AA #1 (1199); Arena #1 (1517)** | ~$0.21 at 1024² max quality (AA: $210.72 per 1,000), plus image input at $8 per 1M tokens | Several; maximum not stated | Longest edge 3840 px; above 2560×1440 is experimental | Soft mask, plus markup-guided edits | **Yes**, plus Organization Verification |
| FLUX 3 Image (BFL API) | AA #15 (1120) | 1K $0.048 · 2K $0.10 · 4K $0.607; references free | 10 | 4K | **Bounding boxes** on a 0–1000 grid for targeted edits | **Yes** (`x-key`) |
| Seedream 5.0 Pro (BytePlus) | AA #9 (1129); Arena #14 | From $0.045, plus $0.003 per extra reference | 10–14 (sources conflict) | 2K (snippet) | Points, lasso, boxes, coordinates (vendor claim) | **Yes** |
| Qwen-Image-Edit-2511 (open weights) | Not in AA's editing top 20 | Self-hosted (unmeasured), or fal at $0.03 per megapixel (from the 2026-11-05 notes) | Several | — | Prompt | No, if self-hosted on Cloud Run |
| MAI-Image-2.6 (Azure) | AA #6 (1149) | $38.91 per 1,000 (AA) | 5 (snippet) | 1.5K (snippet) | — | **Yes** |

Sources:
- Google:
  - IDs, stage and region: [Vertex Nano Banana 2.1 card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/nano-banana-2-1), checked today: "Launch stage: GA", "Release date: October 6, 2026", global only, 14 images per prompt.
  - Prices: [Vertex pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing), checked today: $1.50 per 1M input tokens, $30 per 1M image-output tokens, 1,120 tokens per input image; batch $0.75 / $15; "does not support Flex".
  - Reference limits: [Gemini API image docs](https://aistudio.google.com/docs/image-generation).
- OpenAI: [image guide](https://developers.openai.com/api/docs/guides/image-generation); [pricing](https://developers.openai.com/api/docs/pricing).
- BFL: [FLUX 3 editing](https://docs.bfl.ai/flux_3/flux3_image_layout); [pricing](https://bfl.ai/pricing).
- Seedream: [BytePlus Seedream](https://www.byteplus.com/en/product/Seedream); [Seedream 5.0](https://www.byteplus.com/en/activity/seedream5-0); [ModelArk docs, snippet](https://docs.byteplus.com/en/docs/ModelArk/1541523).
- Qwen: [HF Qwen-Image-Edit-2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511); [fal](https://fal.ai/models/fal-ai/qwen-image-edit-2511).
- MAI: [runtimewire, snippet](https://runtimewire.com/article/microsoft-mai-image-2-6-foundry-four-cents-image).

**How big the gap is** (derived from Elo). Sunburst's lead means it wins about 57% of editing votes against Nano Banana 2.1 on Artificial Analysis and about 63% on Arena. The gap is real but moderate, and it costs about 6× more per image.

**OpenAI is the benchmark ceiling, not the default.** Its own guide says the model "may have difficulty placing elements precisely in structured or layout-sensitive compositions" and that complex prompts "may take up to 2 minutes" ([OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation)).

**FLUX 3's bounding boxes are the best-documented "edit only this region" control.** BFL also notes that FLUX 3 "decides where each reference sits and how big" unless boxes are given ([bfl.ai FLUX 3 Image](https://bfl.ai/models/flux-3-image)). It makes a good comparison arm.

**The open-model options do not change the pick:**
- The newer Qwen-Image-2.1 is research-licence only ([HF](https://huggingface.co/Qwen/Qwen-Image-2.1)).
- Qwen-Image-Edit-2511 is Apache-2.0. It is the "no third party sees home photos" fallback, not the quality choice.

### Geometry stays only when the input already carries it

**No public 2026 benchmark measures whether these editors keep walls, windows and furniture placement.** The practitioner evidence agrees on three points:
- **Give the model a textured view with ambient occlusion, not a clay render.** Colours act as a "semantic map", and ambient occlusion tells the model "a cabinet stands on the floor, not floating 5 cm above it". Prompt "Keep the materials, framing and perspective as it is" ([CGwisdom](https://cgwisdom.com/blog/sketchup-and-nano-banana-pro-photorealistic-visualizations-in-5-minutes-is-this-the-end-of-v-ray.html)).
- **Expect these failures:**
  - furniture rendered out of proportion;
  - tables that levitate without contact shadows;
  - tilted walls;
  - mouldings that bow in extreme aspect ratios.

  These come from a vendor blog with unverified claims ([Kulfiy](https://www.kulfiy.com/a-guide-to-using-nano-banana-2-1-for-room-staging-in-furniture-ecommerce/)).
- **No hosted frontier API accepts a depth or edge map as a hard control.** A depth map is just another reference image. Hard guarantees need either re-compositing YoungVista's exact product pixels after generation, or a self-hosted ControlNet.

**Recipe (a): 3D render to photo.**
- **Images:**
  - Image 1: the dollhouse render, with textures, ambient occlusion and soft shadows, at the chosen camera.
  - Optional image 2: a line render from the same camera, labelled "layout guide; do not draw lines".
  - Images 3–10: up to 8 product thumbnails.
- **Prompt:** keep the camera, framing, perspective, walls, windows, doors, and every item's position and size. Change only materials, light and realism.

**Recipe (b): staging a real photo.**
- **Lowest risk:** use the AR screenshot, which already shows the furniture at true size, as image 1. The model then only relights and photorealises.
- **Higher risk:** a plain photo plus thumbnails, where the model places the furniture.

**Checks for both recipes:**
- Compare the output's edges and depth with YoungVista's own render, and reject drift.
- Always show the exact render beside the AI image, because wrong-scale furniture misrepresents a "real size" product.

### Real home photos: block people, prefer Vertex terms

**What Vertex filters.** It has explicit filters for children, people and faces, personal information in the prompt text, and celebrities ([Vertex responsible AI](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-image-responsible-ai)). `personGeneration` takes `ALLOW_ALL` (adults and children), `ALLOW_ADULT` or `ALLOW_NONE` ([enum](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/Shared.Types/PersonGeneration)).

**What to do:**
- Request `ALLOW_ADULT` or `ALLOW_NONE`, and add "do not add or alter people" to the prompt.
- Blur faces, people and documents on the phone before upload.
- When an output is blocked (`IMAGE_SAFETY`, or a refusal with `STOP`), show "AI couldn't process this photo". The app never names the provider.

**Why Vertex rather than the Gemini Developer API.** The Developer API's terms bar clients "likely to be accessed by individuals under the age of 18" and require paid services for the EEA, Switzerland and the UK ([Gemini API terms](https://aistudio.google.com/docs/terms)).

**Vertex's data terms:**
- Google "won't use your data to train or fine-tune any AI/ML models without your prior permission".
- A zero-data-retention path exists.
- Grounding with Google Search keeps logs for up to 3 days, so leave it off.
- On the global endpoint, cached data "can be served from any region" ([Agent Platform ZDR](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention)).

**Other providers' data terms:**
- OpenAI keeps image-endpoint data for 30 days for abuse monitoring ([OpenAI data](https://developers.openai.com/api/docs/guides/your-data)).
- BFL's privacy notice says inputs "may be retained and used" (from the 2026-11-05 notes: [BFL privacy](https://bfl.ai/privacy-policy)).
- BytePlus's data terms were not found.

### Exact setup for the recommendation

1. **Enable the API.** Turn on `aiplatform.googleapis.com` in `young-vista` ([Firebase AI Logic FAQ](https://firebase.google.com/docs/ai-logic/faq-and-troubleshooting)). The model lives on the **`global`** endpoint only.
2. **Call it from the server, not the app.**
   - Use a callable 2nd-gen Cloud Function or a small Cloud Run service in `us-central1`, guarded by Firebase Auth and App Check (App Attest).
   - Why not Firebase AI Logic's client SDK: its image generation is "Preview" with no SLA ([Firebase image generation](https://firebase.google.com/docs/ai-logic/generate-images-gemini)), and its React Native support is unclear.
   - The server keeps prompts and the model hidden, which supports the "always AI" rule.
3. **Grant the runtime service account** `roles/aiplatform.user` (snippet: [Vertex model reference](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/overview)), plus Storage read/write.
4. **Make the call.**
   - REST: `POST https://aiplatform.googleapis.com/v1/projects/young-vista/locations/global/publishers/google/models/gemini-nano-banana-2.1:generateContent`.
   - Or `@google/genai` with `vertexai: true` and `location: 'global'` ([Vertex generate images](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/image-generation)).
   - In `generationConfig`, set `responseModalities: ["TEXT","IMAGE"]` and `imageConfig: { aspectRatio, imageSize: "2K", personGeneration }`. Thinking: medium, or high for rooms with many items.
   - **Never send `seed`, `temperature`, `topP`, `topK` or `logprobs`**: "Setting any of these parameters returns an API error" ([model card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/nano-banana-2-1)).
5. **Run it as an async job.**
   - Write the image to Storage at `users/{uid}/rooms/{roomId}/pictures/{pictureId}.jpg`, with its metadata in `rooms/{roomId}/pictures` (the existing model in `build.md`).
   - Show progress meanwhile. Latency is about 16 s per 1K image, a second-hand figure attributed to Artificial Analysis ([digg](https://digg.com/ai/jt8yn55h)) and unverified.
6. **Keep the model ID in Remote Config or server config.** Firebase labels 2.1 "short-term availability", with retirement possible from 45 days after a successor ships ([Firebase AI Logic models](https://firebase.google.com/docs/ai-logic/models)). Re-run the evaluation set at every swap.
7. **Budget.** A 2K edit with 8 input images costs about $0.0134 + $0.05 ≈ **$0.064**, plus thinking tokens at $7.50 per million (derived). Batch halves it for re-renders that are not interactive.
8. **Fallbacks:**
   - `gemini-3.1-flash-image` on the `us` or `eu` multi-region, if residency is ever required ([Nano Banana 2 card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-image)).
   - The exact non-AI render, always.

## Where this updates the 2026-11-05 research

**Corrections and refinements:**
- **AI picture.** The earlier report advised shipping the exact render first and adding AI later as a labelled beta. That still holds, and `decisions.md` keeps AI after the demo. This report now names the model and its setup.
- **Depth models.** The earlier licence table treated MoGe-2 and DA3METRIC-LARGE as equally usable. New evidence ranks **MoGe-2 first**: DA3METRIC's per-frame scale varied 0.92×–1.67× within one room ([indoor_3d](https://github.com/YonatanSimson/indoor_3d)), and its training data includes non-commercial ARKitScenes ([DA3 paper](https://arxiv.org/html/2511.10647)).
- **Single-photo depth.** The earlier accuracy table gave AI depth from one photo "10–20% of size" with "arbitrary scale". Anchoring to the AR floor removes the arbitrary scale; what remains is a per-pixel residual of about 4–7%.
- **FLUX.1 Kontext.** The 2026-11-05 AI notes said BFL no longer lists it. **BFL's pricing page still lists it** as a legacy model at $0.04 (pro) and $0.08 (max) ([bfl.ai/pricing](https://bfl.ai/pricing)).
- **MapAnything releases.** One new note saw only the V1 release in its README. The releases page shows v1.1.3 on 2026-07-17 ([releases](https://github.com/facebookresearch/map-anything/releases)), so the releases page wins.
- **Panorama and layout weights.** The coordinator suggested using these weights "for evaluation or as a second opinion". The dataset terms exclude product use, and ZInD's terms exclude even improving product algorithms. So this report removes them from the product entirely (Q1a).
- **Gemini 2.5 Flash Image.** Google's pages give conflicting retirement dates. Firebase says Agent Platform shut down Gemini 2.5 models in October 2026 ([Firebase AI Logic models](https://firebase.google.com/docs/ai-logic/models)), so do not build on it.

## Not yet verified: check these before building

| Item | Why it matters | How to settle it |
|---|---|---|
| Which video format Viro runs on the iPhone 15 (4K 16:9 or 4:3), and whether the native module can switch it to 1920×1440 without upsetting Viro | Landscape rings overlap by only ~6° with 4K frames | Log `frames.json` and the session format on the device |
| `_startRecording`'s effect on the AR frame rate and tracking | The prototype path | Test on the device |
| ARKit pose accuracy during a body turn, and how repeatable the floor height is | The largest unmeasured terms in the error budget | Repeated captures against a laser meter |
| MoGe-2/3 and SAM 3 latency on an L4; Cloud Run GPU job start time | The 40–90 s latency estimate | Benchmark the container |
| Gemini door and window detection quality | Openings | A 20-keyframe test set |
| Nano Banana 2.1 geometry fidelity and latency (16 s is second-hand) | Q4 | 30 rooms × 3 viewpoints, scoring edge IoU and depth error, against GPT-Image-2.5 and FLUX 3 |
| WebView gyroscope prompt; Photo Sphere Viewer `addObject` with GLBs; `Viro360Image` look-around | Q3 viewers | A one-day prototype |
| iPhone 15 Camera panorama: 0.5× support and the sweep cap | Q2 detail | Shoot both and inspect them with exiftool |
| PLNAR's SDK platforms and prices; Polycam non-LiDAR floor plans | Q1f | Sales call; app test |
| The `roles/aiplatform.user` display name after the rename; which APIs Cloud Functions 2nd gen needs | Setup | Google Cloud console |
| Dataset terms behind Apache weights (DA3METRIC, `map-anything-apache`); SAM licence changes | Legal | Counsel |

## Conclusion

**The research moves the hard problem.** It is not "which AI measures rooms": no model measures rooms to ±10% on its own. It is "where is a wall that furniture hides". The evidence points to a geometric answer, and the team already trusts its core:
- the AR floor plane gives exact scale, as in today's tap solver;
- the ceiling line, which stays visible above beds and wardrobes, locates hidden walls;
- free space proves a wall cannot sit in front of what the camera saw past it.

AI then supplies dense evidence, through depth, masks and labels, and today's taps cover whatever the evidence cannot settle. The server bill is a few cents per room. The real cost is the 120-capture evaluation that turns the error budget into a number the team can promise.

**Licences, not accuracy, eliminated most of the famous models,** and the way out of that trap is the capture itself. Every consented turn-around scan, posed 4:3 keyframes plus the floor plane plus walls the user has confirmed, is a commercially clean training sample. The same files also build the 360° tours and feed the AI pictures. So the capture format is the asset to lock down first. Semi-supervised layout training reached 79.49% 2D IoU from only 100 labelled panoramas ([SemiLayout360](https://arxiv.org/abs/2503.01114)). A few hundred confirmed rooms could therefore plausibly train YoungVista's own layout model on MIT code, replacing the weights that today's datasets forbid.
