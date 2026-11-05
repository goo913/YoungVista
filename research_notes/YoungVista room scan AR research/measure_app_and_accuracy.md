# How Apple's Measure App Works, and Realistic Phone Measurement Accuracy for Room Scanning and Furniture Placement

Research date: 2026-11-05. Labels used below:
- **[V]**: I opened the primary source and checked it.
- **[S]**: secondary source, or one I saw only through a search snippet or abstract. Treat it as less certain.
- **[Calc]**: my own arithmetic from cited numbers.

Everything under "Inferences" is my reasoning, not a sourced fact.

---

## 1. How does Measure work technically (VIO, planes, raycasting, snapping, LiDAR depth/mesh), and which Measure features require LiDAR?

### Takeaway
Measure is an ARKit app. Visual-inertial odometry (camera feature tracking fused with the IMU) gives a metric 6-DoF camera pose. A ray cast from the on-screen reticle finds a 3D point, and the app reports the straight-line distance between two such points.
- **On phones without LiDAR**, the 3D point comes from detected or estimated planes and tracked feature points.
- **On LiDAR phones**, ARKit fuses a sparse time-of-flight grid of 576 laser dots with the RGB image into a dense 256×192 depth map, from which it builds a mesh. (Press reports describe the sensor as direct ToF; Apple says only that it "operates at the photon level at nano-second speeds".) This enables instant placement and three Measure features: person height, edge guides, and Ruler view. Apple documents all three as "supported models" features, and that link points to Apple's "Models with a LiDAR Scanner" list.
- Apple publishes no accuracy specification. It says "Measurements are approximate" and recommends 0.5–3 m.

### Cited Findings
**Measure app behaviour (iOS 27 user guide) [V]**
- Measure can "automatically detect the dimensions of rectangular objects or manually set the start and end points of a measurement." Apple's guidance is: "For best results, use Measure on well-defined objects located 0.5 to 3 meters (2 to 10 feet) from iPhone. (Measurements are approximate.)" — [Apple Support: Measure dimensions with iPhone](https://support.apple.com/guide/iphone/measure-dimensions-iphd8ac2cfea/ios)
- The workflow is: "slowly scan nearby objects". In manual mode you "align the dot at the center of the screen" with the start point, tap +, "slowly pan iPhone to the end point", and tap again. For automatic rectangles, "When iPhone detects the edges of a rectangular object, a white box frames the object." — [Apple Support](https://support.apple.com/guide/iphone/measure-dimensions-iphd8ac2cfea/ios)
- **Edge guides** work "on supported models". You "position the dot … along the straight edge of an object until a guide line appears", then pan along it. **Ruler view** also works "on supported models": "move iPhone closer to the measurement line until it transforms into a ruler, showing incremental units of length." — [Apple Support](https://support.apple.com/guide/iphone/measure-dimensions-iphd8ac2cfea/ios)
- Both "supported models" links on that page, and the one on the person-height page, go to the guide aside titled **"Models with a LiDAR Scanner"**. So person height, edge guides and Ruler view are LiDAR-only. — [Apple Support aside: Models with a LiDAR Scanner](https://support.apple.com/guide/iphone/aside/iphc07537a89/27/ios/27); [Apple Support: Measure a person's height](https://support.apple.com/guide/iphone/measure-a-persons-height-iph341d4a993/ios)
- **Person height** works "on supported models". It measures "from the floor to the top of their head, hair, or hat (You can even measure a person's seated height.)". You position the phone so the person "appears on the screen from head to toe". "After a moment, a line appears at the top of the person's head (or hair, or hat)". To re-measure, "turn iPhone away for a moment to reset the height." — [Apple Support: Measure a person's height](https://support.apple.com/guide/iphone/measure-a-persons-height-iph341d4a993/ios)
- Apple's 2020 launch description: "The LiDAR Scanner improves the Measure app, making it faster and easier to automatically calculate someone's height, while helpful vertical and edge guides automatically appear … The Measure app also now comes with Ruler View … and allows users to save a list of all measurements." The same release says every existing ARKit app "automatically gets instant AR placement" on LiDAR devices. — [Apple Newsroom, Mar 2020 (iPad Pro)](https://www.apple.com/newsroom/2020/03/apple-unveils-new-ipad-pro-with-lidar-scanner-and-trackpad-support-in-ipados/) [V]

**ARKit fundamentals that Measure relies on [V]**
- **VIO:** "ARKit uses a technique called visual-inertial odometry. This process combines information from the iOS device's motion sensing hardware with computer vision analysis of the scene … recognizes notable features in the scene image, tracks differences in the positions of those features across video frames, and compares that information with motion sensing data." Ray-casting finds "real-world surfaces corresponding to a point in the camera image", and plane detection "detects flat surfaces … and reports their position and sizes." — [Apple: Understanding World Tracking](https://developer.apple.com/documentation/arkit/understanding-world-tracking)
- **Documented failure modes** (same page):
  - "Tracking quality is reduced when the camera can't see details, such as when the camera is pointed at a blank wall or the scene is too dark."
  - "Excessive motion—too far, too fast, or shaking too vigorously—results in a blurred image."
  - "when a plane is first detected, its position and extent may be inaccurate … ARKit refines its estimate" over time.
  — [Apple: Understanding World Tracking](https://developer.apple.com/documentation/arkit/understanding-world-tracking)
- **Raycast targets:** "Raycasts can intersect with planes (flat surfaces) or meshes (uneven surfaces) … To intersect with meshes, see estimatedPlane." — [Apple: ARRaycastQuery](https://developer.apple.com/documentation/arkit/arraycastquery)
- **WWDC20 "Explore ARKit 4"** describes the LiDAR depth pipeline:
  - "The colored RGB image from the wide-angle camera and the depth readings from the LiDAR scanner are fused together using advanced machine learning algorithms to create a dense depth map"
  - It runs "60 times per second". The depth map "is smaller in resolution compared to the captured image".
  - Each pixel has a low/medium/high confidence because "highly reflective" or "high absorption" surfaces "can lower the accuracy".
  - Scene geometry (the mesh) aggregates depth "across multiple frames".
  - "Raycasting also leverages scene depth or scene geometry when available to instantly place objects in AR."
  — [WWDC20 session 10611](https://developer.apple.com/videos/play/wwdc2020/10611/)
- `sceneDepth` is nil unless you request the frame semantic. It is populated "with ARDepthData captured by the LiDAR scanner". The confidence map flags lower confidence "for surfaces that are highly reflective, or that have high light absorption." — [Apple: sceneDepth](https://developer.apple.com/documentation/arkit/arframe/scenedepth); [Apple: confidenceMap](https://developer.apple.com/documentation/arkit/ardepthdata/confidencemap)
- **Scene reconstruction** gives "a polygonal mesh that estimates the shape of the physical environment." Where "the LiDAR scanner may produce a slightly uneven mesh … ARKit smooths out the mesh where it detects a plane." It also removes mesh that overlaps people found by the `personSegmentation`/`personSegmentationWithDepth` semantics. — [Apple: sceneReconstruction](https://developer.apple.com/documentation/arkit/arworldtrackingconfiguration/scenereconstruction)
- **Depth map resolution:** Apple's ARKitScenes dataset paper lists "ARKit Depth" at **256 × 192**, against 1920 × 1440 laser-scanner ground truth. — [Baruch et al., ARKitScenes (Apple), arXiv 2111.08897, Table 1](https://arxiv.org/html/2111.08897) [V]
- **LiDAR hardware:**
  - A VCSEL "emits an array containing 8 × 8 points that is diffracted into 3 × 3 grids, making a total of 576 points". The focal length is 26 mm-equivalent, the same as the main camera, and maximum range is up to 5 m.
  - Point density is about 7,225 points/m² at 25 cm and 150 points/m² at 250 cm. The iPhone and iPad sensors were identical.
  — [Luetzenburg et al., Sci. Rep. 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8593014/) [V]
- Apple: the scanner "measures the distance to surrounding objects up to 5 meters away … operates at the photon level at nano-second speeds." — [Apple Newsroom 2020](https://www.apple.com/newsroom/2020/03/apple-unveils-new-ipad-pro-with-lidar-scanner-and-trackpad-support-in-ipados/) [V]
- Edge snapping before LiDAR: a 2018 hands-on of iOS 12 Measure reportedly found readings within about 1/8 inch on flat-faced objects, with points snapping to detected edges. — [AppleInsider, June 2018](https://appleinsider.com/articles/18/06/11/hands-on-with-the-new-arkit-measure-app-in-ios-12) [S: the page was bot-blocked; this comes from a search snippet; dated]

### Inferences
- **Manual point-to-point mode** is "raycast from the reticle, anchor the 3D hit in world coordinates, repeat for the end point, take the Euclidean distance". Error comes from two sources:
  - where each endpoint's ray lands: the depth or plane estimate at that pixel, plus how accurately the user aims the reticle;
  - VIO drift while the user pans between the endpoints.
- **Without LiDAR**, an endpoint can only land on a surface ARKit has already modelled: a detected or estimated plane, or a feature point. Anything else, such as the top of a head or the edge of a thin object, gets projected onto whatever plane lies behind it.
- **Person height**: Apple does not document the method. It probably combines person segmentation with LiDAR depth for the top of the head and a floor plane for the bottom (ARKit exposes `personSegmentationWithDepth`). This is not confirmed.
- **Measurement history**: the 2020 release grouped it with the LiDAR features. The current guide's "View and save measurements" page was not checked for a LiDAR requirement (see Gaps).

### Gaps
- Apple publishes no accuracy figure for Measure, no internal algorithm description, and no minimum LiDAR range.
- I could not confirm whether the measurement list/history still needs LiDAR in iOS 27.
- Apple does not document the exact snapping logic (edge or corner detection).

---

## 2. Which devices have LiDAR (Nov 2026), what share of iPhones have it, which Android phones have depth sensors, and how does the ARCore Depth API work?

### Takeaway
**iPhones with LiDAR:** Apple's iOS 27 guide lists only the Pro and Pro Max models from iPhone 12 Pro through **iPhone 18 Pro / 18 Pro Max**. Not on the list:
- iPhone 16e, 17, 17e and Air;
- the new "iPhone Duo", which the guide's topics suggest is Apple's foldable.

**Android:** almost no current phone has a rear time-of-flight (ToF) sensor. Instead, more than 88% of active ARCore devices (May 2026) support the Depth API, which estimates depth from camera motion using software and ML. It gives good results from 0.5 to 5 m, but Google itself says it is imprecise on white walls and needs the user to move the phone.

**LiDAR share:** no published installed-base figure. My estimate is roughly 35–45% of active US iPhones. That is an inference, not data.

### Cited Findings
- **Apple's list, "Models with a LiDAR Scanner" (iOS 27 guide):** iPhone 12 Pro, 12 Pro Max, 13 Pro, 13 Pro Max, 14 Pro, 14 Pro Max, 15 Pro, 15 Pro Max, 16 Pro, 16 Pro Max, 17 Pro, 17 Pro Max, **18 Pro, 18 Pro Max**. Nothing else. — [Apple Support aside](https://support.apple.com/guide/iphone/aside/iphc07537a89/27/ios/27) [V]
- **Models in the same guide but missing from the LiDAR list:**
  - iPhone 11 series, SE 2/3, 12/12 mini, 13/13 mini, 14/14 Plus, 15/15 Plus, 16/16 Plus, **16e, 17, iPhone Air, 17e, and iPhone Duo**;
  - No non-Pro "iPhone 18" appears in the guide.
  - The guide includes topics such as "Pose iPhone Duo" and "Open two apps in Split View on iPhone Duo".
  — [Apple Support iPhone User Guide (iOS 27) table of contents](https://support.apple.com/guide/iphone/measure-dimensions-iphd8ac2cfea/ios) [V]
- **iPad Pro** has had LiDAR since the March 2020 model. — [Apple Newsroom 2020](https://www.apple.com/newsroom/2020/03/apple-unveils-new-ipad-pro-with-lidar-scanner-and-trackpad-support-in-ipados/) [V]
- **RoomPlan** "is supported on all LiDAR-enabled iPhone and iPad Pro models." — [WWDC22 session 10127](https://developer.apple.com/videos/play/wwdc2022/10127/) [V]
- **Sales mix (US):** CIRP data reported in November 2024 put Pro Max at 26% and Pro at 19% of US iPhone sales (45% Pro). Base models were 42% and Plus 13%. — [MacRumors, 21 Nov 2024 (CIRP)](https://www.macrumors.com/2024/11/21/best-selling-iphone-model-sizes-revealed/) [V]
- **Sales mix (global):** Counterpoint reportedly ranked the iPhone 17 the top-selling phone worldwide in Q1 2026 (about 6%), with the two 17 Pro models in 2nd and 3rd place. — [9to5Mac, May 2026](https://9to5mac.com/2026/05/04/report-iphone-17-ranked-as-worlds-top-selling-smartphone-in-q1-2026/) [S]
- **ARCore Depth API — how it works:**
  - "uses a depth-from-motion algorithm … compares [images] to estimate the distance to every pixel as a user moves their phone. It selectively uses machine learning to increase depth processing, even with minimal motion".
  - "If the device has a dedicated depth sensor, such as ToF, the algorithm automatically merges data", which also "provides better depth on surfaces with few or no features, such as white walls".
  — [Google ARCore: Depth adds realism](https://developers.google.com/ar/develop/depth) [V]
- **ARCore Depth API — range and limits:**
  - "robust, accurate depth estimates from 0 to 65 meters away. The most accurate results come when the device is half a meter to about five meters away".
  - "Surfaces with few or no features, such as white walls, will be associated with imprecise depth".
  - "Valid depth data are only available after the user has started moving their device".
  - Support is limited to devices "with the processing power to support depth".
  — [Google ARCore: Depth](https://developers.google.com/ar/develop/depth) [V]
- **ARCore Raw Depth** gives more accurate depth on a subset of pixels, plus a per-pixel confidence image. Full Depth fills every pixel by smoothing and interpolation. — [Google ARCore: Raw Depth](https://developers.google.com/ar/develop/java/depth/raw-depth) [S]
- **Depth API device support:**
  - "As of May 2026, over 88% of active devices support the Depth API."
  - I counted 1,382 device entries marked "Supports Depth API", including the Pixel 10/11 series and the Galaxy S20 through S26 series.
  — [Google: ARCore supported devices](https://developers.google.com/ar/devices) [V for the quote; Calc for the count]
- **ToF on Android flagships:**
  - Samsung's Galaxy S20+/S20 Ultra (2020) were reported as its last flagships with a rear 3D ToF sensor. The Note 20 and S21 dropped it.
  - Reports in 2021 said the S22 would also lack ToF and that Samsung would not bring it back. The reasons given were weak consumer use and indirect-ToF hardware lagging Apple's direct-ToF LiDAR.
  - These were press reports relaying Korean supply-chain leaks, not official statements.
  — [SamMobile, Apr 2020](https://www.sammobile.com/news/samsung-could-be-ditching-camera-sensor-galaxy-note-20/); [PhoneArena](https://www.phonearena.com/news/no-tof-for-5g-galaxy-s21-because-of-apple_id126620); [iMore](https://imore.com/samsung-might-be-about-ditch-time-flight-sensors-future-phones) [S]
- **Texture matters more than the depth API (preprint, 13–14 Oct 2026; 600 gimbal-controlled runs on ToF, passive and LiDAR phones):**
  - ARCore delivered a depth image on 26–84% of frames in a textured room but only 0.4–11% in a bare room. ARKit delivered depth on every frame.
  - Turning the depth API on did not reduce anchor drift in any condition.
  - 21% of runs in the bare room ended more than 0.5 m from their origin, against 3% in the textured room.
  — [Research Square preprint rs-10991704](https://www.researchsquare.com/article/rs-10991704) [V for the abstract; not peer-reviewed]

### Inferences
- **LiDAR share of active iPhones:**
  - Every Pro since late 2020 has LiDAR, and Pro models were about 45% of US iPhone sales in 2024.
  - Most active iPhones are 2020-or-later models.
  - So LiDAR is probably on roughly 35–45% of active US iPhones in late 2026 (about 0.85 × 0.45).
  - Globally the share is likely similar or lower, depending on region. This is an inference; no source gives the figure.
- **Android:** in practice, YoungVista should assume no Android phone has hardware depth. Every Android user gets depth-from-motion. Its weakest case (white, bare walls) is exactly the typical room-scan case.
- **iPhone 18 lineup:** the absence of a base "iPhone 18" from Apple's guide fits a split launch (Pro and foldable in fall 2026, base model later). The guide does not say this; I am inferring it.

### Gaps
- No published installed-base share of LiDAR iPhones, US or global.
- No authoritative 2024–2026 list of Android phones with rear ToF that ARCore uses.
- Google publishes no numeric error (cm or %) for the Depth API, and I found no peer-reviewed benchmark of it.
- Depth API image resolution is not stated in Google's docs. One blog claims 160×90; unverified.

---

## 3. Published accuracy evidence (Measure; LiDAR depth and meshes; RoomPlan; non-LiDAR point-to-point; ARCore Depth) and how error scales

### Takeaway
**LiDAR iPhones:**
- About ±1 cm on objects 10 cm–1 m across, scanned at close range.
- About 1–3.5 cm on single-room or hall measurements made with good technique.
- Rising to 8–10 cm RMS in long corridors and decimetres over large or outdoor scenes.
- Long or drifting captures occasionally produce errors of tens of cm.

**RoomPlan:** Apple publishes only detection precision and recall, not centimetre accuracy. I found no peer-reviewed dimensional study. The one documented developer test was +37 cm on a 6.45 m wall (+5.8%).

**Without LiDAR:** the best documented room test (2017) found wall errors of 3–20 cm, averaging 8.5 cm. The literature puts drift at about 1% of the distance walked.

**ML depth alone** is far worse than LiDAR-fused depth.

**Error grows with** distance, scene size, path length, low texture, glass and mirrors, and darkness.

### Cited Findings
**(a) Measure app**
- **Children's height (LiDAR iPhone vs stadiometer; ESPE 2024 conference abstract):**
  - 50 children aged 2–18; three readings per method, averaged.
  - Conditions were "a well-lit room, participants standing against a plain white wall, free of accessories, at a fixed 3-meter distance".
  - Mean height was 147.5 cm by stadiometer and 147.3 cm by app. Mean absolute difference 0.2 cm (±0.1); ICC 0.99.
  — [ESPE 2024 abstract, Al Jalila Children's Hospital](https://abstracts.eurospe.org/hrp/0098/hrp0098p1-310) [V; abstract only, not a peer-reviewed paper]
- **Tree diameter (forestry):** two LiDAR AR measuring apps, reportedly including Measure, were tested against calipers for diameter at breast height. Pooled data reportedly supported sub-centimetre accuracy. — [ScienceDirect 2024, S157495412400092X](https://www.sciencedirect.com/science/article/pii/S157495412400092X) [S]

**(b) iPhone/iPad LiDAR depth and scene reconstruction**
- **Luetzenburg et al. 2021 (Sci. Rep., iPhone 12 Pro/iPad Pro, 3d Scanner App):**
  - Small objects with sides over 10 cm: absolute accuracy ±1 cm.
  - A 130 × 15 × 10 m coastal cliff: ±10 cm.
  - Against SfM photogrammetry, 80% of cliff points were within 15 cm and 92% within 30 cm. Rough and sloped surfaces were worse than flat ones.
  — [PMC8593014](https://pmc.ncbi.nlm.nih.gov/articles/PMC8593014/) [V]
- **Sensors 2024 (iPhone 14 Pro vs HoloLens 2 against terrestrial-scanner ground truth; doi 10.3390/s24041062):**
  - Best-strategy mesh accuracy was 3.5 cm with PIX4DCatch and 2.7 cm with 3D Scanner on the iPhone; 3.1 cm for HoloLens 2.
  - Round-trip paths on the iPhone "occasionally resulted in significant drift", with walls "severely misaligned". The authors suspect these apps lack loop closure.
  - Their literature review: earlier smartphone AR mapping reached "an absolute 3D accuracy of around 1% of walking distance … and sub-centimeter local 3D accuracy". A cited iPhone 13 Pro study found an average absolute distance of 9 cm from scanner data.
  — [PMC10893111](https://pmc.ncbi.nlm.nih.gov/articles/PMC10893111/) [V]
- **HBRC Journal 2024 (iPad Pro 2021 vs Trimble TX8, university hall):** with static multi-scan acquisition, "linear readings were 1–2 cm off, while area measurements were around 1-meter square accuracy." — [doi 10.1080/16874048.2024.2408839](https://doi.org/10.1080/16874048.2024.2408839) [V: abstract via Semantic Scholar]
  - A search snippet also claimed moving (dynamic) scans held 1–2 cm on 1–3 m features but up to ±30 cm on features over 4 m. [S, unverified]
- **Hamdan, Loghmanieh & Bertalan 2026 (J. Geovisualization & Spatial Analysis, 22 Sep 2026, CC BY 4.0; free apps Modelar, 3D Scanner, SiteScape vs Trimble X7):**
  - RMS deviation was 1.3–2.0 cm on a statue, **8.1–10.3 cm in an indoor corridor**, and 3.7–8.5 cm on a façade (lower without glazed openings, higher with).
  - Excluding windows cut the spread by up to 50%: "specular reflection from glass, rather than generic SLAM drift" dominated façade error.
  - SiteScape lost trajectory in the corridor (a 180° wall inversion).
  - "Point density is an unreliable proxy for geometric quality."
  — [doi 10.1007/s41651-026-00288-x](https://link.springer.com/article/10.1007/s41651-026-00288-x) [V: abstract via Crossref]
- **Askar & Sternberg 2023 (Geomatics; iPhone 13 Pro, four apps vs terrestrial scanner):** results varied by app on the same device, and "there is room for improvement, particularly in tracking the device's position". The technology suits "indoor navigation and the generation of quick floor plans." — [doi 10.3390/geomatics3040030](https://doi.org/10.3390/geomatics3040030) [V: abstract]

**(c) RoomPlan**
- **Apple ML research:**
  - Wall and window detection reached 95% precision and recall, doors 90%, measured by 2D box overlap (IoU).
  - 3D object detection averaged 91% precision and 90% recall at 30% 3D IoU across 16 categories.
  - Voxel resolution is 3 cm (x, y) × 30 cm (z), supporting rooms up to 15 × 15 m and 3.6 m high. Apple calls the measurements "highly accurate" but gives no cm or % dimension error.
  - Ground truth came from a Faro Focus S70 (about four scans per room).
  — [Apple ML Research: RoomPlan](https://machinelearning.apple.com/research/roomplan) [V]
- **WWDC22 operating envelope:**
  - "works best for a single residential room with a maximum room size of 30 feet by 30 feet or around 9 by 9 meters".
  - "minimum 50 lux". "Full-height mirrors and glass pose a challenge". "high ceilings could exceed the limit of the scanning range". "very dark surfaces could be hard".
  - Avoid "single long scans over 5 minutes".
  — [WWDC22 session 10127](https://developer.apple.com/videos/play/wwdc2022/10127/) [V]
- **it-jim developer blog (24 Feb 2025):**
  - In its demo space, a 6.45 m length came out as 6.821 m (+37 cm).
  - "An error of ±5 cm in a 1-meter wall may seem minor, but … such errors accumulate."
  - Walls are often set to a standard ~16 cm thickness. Mirrors create gaps or phantom objects. Near-right angles are forced to 90°. Curved walls and columns are simplified.
  - "This behavior has been improved in iOS 18" (wall boundaries).
  — [it-jim](https://www.it-jim.com/blog/roomplan-framework-by-apple/) [V; vendor blog, a single example]

**(d) Point-to-point and room measurement without LiDAR (ARKit/ARCore)**
- **ARKit 1 room-plan app (Medium, 28 Nov 2017; non-LiDAR iPhone, walls compared with manual measurements):** "the accuracy is 3–20 cm (1–8 inches) with an average of 8.5 cm (3.3 inches) … most of the measurements have an error below 10 cm". The authors' earlier pre-ARKit app (about 2015) managed 20–40 cm. — [Medium/Inborn Experience (via Wayback)](https://medium.com/inborn-experience/getting-a-room-plan-with-arkit-the-case-where-size-matters-1e104ee42421) [V; old ARKit, likely pessimistic for 2026]
- **Drift:** the "~1% of walking distance" figure for smartphone AR mapping. — [Sensors 2024 review](https://pmc.ncbi.nlm.nih.gov/articles/PMC10893111/) [V]
- **Anchor drift without texture (2026 preprint):** in a bare room, 21% of runs drifted more than 0.5 m after four 330° pans, against 3% in a textured room. — [Research Square](https://www.researchsquare.com/article/rs-10991704) [V abstract; preprint]

**(e) ARCore Depth API**
- Google gives only qualitative accuracy: best at 0.5–5 m, imprecise on white walls, requires motion. — [Google ARCore Depth](https://developers.google.com/ar/develop/depth) [V]
- In a bare room, depth arrived on only 0.4–11% of frames. — [Research Square](https://www.researchsquare.com/article/rs-10991704) [V; preprint]
- **ML depth vs LiDAR depth:** on ARKitScenes, ARKit's LiDAR-based depth reached RMSE 0.04 m and AbsRel 0.02. State-of-the-art monocular models (ZoeDepth, ZeroDepth and others) were "significantly" worse; the best ZoeDepth variant was 0.22 RMSE and 0.15 AbsRel worse. The authors also flag that varying camera parameters break generalisation. — [Mobile AR Depth Estimation: Challenges & Prospects, arXiv 2310.14437](https://arxiv.org/html/2310.14437) [V]

**How error scales with conditions**
- **Distance:** LiDAR point density falls about 48× from 25 cm to 250 cm (7,225 to 150 points/m²), and maximum range is 5 m. — [Luetzenburg 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8593014/) Apple's Measure sweet spot is 0.5–3 m. — [Apple Support](https://support.apple.com/guide/iphone/measure-dimensions-iphd8ac2cfea/ios) ARCore's is 0.5–5 m. — [Google](https://developers.google.com/ar/develop/depth)
- **Scene and object scale:** error goes from 1.3–2.0 cm (statue) to 8–10 cm (corridor) — [Hamdan 2026](https://link.springer.com/article/10.1007/s41651-026-00288-x) — and from ±1 cm on small objects to ±10 cm on a cliff — [Luetzenburg 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8593014/).
- **Path length and drift:** about 1% of distance walked; round trips can misalign walls when there is no loop closure. — [Sensors 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10893111/)
- **Lighting:** RoomPlan needs at least 50 lux — [WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/). Tracking degrades "when the scene is too dark" — [Apple](https://developer.apple.com/documentation/arkit/understanding-world-tracking).
- **Textureless surfaces:** "blank wall" degrades tracking — [Apple](https://developer.apple.com/documentation/arkit/understanding-world-tracking). "White walls … imprecise depth" — [Google](https://developers.google.com/ar/develop/depth). The bare-room drift and depth-coverage numbers are in the preprint — [Research Square](https://www.researchsquare.com/article/rs-10991704).
- **Reflective and absorbing surfaces:** these lower LiDAR confidence — [Apple confidenceMap](https://developer.apple.com/documentation/arkit/ardepthdata/confidencemap). Mirrors and glass are a challenge for RoomPlan — [WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/). Glass is the dominant façade error — [Hamdan 2026](https://link.springer.com/article/10.1007/s41651-026-00288-x).

### Inferences
- Rough consensus from the sources above, by device and task:

| Device | Task | Typical error |
|---|---|---|
| LiDAR iPhone | Local measurement at 0.5–2 m | About ±1 cm |
| LiDAR iPhone | Single-room wall length, good technique | About 1–3 cm (≈0.5–1%) |
| LiDAR iPhone | Corridors, glass, long or round-trip paths | 5–10 cm RMS, occasionally 30–40 cm (≈5%) |
| Phone without LiDAR | Room wall length | About 3–20 cm |

- The ESPE 0.2 cm result is a best case: controlled conditions, averaged readings. It should not be read as typical consumer accuracy.

### Gaps
- No peer-reviewed study of RoomPlan wall, room or opening dimensions against tape or laser that I could find.
- No recent (2023–2026) controlled study of non-LiDAR ARKit/ARCore point-to-point accuracy. The best number is from 2017.
- No peer-reviewed numeric accuracy for the ARCore Depth API.
- Full texts of the HBRC 2024 and Geomatics 2023 papers were bot-blocked, so their per-feature numbers could not be checked.

---

## 4. What explains the team's own results (height 5'1"/5'4" vs 5'5"; a MacBook "not accurate at all" from a distance; point-to-point better than whole objects), and does getting closer help?

### Takeaway
**Height:** the two readings were −10.2 cm (−6.2%) and −2.5 cm (−1.5%) [Calc]. Both are far worse than the 0.2 cm controlled-condition result, which points to the capture conditions rather than the sensor. Likely causes: person not fully in frame or floor not well detected, posture, a non-LiDAR phone, or the "true" 5'5" being a self-report.

**MacBook from a distance:** a predictable failure. A ~30 cm, ~1.5 cm-thick, partly glossy object 2–3 m away covers only a few real LiDAR samples (or none on non-LiDAR phones). Small aiming errors are multiplied by distance.

**Getting closer:** yes, it helps, down to about 0.5 m. Apple's 0.5–3 m guidance, Ruler view appearing when you move closer, and point density falling with distance all confirm the direction.

### Cited Findings
- **How height works:** it needs LiDAR ("supported models"), the person in frame "from head to toe", measures to the top of "head, hair, or hat", and you must turn the phone away to reset before re-measuring. — [Apple Support](https://support.apple.com/guide/iphone/measure-a-persons-height-iph341d4a993/ios) [V]
- **Best case:** 0.2 cm mean absolute difference, but only with good light, a plain white wall, no accessories, a fixed 3 m distance and three averaged readings. — [ESPE 2024](https://abstracts.eurospe.org/hrp/0098/hrp0098p1-310) [V]
- **Depth data limits:**
  - Depth is a 256×192 map produced by ML fusion of 576 LiDAR dots with RGB. — [ARKitScenes](https://arxiv.org/html/2111.08897); [WWDC20](https://developer.apple.com/videos/play/wwdc2020/10611/); [Luetzenburg](https://pmc.ncbi.nlm.nih.gov/articles/PMC8593014/)
  - Density is 7,225 points/m² at 25 cm vs 150 points/m² at 250 cm. — [Luetzenburg](https://pmc.ncbi.nlm.nih.gov/articles/PMC8593014/)
  - Reflective or absorbing surfaces get low confidence. — [Apple](https://developer.apple.com/documentation/arkit/ardepthdata/confidencemap)
- **Apple's guidance:** "well-defined objects located 0.5 to 3 meters". Ruler view appears when you "move iPhone closer". — [Apple Support](https://support.apple.com/guide/iphone/measure-dimensions-iphd8ac2cfea/ios)
- **Plane estimates take time to settle:** they "may be inaccurate" when first detected. — [Apple](https://developer.apple.com/documentation/arkit/understanding-world-tracking)
- **Close range has its own limits:** a 2026 data and code record studies "close-range limits of trustworthy ARKit scene depth" on an iPhone 17 Pro from 86 to 739 mm. I did not see its numbers. — [Zenodo 23577624](https://zenodo.org/records/23577624) [S]

### Inferences
**Height readings**
- **Arithmetic:** 5'5" = 165.1 cm; 5'1" = 154.9 cm (−10.2 cm); 5'4" = 162.6 cm (−2.5 cm). The two readings differ by 7.6 cm, so the problem is inconsistent capture, not a fixed bias.
- **Likely causes of under-reading** (hair and hats push the reading up, not down):
  1. Feet or floor not fully in frame, or the floor detected at the wrong height (a rug, clutter, or a floor plane that had not settled).
  2. Slouching, head tilted, or knees bent.
  3. The reading taken before the top-of-head line stabilised, or not reset between tries.
  4. Range too long: at 3–5 m the LiDAR samples are about 10–20 cm apart, so the top-of-head estimate relies on ML interpolation.
  5. If the test phone had no LiDAR (non-Pro, Air, e), the automatic height feature does not exist. A manual tap at the top of the head would land on the wall or plane behind the person, which explains errors of several cm.
  6. The reference "5'5"" may be self-reported or measured in shoes.
- **One ~2.5 cm reading is within the realistic consumer range.** The −10 cm reading is a capture failure.

**MacBook from a distance**
- **A 14" MacBook is about 31 cm wide and 1.5 cm thick** (approximate; not sourced here).
- **Too few real samples:** from Luetzenburg's densities, real LiDAR samples are about 1.2 cm apart at 0.25 m but about 8 cm apart at 2.5 m [Calc: 1/√density]. At 2.5 m the laptop's width spans only about 4 real samples. Its edges and its 1.5 cm step above the table therefore come from interpolated depth, and edge pixels mix laptop and table depth (the classic "flying pixel" effect of time-of-flight sensors; general knowledge, not sourced here).
- **Aiming error grows with distance** [Calc]: a 1° aiming error moves the endpoint about 1.7 cm at 1 m, 3.5 cm at 2 m and 5.2 cm at 3 m. On a 31 cm object, the 3 m figure is already about 17% per endpoint.
- **Glossy surfaces:** the screen and aluminium give low LiDAR confidence. Without LiDAR, endpoints snap to the table plane, so the laptop's own edges are not "seen" in depth at all.

**Why point-to-point beats whole-object measurement**
- The user chooses two well-defined points, often on a surface ARKit has already modelled.
- Automatic whole-object or rectangle measurement depends on detecting edges and segmenting the object, which degrades with distance and on 3D or glossy objects.
- For a 3D object, "its size" is ambiguous (which edges count).

**Does getting closer help? Yes, with caveats**
- Denser real depth samples, smaller aiming lever-arm, and more pixels per edge for snapping.
- But once both ends no longer fit in view, the user has to walk or pan, which adds VIO drift (about 1% of the path).
- Very close range (under about 0.3–0.5 m) may fall outside LiDAR's reliable range; unconfirmed.
- Practical rule: aim at each endpoint from about 0.5–1.5 m, pan slowly, keep texture in view, and repeat 2–3 times.

### Gaps
- I don't know which iPhone model the team used (LiDAR or not), or whether the height was measured with the automatic feature or point-to-point. This decides which explanation applies.
- Apple does not document LiDAR minimum range or edge-snapping behaviour.
- No published study of Measure on small objects at increasing distance.

---

## 5. Realistic accuracy for four cases, and is it "close enough" for a sofa to look right?

### Takeaway
1. **Product scale in a live AR view** is the easiest case. The 3D model's dimensions are exact; only tracking scale and floor placement add error, plausibly 1–2%. The bigger real-world risk is users accidentally resizing models.
2. **LiDAR room scans (RoomPlan):** about 1–3 cm per wall in a normal room, with occasional 5–40 cm outliers. Good enough for "sofa looks right" and most fit checks.
3. **Phones without LiDAR:** roughly 5–10 cm typical per wall, up to about 20 cm, and badly unreliable in bare white rooms. Fine for a demo; marginal for tight fit decisions unless the user supplies a reference measurement.
4. **ML-only monocular depth:** errors around 10–20% unless anchored to a known dimension. Good enough only for "looks plausible".

**What people notice:** AR studies suggest a size change of about 3–5% is the discrimination threshold (unverified). Yet one usability test showed a user not noticing a table at 79% of true size.

### Cited Findings
- **Case 1 – placement on LiDAR devices:** LiDAR devices get "instant AR placement", and raycasts use "scene depth or scene geometry when available to instantly place objects". — [Apple Newsroom 2020](https://www.apple.com/newsroom/2020/03/apple-unveils-new-ipad-pro-with-lidar-scanner-and-trackpad-support-in-ipados/); [WWDC20](https://developer.apple.com/videos/play/wwdc2020/10611/) [V]
- **Case 1 – placement without LiDAR:** the initial plane estimate "may be inaccurate" and is refined over time. — [Apple](https://developer.apple.com/documentation/arkit/understanding-world-tracking) [V]
- **Case 1 – accidental resizing (Baymard Institute, 15 May 2024):**
  - 87% of users largely avoided AR features when furniture shopping.
  - One participant "accidentally resized [a table] to 79% of its true size, but didn't notice initially", while checking whether it fit.
  - Others resized the 3D model without realising it, or forgot they had, and judged size or fit wrongly.
  — [Baymard](https://baymard.com/blog/deprioritize-view-in-room-augmented-reality) [V]
- **Case 1 – size discrimination in AR:** people detect size changes of virtual AR objects at about 3.1–5.2%, with a point of subjective equality near 4%. — [HAL hal-04358138 "Can You Perceive the Size Change? Discrimination Thresholds for Size Changes in Augmented Reality"](https://dumas.ccsd.cnrs.fr/LISN-ARAI/hal-04358138v1) [S: page bot-blocked; numbers from a search summary]
- **Case 2 – LiDAR room scans:**
  - Static iPad scans: 1–2 cm on hall lengths. — [HBRC 2024](https://doi.org/10.1080/16874048.2024.2408839)
  - iPhone 14 Pro mesh: 2.7–3.5 cm. — [Sensors 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10893111/)
  - Corridor: 8–10 cm RMS. — [Hamdan 2026](https://link.springer.com/article/10.1007/s41651-026-00288-x)
  - One RoomPlan wall: +37 cm on 6.45 m. — [it-jim](https://www.it-jim.com/blog/roomplan-framework-by-apple/)
  - RoomPlan is designed for rooms up to about 9×9 m. — [WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/)
- **Case 3 – without LiDAR:**
  - ARKit (2017) walls: 3–20 cm, average 8.5 cm. — [Medium 2017](https://medium.com/inborn-experience/getting-a-room-plan-with-arkit-the-case-where-size-matters-1e104ee42421)
  - About 1% of distance walked. — [Sensors 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10893111/)
  - ARCore depth on only 0.4–11% of frames in a bare room, and more than 0.5 m drift in 21% of bare-room runs. — [Research Square 2026](https://www.researchsquare.com/article/rs-10991704)
- **Case 4 – ML-only:** zero-shot monocular models fall well short of ARKit's LiDAR-fused depth. The best ZoeDepth variant was +0.22 m RMSE and +0.15 AbsRel worse; ARKit was 0.04 m and 0.02. — [arXiv 2310.14437](https://arxiv.org/html/2310.14437) [V]
  - Newer models report about 4.7% AbsRel on NYUv2, but only after scale/shift alignment — which is not true metric accuracy. — [NVIDIA NGC: NvDepthAnythingV2](https://catalog.ngc.nvidia.com/orgs/nvidia/teams/tao/models/nvdepthanythingv2) [S]

### Inferences
**Realistic error envelope** (my synthesis; assumes a typical 3.5–4.5 m living room and a 2.2 m sofa):

| Case | Typical | Bad case | Sofa "looks right"? | Supports a fit decision? |
|---|---|---|---|---|
| 1. Product in live AR (LiDAR) | ~1–2% scale; floor height ~1 cm | Placement offset of a few cm; accidental resize | Yes | Yes for gross fit; ±2–4 cm on a 2.2 m sofa |
| 1. Product in live AR (no LiDAR) | ~1–3% scale; floor plane may sit 1–3 cm off at first | Bare floor: drift or "swimming" | Yes | Rough only |
| 2. LiDAR room scan (RoomPlan/mesh) | 1–3 cm per wall (0.5–1%) | 5–40 cm (up to ~6%): mirrors, glass, long or open rooms, drift | Yes | Yes, except for gaps under ~5 cm |
| 3. No LiDAR (planes + taps / video) | 5–10 cm per wall (2–3%) | 20 cm+, or failure on white walls | Yes for a demo | Marginal without a reference measurement |
| 4. ML-only monocular | 10–20% scale error | Arbitrary scale | Plausible-looking only | No, unless rescaled with a known dimension |

**What a customer would notice:**
- A 2–3% error (4–7 cm on a 2.2 m sofa) is below the ~3–5% AR size-change threshold and unlikely to be noticed visually.
- Absolute-size judgement in AR is poor anyway, as the 79% table shows.

**What breaks a fit decision:**
- Fit decisions hinge on *clearances*: a sofa into an alcove, beside a door swing, or through a doorway. If the gap is 5–10 cm, a 5–10 cm room error flips the answer.
- So only case 2 (and case 3 with a tape-measured reference) supports "will it fit" when gaps are under about 10 cm.
- The app should label results "approximate", tell users to tape-measure critical gaps, and lock product scale at 100%.

### Gaps
- No published study measures phone-AR furniture-fit decision errors.
- The HAL threshold paper is unverified. I found no source for size perception specific to phone (handheld) AR furniture.
- I did not find a citable interior-design clearance standard for a "fit-breaking" threshold in this pass.
- 2025–2026 metric monocular models (e.g., Depth Pro, Depth Anything V2 metric) have no verified zero-shot error on real phone room captures.

---

## 6. In-app techniques that improve accuracy

### Takeaway
The biggest wins, roughly in order:
- keep scans short and scoped to a single room;
- coach the user on speed, distance, lighting and texture in real time;
- avoid or flag glass and mirrors;
- walk the room in a loop to give the tracker a chance to correct drift, and relocalize between sessions so rooms share one coordinate frame;
- snap walls to near-right angles;
- capture more than once or from fixed positions;
- let the user enter one tape-measured reference to rescale.

Most of these are documented or supported by RoomPlan, ARKit and ARCore. The rescaling step is my recommendation, not a platform feature.

### Cited Findings
- **RoomPlan best practices (WWDC22):**
  - Single room up to about 9×9 m; at least 50 lux.
  - "opening the curtains can let more natural light in and reduce window occlusions"; "Closing the doors can reduce the chance of scanning unnecessary area".
  - Avoid "single long scans over 5 minutes".
  - Use the user-instruction delegate to "provide feedback on textures, distance, speed, and lighting conditions."
  — [WWDC22 session 10127](https://developer.apple.com/videos/play/wwdc2022/10127/) [V]
- **How RoomPlan's prompts work:** they guide users to "capture … at the right speed, lighting, and distance". Distance and speed are computed from "3D linear velocity of camera-pose transitions and 2D projection velocity". — [Apple ML Research](https://machinelearning.apple.com/research/roomplan) [V]
- **RoomPlan from iOS 17 (WWDC23):**
  - Custom ARSession.
  - MultiRoom merging through a "continuous ARSession" or "ARSession relocalization" so separate scans share one coordinate space.
  - (Merging can distort individual rooms; see it-jim below.)
  — [WWDC23 session 10192](https://developer.apple.com/videos/play/wwdc2023/10192/) [V]
- **ARKit guidance:** move the device ("ARKit develops a better understanding of the scene if the device is moving") but not "too far, too fast"; use tracking-state reasons to tell users how to fix tracking; give planes time to settle. — [Apple: Understanding World Tracking](https://developer.apple.com/documentation/arkit/understanding-world-tracking) [V]
- **ARCore guidance:** "Experiences that encourage the user to move their device more will get better and better results"; best at 0.5–5 m. — [Google](https://developers.google.com/ar/develop/depth) [V]
- **Loop closure and drift:** HoloLens 2's loop closure reduced round-trip error, while iPhone apps without it drifted. — [Sensors 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10893111/) [V] "Algorithm behaviour, not raw point output, determines usability in long, feature-poor … spaces." — [Hamdan 2026](https://link.springer.com/article/10.1007/s41651-026-00288-x) [V]
- **Static or multiple overlapping captures beat a moving sweep:** 1–2 cm. — [HBRC 2024](https://doi.org/10.1080/16874048.2024.2408839) [V] Three averaged readings were used in the ESPE height study. — [ESPE](https://abstracts.eurospe.org/hrp/0098/hrp0098p1-310) [V]
- **Filter by confidence:** ARKit's confidenceMap "is useful in filtering out lower-accuracy depth values". — [Apple ARDepthData](https://developer.apple.com/documentation/arkit/ardepthdata) [V] ARCore Raw Depth provides per-pixel confidence. — [Google](https://developers.google.com/ar/develop/java/depth/raw-depth) [S]
- **Texture over depth API:** scene texture had a much larger effect on drift than turning the depth API on. — [Research Square 2026](https://www.researchsquare.com/article/rs-10991704) [V; preprint]
- **Orthogonal snapping is a trade-off:** RoomPlan already squares near-right angles, which tidies typical rooms but distorts genuinely non-square ones. — [it-jim](https://www.it-jim.com/blog/roomplan-framework-by-apple/) [V]
- **Reference objects:** a 2023 Sensors ARKit study proposes a known reference length (pupil distance, a payment card) to improve camera-based estimates. — [Sensors 2023, doi 10.3390/s23094486](https://doi.org/10.3390/s23094486) [S] In 2017 a developer considered printed markers on walls as feature anchors but found them impractical. — [Medium 2017](https://medium.com/inborn-experience/getting-a-room-plan-with-arkit-the-case-where-size-matters-1e104ee42421) [V]

### Inferences (recommended UX for YoungVista)
1. **Pre-scan checklist:** lights on, curtains open, close doors, phone at chest height. Warn about mirrors and glass and tell the user to scan them last or skip them.
2. **Live coaching:**
   - On RoomPlan, use its built-in prompts.
   - On ARCore, use a custom "slow down / step back to 1–3 m / point at something with detail" coach based on tracking state and depth coverage.
   - Block capture until tracking is "normal".
3. **Scan path:** walk the perimeter once at roughly 0.25–0.3 m/s (the speeds used in the Sensors 2024 tests), facing the walls from 1–3 m, and end where you started.
   - On iOS, give ARKit the chance to correct drift on the loop (Apple doesn't document loop closure).
   - On Android, use ARCore's tracking and anchors.
4. **Post-processing:**
   - Snap near-orthogonal walls (within about 3–5°) to 90°.
   - Snap floor and ceiling to horizontal planes.
   - Average repeated wall estimates.
5. **One-number calibration:** ask the user to tape-measure one wall (or the ceiling height) and rescale the whole model. For example, a scan of 4.10 m against a tape of 4.00 m gives a uniform ×0.9756 rescale. This fixes global scale error, the main problem on non-LiDAR and ML-only paths, but not local shape errors.
6. **Fit warnings:** when any clearance is under about 10 cm (non-LiDAR) or about 5 cm (LiDAR), show "too close to call — measure this gap with a tape".
7. **Product scale:** keep GLB products at true scale and make resizing a deliberate action with a visible "not true size" badge, given the Baymard finding.

### Gaps
- No controlled study quantifies the gain from user-entered reference rescaling or from orthogonal snapping in consumer room scans.
- ARKit's internal loop closure and relocalization behaviour, and their effect on drift, is not documented numerically.

---

## 7. Open-source code implementing Measure-like logic (with licenses)

### Takeaway
The best permissively licensed starting points are:
- **iOS:** Apple's own sample code, which is MIT-style and allows commercial use (including the RoomPlan capture sample), plus tbxark/Ruler (MIT).
- **Android:** Google's ARCore samples (Apache-2.0 for sample code) and ARCore Depth Lab (Apache-2.0).
- **Cross-platform:** SceneView (Apache-2.0).

Avoid GPL repos (duzexu/ARuler) and repos with no license (levantAJ/Measure, hl3hl3/ARCoreMeasure) for a commercial app. Licenses were checked on 2026-11-05 through the GitHub API or LICENSE files.

### Cited Findings
| Project | Platform / what it does | License (commercial use?) | Status | Source |
|---|---|---|---|---|
| Apple sample "Create a 3D model of an interior room by guiding the user through an AR experience" (RoomPlan) | iOS; RoomCaptureView scan → USDZ | LICENSE.txt is MIT-style ("Permission is hereby granted, free of charge … without restriction …"), © 2025 Apple. **Commercial OK** [V] | Current | [Apple docs](https://developer.apple.com/documentation/roomplan/create-a-3d-model-of-an-interior-room-by-guiding-the-user-through-an-ar-experience) |
| Apple samples "Visualizing and interacting with a reconstructed scene" (LiDAR mesh + raycast) and "Displaying a point cloud using scene depth" | iOS; scene mesh, raycasting, sceneDepth | Apple sample-code license; assumed MIT-style like the RoomPlan sample. Only the RoomPlan sample's LICENSE.txt was opened | Current | [Apple docs (mesh)](https://developer.apple.com/documentation/arkit/visualizing-and-interacting-with-a-reconstructed-scene); [Apple docs (point cloud)](https://developer.apple.com/documentation/arkit/displaying-a-point-cloud-using-scene-depth) |
| tbxark/Ruler | iOS ARKit; length and area AR ruler | **MIT**; commercial OK [V] | 258★, pushed 2026-09-14 | [GitHub](https://github.com/tbxark/Ruler) |
| DroidsOnRoids/MeasureARKit | iOS 11 ARKit measuring example | **MIT** [V] | Archived (2018) | [GitHub](https://github.com/DroidsOnRoids/MeasureARKit) |
| vhanagwal/ARRuler | iOS ARKit distance measuring | **BSD-3-Clause**; commercial OK [V] | 2020 | [GitHub](https://github.com/vhanagwal/ARRuler) |
| duzexu/ARuler | iOS ARKit distance measuring (most-starred) | **GPL-2.0**: copyleft; distributing a derivative requires releasing source under GPL, which is problematic for a closed App Store app [V for license; the App Store point is my inference] | 1,278★, pushed 2026-02-28 | [GitHub](https://github.com/duzexu/ARuler) |
| levantAJ/Measure; adithyabhat/Measure (clone of iOS 12 Measure) | iOS ARKit | **No license**, so all rights reserved; not reusable without permission [V] | 2019–2020 | [GitHub](https://github.com/levantAJ/Measure); [GitHub](https://github.com/adithyabhat/Measure) |
| google-ar/arcore-android-sdk | Android; official samples (e.g., hello_ar) | Samples **Apache-2.0**. SDK binaries and the AAR are under "ARCore Additional Terms of Service" (GitHub shows NOASSERTION). Commercial OK subject to Google's terms [V] | Pushed 2026-10-16 | [GitHub](https://github.com/google-ar/arcore-android-sdk); [ARCore terms](https://developers.google.com/ar/develop/terms) |
| googlesamples/arcore-depth-lab | Android/Unity; Depth API sample interactions | **Apache-2.0** [V] | Pushed 2026-05-14 | [GitHub](https://github.com/googlesamples/arcore-depth-lab) |
| Terran-Marine/ARCoreMeasuredDistance | Android; multi-point distance demo | **Apache-2.0** [V] | 2022 | [GitHub](https://github.com/Terran-Marine/ARCoreMeasuredDistance) |
| Kashif-E/ArCoreMeasurement | Android Kotlin + Sceneform | **Apache-2.0** [V] | 2022 | [GitHub](https://github.com/Kashif-E/ArCoreMeasurement) |
| shibuiwilliam/arcore-measurement | Android ARCore measuring | **MIT** [V] | 2020 | [GitHub](https://github.com/shibuiwilliam/arcore-measurement) |
| hl3hl3/ARCoreMeasure | Android | **No license** (all rights reserved) [V] | 2021 | [GitHub](https://github.com/hl3hl3/ARCoreMeasure) |
| sceneview/sceneview | 3D and AR SDK: Android (Compose + Filament), Apple (SwiftUI + RealityKit), Web, Flutter | **Apache-2.0** [V] | 1,358★, pushed 2026-11-05 | [GitHub](https://github.com/sceneview/sceneview) |
| immersive-web/webxr-samples | WebXR samples (incl. AR hit-test) | **MIT** [V] | Pushed 2026-10-26 | [GitHub](https://github.com/immersive-web/webxr-samples) |
| google-ar/arcore-ios-sdk | ARCore features on iOS (e.g., Cloud Anchors) | **Apache-2.0** [V] | Pushed 2026-10-27 | [GitHub](https://github.com/google-ar/arcore-ios-sdk) |
| Depth Anything V2 (monocular depth) | ML depth models | Code Apache-2.0. **Small model Apache-2.0 (commercial OK); Base, Large and Giant are CC-BY-NC-4.0 (non-commercial)** [V] | Pushed 2026-03-24 | [GitHub README](https://github.com/DepthAnything/Depth-Anything-V2) |
| Apple Depth Pro (apple/ml-depth-pro) | ML metric depth | Apple custom license: "personal, non-exclusive license … to use, reproduce, modify and redistribute"; weights under the same terms; "no other rights … including … patent rights". Commercial use is not explicitly barred but is legally ambiguous; needs legal review [V for text; the ambiguity is my reading] | 2024 | [GitHub LICENSE](https://github.com/apple/ml-depth-pro/blob/main/LICENSE) |

### Inferences
- The core Measure logic is small and well covered by MIT, BSD or Apache samples: raycast the reticle, anchor the hit, compute distance, draw a line and label. Native ARKit plus Apple's MIT-style samples give the most accurate path on iOS, through LiDAR depth and mesh raycasts.
- Most third-party ruler repos date from the ARKit 1–2 era (2017–2020). They use hit-testing on feature points and planes, while Apple has recommended raycasting over hit-testing since iOS 14 ([WWDC20 session 10611](https://developer.apple.com/videos/play/wwdc2020/10611/)). Treat them as references, not dependencies.
- **Notes for other researchers (out of scope, flagged briefly):**
  - SceneView (Apache-2.0) spans Android, Apple, Web and Flutter: relevant to the cross-platform/SDK researcher.
  - The WebXR samples (MIT) are relevant to browser viewing.
  - Baymard found 87% of furniture shoppers largely avoid AR features (May 2024): relevant to product/UX framing.
  - RoomPlan outputs USD/USDZ and parametric data, and Mac Catalyst apps can process results — [Apple RoomPlan docs](https://developer.apple.com/documentation/roomplan): relevant to the pipeline/web-viewer researcher.

### Gaps
- I did not open the LICENSE.txt in every Apple ARKit sample; I assume they match the RoomPlan sample's MIT-style text.
- I found no maintained, permissively licensed open-source app that reproduces Measure's LiDAR features (edge guides, person height).
- No open-source RoomPlan equivalent was evaluated here; that is covered by the open-source reconstruction researcher.
