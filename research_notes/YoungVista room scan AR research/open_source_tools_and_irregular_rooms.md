# Open-source building blocks for phone room scanning (geometry + layout), irregular rooms, doors/windows/glass, and licenses — state as of 2026-11-05

How this was checked (a note, not a finding): repo stars, SPDX license, latest GitHub Release and last default-branch commit came from the GitHub GraphQL API on 2026-11-05. Model-weight licenses came from the Hugging Face model API (`huggingface.co/api/models/<id>`) on the same day. RoomPlan facts came from crawling all 276 RoomPlan documentation pages through Apple's documentation JSON (`developer.apple.com/tutorials/data/documentation/roomplan.json`, which includes per-symbol "introduced in iOS x" data) and from the WWDC22 (10127) and WWDC23 (10192) transcripts. Where GitHub shows "NOASSERTION/Other", the LICENSE file itself was read; some of those are standard licenses with extra text, e.g. Open3D is MIT and COLMAP is BSD. "Verified" means read in a primary source during this session. Anything under **Inferences** is my reasoning. Star counts are snapshots from 2026-11-05.

---

## 1. Apple RoomPlan and difficult rooms (iOS 26 / iOS 27, WWDC 2024–2026 changes)

### Takeaway
RoomPlan only runs on iPhones and iPads with LiDAR. It already models curved walls (as arcs), slanted or non-uniform walls and polygon floors (both iOS 17), whether a door is open or closed, windows, doorless openings, multi-room merging (StructureBuilder, iOS 17), and 16 furniture categories with attributes. It has no ceiling surface. Apple tunes it for single residential rooms up to about 9 × 9 m, and multi-room capture up to about 186 m². Apple says it struggles with mirrors and glass, high ceilings, dark or textureless surfaces and low light. Apple's own documentation shows no new RoomPlan API after iOS 17 (2023): all 276 documented symbols are marked "introduced iOS 16.0" or "iOS 17.0". I found no RoomPlan WWDC session from 2024, 2025 or 2026, and no RoomPlan change for iOS 26 or 27.

### Cited Findings
**Platform and requirements**
- The RoomPlan sample code needs "a device running iOS 16 or later with a LiDAR Scanner" — [Apple sample: Create a 3D model of an interior room by guiding the user through an AR experience](https://developer.apple.com/documentation/roomplan/create-a-3d-model-of-an-interior-room-by-guiding-the-user-through-an-ar-experience)
- RoomCaptureSession "Utilizes an ARKit session … that enables the device's LiDAR Scanner to capture the environment's physical layout" and gives coaching instructions. Apps can pass in their own `ARSession` (iOS 17) — [RoomCaptureSession](https://developer.apple.com/documentation/roomplan/roomcapturesession)
- The capture errors are `deviceNotSupported`, `deviceTooHot` ("thermal metrics surpass the framework's limitations"), `exceedSceneSizeLimit` ("scene size grows past the framework's limitations"), `worldTrackingFailure`, `invalidARConfiguration` and `internalError` — [RoomCaptureSession.CaptureError](https://developer.apple.com/documentation/roomplan/roomcapturesession/captureerror)
- Apple's marketing page calls RoomPlan a Swift API that uses the camera and LiDAR Scanner on iPhone and iPad to make a 3D floor plan with dimensions and furniture types (from a search snippet) — [Apple RoomPlan page](https://developer.apple.com/augmented-reality/roomplan/)

**What the data model can represent (verified in the API docs)**
- Surface categories are `wall`, `door(isOpen:)`, `window` and `opening` (all iOS 16), plus `floor` (iOS 17). There is **no ceiling category**; the crawl found no ceiling type anywhere in RoomPlan — [CapturedRoom.Surface.Category](https://developer.apple.com/documentation/roomplan/capturedroom/surface/category-swift.enum), [door(isOpen:)](https://developer.apple.com/documentation/roomplan/capturedroom/surface/category-swift.enum/door(isopen:)), [opening](https://developer.apple.com/documentation/roomplan/capturedroom/surface/category-swift.enum/opening)
- **Curved walls:** a surface has an optional `curve` of type `CapturedRoom.Surface.Curve` with `startAngle`, `endAngle` and `radius` (iOS 16), plus `center` (iOS 17, "xz center coordinates"). The docs say it applies to any surface "that models a curved real-world surface" — [Surface.Curve](https://developer.apple.com/documentation/roomplan/capturedroom/surface/curve-swift.struct)
- At WWDC23 Apple said: "So far, curved walls and windows were part of data-only API. Now, final result from RoomCaptureView can also render curved walls." — [WWDC23 session 10192 "Explore enhancements to RoomPlan"](https://developer.apple.com/videos/play/wwdc2023/10192/)
- **Slanted / non-uniform walls and polygon floors:** `polygonCorners` (iOS 17) is "A 2D polygon that represents nonuniform wall heights and floor shapes" — [polygonCorners](https://developer.apple.com/documentation/roomplan/capturedroom/surface/polygoncorners). At WWDC23 Apple said: "RoomPlan now supports an even larger variety of rooms, which includes slanted walls and curved walls, but also recessed kitchen elements such as dishwashers, ovens, or sinks." It also said: "Walls can now be described as polygons, to handle non-uniform walls such as slanted walls or walls with a beam." And: "Floor is now represented as a rectangle during scanning and is beautified as a polygon when scanning ends." — [WWDC23 10192](https://developer.apple.com/videos/play/wwdc2023/10192/)
- **Hierarchy and floors of a building:** `parentIdentifier` (iOS 17) links a window or door to its wall: "the parent of a window is the wall surface on which the window rests" — [Surface.parentIdentifier](https://developer.apple.com/documentation/roomplan/capturedroom/surface/parentidentifier). Objects have parents too: "the parent of a sink is the storage area" — [Object.parentIdentifier](https://developer.apple.com/documentation/roomplan/capturedroom/object/parentidentifier). Rooms, surfaces and objects have a `story` (floor level, iOS 17) — [CapturedRoom.story](https://developer.apple.com/documentation/roomplan/capturedroom/story)
- **Room-type sections** (iOS 17) carry the labels bathroom, bedroom, diningRoom, kitchen, livingRoom or unidentified. Apple says: "In a larger room, the framework may identify multiple types of areas, for example, a kitchen and a dining room," and each section has its own center point — [CapturedRoom.Section](https://developer.apple.com/documentation/roomplan/capturedroom/section)
- **Object categories** (16, all iOS 16): bathtub, bed, chair, dishwasher, fireplace, oven, refrigerator, sink, sofa, stairs, storage, stove, table, television, toilet, washerDryer — [CapturedRoom.Object.Category](https://developer.apple.com/documentation/roomplan/capturedroom/object/category-swift.enum)
- **Object attributes** (iOS 17) are ChairType (dining, stool, swivel), ChairArmType, ChairBackType, ChairLegType, SofaType (lShaped, lShapedExtension, rectangular, singleSeat), TableType (coffee, dining), TableShapeType and StorageType — [ChairType](https://developer.apple.com/documentation/roomplan/chairtype), [SofaType](https://developer.apple.com/documentation/roomplan/sofatype), [TableType](https://developer.apple.com/documentation/roomplan/tabletype)
- **Export** is to USD/USDZ in one of three modes:
  - `parametric`: "stores elements as unit-sized cubes," scaled into planes or boxes.
  - `mesh`.
  - `model`: works with `ModelProvider` to replace detected objects with "3D models that you choose in advance" by category and attributes.
  - [CapturedRoom.USDExportOptions](https://developer.apple.com/documentation/roomplan/capturedroom/usdexportoptions)
- The `beautifyObjects` option "realigns the chairs neatly around the table" — [beautifyObjects](https://developer.apple.com/documentation/roomplan/roombuilder/configurationoptions/beautifyobjects)
- A scanned room can be saved as JSON and processed later; the RoomPlanExporter sample says "Export a scanned room in JSON format" — [Providing custom models for captured rooms and structure exports](https://developer.apple.com/documentation/roomplan/providing-custom-models-for-captured-rooms-and-structure-exports)
- A small behaviour fix: "Before iOS 17.4, the first letter of the USD file name needs to be a character other than a number" — [export(to:exportOptions:)](https://developer.apple.com/documentation/roomplan/capturedroom/export(to:exportoptions:))

**Multi-room (StructureBuilder, iOS 17)**
- StructureBuilder "succeeds when all of the captured rooms share compatible world space; otherwise, the function fails with an error." There are two ways to get a shared world space:
  - Pass the same `ARSession` to each RoomCaptureSession, stopping each capture with `stop(pauseARSession: false)`.
  - Load a saved `ARWorldMap` and wait until tracking changes "from relocalizing to normal." For that, "the system needs to observe through the camera some portion of the recently scanned area."
  - [StructureBuilder.capturedStructure(from:)](https://developer.apple.com/documentation/roomplan/structurebuilder/capturedstructure(from:))
- The merge errors include `invalidRoomLocation` ("one or more rooms reside in a different vicinity"), `insufficientInput` and `exceedSceneSizeLimit` — [StructureBuilder.BuildError](https://developer.apple.com/documentation/roomplan/structurebuilder/builderror)
- At WWDC23 Apple said that stitching rooms manually leaves "duplicate walls and potentially duplicate objects". It also said: "MultiRoom works best for single-floor residential houses, with a typical setup of one to four bedrooms, living room, kitchen, and dining room." And: "we recommend a maximal total area of 2,000 square feet or around 186 square meters." — [WWDC23 10192](https://developer.apple.com/videos/play/wwdc2023/10192/)

**Known limitations, quoted from Apple's WWDC22 best practices** — all from [WWDC22 session 10127 "Create parametric 3D room scans with RoomPlan"](https://developer.apple.com/videos/play/wwdc2022/10127/)
- Size: "It works best for a single residential room with a maximum room size of 30 feet by 30 feet or around 9 by 9 meters."
- Light: "A minimum 50 lux or higher is recommended for using the API, which is typical for a family living room at night."
- Mirrors and glass: "full-height mirrors and glass pose a challenge for the LiDAR sensor to produce the expected output."
- Ceilings: "Even high ceilings could exceed the limit of the scanning range of the LiDAR sensor."
- Dark surfaces: "very dark surfaces could be hard for the device to scan."
- Preparing the room: "opening the curtains can let more natural light in and reduce window occlusions"; "Closing the doors can reduce the chance of scanning unnecessary area outside of the room."
- The in-scan coaching instructions are:
  - `lowTexture`, given when "The user points the device at a wall with a solid color" or there are no wall edges in view.
  - `turnOnLight`, `slowDown`, `moveCloseToWall` and `moveAwayFromWall`.
  - [RoomCaptureSession.Instruction](https://developer.apple.com/documentation/roomplan/roomcapturesession/instruction), [lowTexture](https://developer.apple.com/documentation/roomplan/roomcapturesession/instruction/lowtexture)
- Before saving, RoomCaptureView "displays a small-scale version of the scanned room for the user to approve" — [RoomCaptureView](https://developer.apple.com/documentation/roomplan/roomcaptureview)

**Version history: iOS 18 / 26 / 27 and WWDC 2024–2026**
- The documentation crawl on 2026-11-05 covered 276 RoomPlan pages. Every symbol's iOS availability is 16.0 (152 symbols) or 17.0 (122 symbols). So there are no public RoomPlan API additions in iOS 17.x, 18, 26 or 27 as of today — [RoomPlan documentation](https://developer.apple.com/documentation/roomplan) (crawled via its JSON)
- On Apple's Developer Forums in June 2025, a developer asked "Has Roomplan been abandoned?" and said "Since 2023 was the last update and for iOS 17." Apple's DTS engineer only pointed them to the WWDC25 "Object Capture and RoomPlan lab," so RoomPlan still had lab support at WWDC25 — [Forum thread 787628](https://developer.apple.com/forums/thread/787628)
- A second June 2025 thread asked whether anyone had found RoomPlan changes in iOS 26. The poster reported none (search snippet; I did not open the thread) — [Forum thread 788885](https://developer.apple.com/forums/thread/788885)
- Web searches for RoomPlan at WWDC24, WWDC25 or WWDC26, or RoomPlan plus iOS 27, found no RoomPlan session or feature announcement. The newest RoomPlan session is still WWDC23 10192 — [WWDC23 10192](https://developer.apple.com/videos/play/wwdc2023/10192/)

**A lower-level Apple alternative**
- ARKit's LiDAR scene-reconstruction mesh (iOS 13.4+) labels mesh faces as wall, floor, **ceiling**, door, window, seat, table or none. This is a path to real ceiling geometry that RoomPlan doesn't provide — [ARMeshClassification](https://developer.apple.com/documentation/arkit/armeshclassification)

### Inferences
- **Non-90° corners:** nothing in the API forces walls to be perpendicular. Each wall is its own surface with its own position, orientation and size, and floors can be polygons, so any angle can be represented. Apple publishes no accuracy figures for angled rooms.
- **Circular or many-angled rooms:** a round room should come out as one or more curved wall surfaces described by arcs. Apple states no limits (how many arcs, minimum radius). Test real round and bay-window rooms before relying on this.
- **Sloped or vaulted ceilings:** the ceiling itself is never modelled. A slope shows up only indirectly, as polygon walls of different heights (gable or knee walls). A viewer must either build a ceiling or leave it off. If a sloped ceiling matters for the image, add ARKit's classified mesh, which has a ceiling class.
- **Open doors:** RoomPlan records that a door is open (`isOpen`), but not the door leaf or its swing area. Apple's own advice to close doors shows that an open door lets the scan leak into the next room.
- **Strategy risk:** RoomPlan's API hasn't changed for about three years. That means it is stable (no churn), but there is no sign of new features, and it is iOS + LiDAR only. A large share of iPhones and all Android phones need a different path (Sections 2–4).
- **Web path:** a CapturedRoom can be saved as JSON (it is serialisable). So YoungVista could build its own glTF room shell (extruded wall polygons, arcs turned into short segments, floor polygon) on a server, rather than relying on converting USDZ to GLB.

### Gaps
- Apple publishes no tolerance figures for curved, angled or polygon walls, no limit on how many curved walls a room can have, and nothing on fully circular rooms.
- I could not tell whether Apple quietly improved RoomPlan's on-device models in iOS 18, 26 or 27. I found no RoomPlan release notes, and documentation availability only shows API changes.
- I did not read the full WWDC26 session list directly; the conclusion that there were no RoomPlan sessions rests on searches.
- How glass walls, sliding glass doors or double doors are classified is undocumented.

---

## 2. Real-time SLAM / reconstruction usable on phones — which can produce a room mesh on Android today?

### Takeaway
For Android, the only open-source, ready-to-use phone app that builds a room mesh today is RTAB-Map, through its "RTAB-Map ARCore" app (BSD licence). Even so, the Google Play listing could not be reached on 2026-11-05, and Android APKs were last attached to a GitHub release in Feb 2024. ARCore itself only gives per-frame depth images (depth-from-motion, improved by a time-of-flight depth sensor where the phone has one) and does no meshing. ORB-SLAM3 and OpenVINS only track the phone's position and build no dense mesh; both are GPL-3.0. InfiniTAM, Kimera and ElasticFusion are depth-camera, ROS or desktop research systems, and several are non-commercial. Open3D is a server/desktop library. The practical Android route is therefore RTAB-Map, or capturing ARCore depth, poses and RGB and fusing them on a server.

### Cited Findings
**RTAB-Map**
- The LICENSE is BSD-style ("Redistribution and use in source and binary forms, with or without modification, are permitted provided…"), © 2010–2025 Mathieu Labbé / IntRoLab, Université de Sherbrooke — [rtabmap LICENSE](https://github.com/introlab/rtabmap/blob/HEAD/LICENSE)
- About 4,079 stars; release 0.24.2 on 2026-10-25; last commit 2026-11-04; the README shows Android and iOS CI badges. It is actively maintained — [introlab/rtabmap](https://github.com/introlab/rtabmap)
- Android: the installation wiki has a "RTAB-Map ARCore (APK)" section that builds from the Docker image `introlab3it/rtabmap:android26`. It says to first "uninstall the version of RTAB-Map ARCore from the phone (installed by Play Store)" with `adb uninstall com.introlab.rtabmap`. The wiki also lists Tango builds — [RTAB-Map Installation wiki](https://github.com/introlab/rtabmap/wiki/Installation)
- Android APKs (android24, android26, android30, tango) were last attached to GitHub release 0.21.4 (2024-02-19). Releases 0.22.x–0.24.x attach only desktop installers and iOS libraries — [rtabmap releases](https://github.com/introlab/rtabmap/releases)
- The Google Play page for `com.introlab.rtabmap` returned HTTP 404 when fetched on 2026-11-05 — [Play Store URL](https://play.google.com/store/apps/details?id=com.introlab.rtabmap&hl=en_US)
- iOS app "RTAB-Map – 3D LiDAR Scanner" (App Store listing):
  - free; "Requires iOS 15.6 or later"; "3D reconstruction available only with LiDAR sensor";
  - "Online 3D scanning/mapping of the environment"; "Raw ARKit data recording (up to 60 Hz!)";
  - "Export in PLY, LAS or OBJ", plus LAZ for point clouds; version 0.24.2 dated "Oct 26".
  - [App Store](https://apps.apple.com/us/app/rtab-map-3d-lidar-scanner/id1564774365)
- Older Android (Tango-era) API references show mesh-export functions with options for texture size and count and for mesh optimisation (older documentation, seen in a search snippet) — [docs.ros.org RTABMapLib (Kinetic)](https://docs.ros.org/en/kinetic/api/rtabmap/html/classcom_1_1introlab_1_1rtabmap_1_1RTABMapLib.html)

**ARCore (Google)**
- Depth API: "Each pixel in a depth image is associated with a measurement of how far the scene is from the camera." It "uses a depth-from-motion algorithm." If a dedicated sensor such as time-of-flight is present, "the algorithm automatically merges data from all available sources."
- ARCore depth range and limits:
  - Range: "robust, accurate depth estimates from 0 to 65 meters away"; "The most accurate results come when the device is half a meter to about five meters away."
  - Motion needed: "Valid depth data are only available after the user has started moving their device around."
  - Plain walls: "Surfaces with few or no features, such as white walls, will be associated with imprecise depth."
  - Devices: it is "only supported on devices with the processing power to support depth."
  - The page describes no mesh output.
  - [ARCore Depth API overview](https://developers.google.com/ar/develop/depth)
- The Unity ARCore XR Plug-in 6.1 manual lists **Meshing** ("Generate meshes of the environment") among the AR features "not supported by ARCore 1.45" — [Unity Google ARCore XR Plug-in manual](https://docs.unity3d.com/Packages/com.unity.xr.arcore@6.1/manual/index.html)
- AR Foundation's mesh manager only works on "supported platforms" — [AR Foundation AR Mesh Manager](https://docs.unity3d.com/Packages/com.unity.xr.arfoundation@6.1/manual/features/meshing.html)
- ARCore SDK 1.57.0 was released 2026-10-16. Its binaries are governed by the "ARCore Additional Terms of Service" (see the LICENSE file) — [google-ar/arcore-android-sdk](https://github.com/google-ar/arcore-android-sdk)
- ARCore Depth Lab is Unity sample code under Apache-2.0. The Depth API "is enabled on a subset of ARCore-certified Android devices. iOS devices (iPhone, iPad) are not supported." Last release 2.0.0 (2021-05-22); last commit 2026-05-14 — [googlesamples/arcore-depth-lab](https://github.com/googlesamples/arcore-depth-lab)
- AR Foundation samples are under the Unity Companion License, not an OSI licence — [arfoundation-samples LICENSE.md](https://github.com/Unity-Technologies/arfoundation-samples/blob/HEAD/LICENSE.md)

**Other SLAM / fusion systems**
- **ORB-SLAM3** — "Visual, Visual-Inertial and Multi-Map SLAM with monocular, stereo and RGB-D cameras." It builds a sparse feature map, not a mesh. GPL-3.0; last commit 2022-02-10, so effectively unmaintained — [UZ-SLAMLab/ORB_SLAM3](https://github.com/UZ-SLAMLab/ORB_SLAM3)
- **OpenVINS** — a "filter-based visual-inertial estimator" with ROS1, ROS2 and ROS-free builds. It does pose tracking only. GPL-3.0; v2.7 (2023-06-20); last commit 2025-11-30 — [rpng/open_vins](https://github.com/rpng/open_vins)
- **InfiniTAM v3** — volumetric fusion of depth images. Its Oxford licence is "solely for non-commercial use," and its README lists CUDA and OpenNI depth-camera dependencies. Last commit 2018-09-10, so unmaintained — [victorprad/InfiniTAM](https://github.com/victorprad/InfiniTAM)
- **Kimera** — "real-time metric-semantic simultaneous localization and mapping … to build a semantically annotated 3D mesh … ROS-enabled, and runs on a CPU." BSD-2. The umbrella repo's last commit was 2021-01-30; Kimera-VIO's was 2025-02-10 — [MIT-SPARK/Kimera](https://github.com/MIT-SPARK/Kimera)
- **Open3D** — MIT; v0.20.0 (2026-09-16); includes "Scene reconstruction". "Pre-built pip packages support Ubuntu 20.04+, macOS 10.15+ and Windows 10+"; no mobile builds are listed — [isl-org/Open3D](https://github.com/isl-org/Open3D), [Open3D LICENSE](https://github.com/isl-org/Open3D/blob/HEAD/LICENSE)
- **MASt3R-SLAM** — a "real-time monocular dense SLAM system … operating at 15 FPS" on a desktop GPU — [arXiv 2412.12392](https://arxiv.org/abs/2412.12392). Licensed CC BY-NC-SA 4.0, and its checkpoints are also bound by MASt3R's dataset terms — [rmurai0610/MASt3R-SLAM](https://github.com/rmurai0610/MASt3R-SLAM)
- **Other Gaussian-splat SLAM systems**
  - **VGGT-SLAM:** code BSD-2; last commit 2026-06-29; it relies on VGGT weights, whose licensing is in Section 3 — [MIT-SPARK/VGGT-SLAM](https://github.com/MIT-SPARK/VGGT-SLAM)
  - **SplaTAM** (RGB-D Gaussian SLAM): BSD-3; last commit 2024-06-19 — [spla-tam/SplaTAM](https://github.com/spla-tam/SplaTAM)
  - **MonoGS:** Imperial College licence, "solely for non-commercial, internal or academic research purposes" — [MonoGS LICENSE.md](https://github.com/muskie82/MonoGS/blob/HEAD/LICENSE.md)
  - **ElasticFusion:** an Imperial College software licence agreement of the same kind — [ElasticFusion LICENSE.txt](https://github.com/mp3guy/ElasticFusion/blob/HEAD/LICENSE.txt)
- **Open-source capture apps that feed offline pipelines**
  - **Stray Scanner:** MIT; records "raw RGB-D video datasets recorded using LiDAR enabled iOS devices"; v1.4 (2026-04-04) — [strayrobots/scanner](https://github.com/strayrobots/scanner)
  - **NeRFCapture:** MIT; iOS; last commit 2023-12 — [jc211/NeRFCapture](https://github.com/jc211/NeRFCapture)

### Inferences
- **Android today, ranked by practicality:**
  1. RTAB-Map ARCore (BSD, real mesh output), but its distribution status is unclear and quality on phones without a depth sensor (depth-from-motion only) is unverified.
  2. Do it yourself: record ARCore depth, camera poses and RGB on the phone, then fuse on a server (Open3D, MIT) or reconstruct from the video (Section 3).
  3. Upload video only and use server-side feed-forward reconstruction (Section 3).
- ARCore's warning about white walls matters a lot for rooms, whose walls are often white and featureless. Fitting walls and floor as planes or polygons (Section 4) is likely to be more reliable than showing ARCore's raw fused mesh as the room.
- GPL-3.0 engines (ORB-SLAM3, OpenVINS) bring copyleft duties if linked into a distributed app binary. InfiniTAM, MonoGS, ElasticFusion and MASt3R-SLAM are non-commercial or research-only, so they can't go in a B2C product without a separate licence.
- On iPhones without LiDAR, the same Android-style routes apply. On LiDAR iPhones, RoomPlan gives the room layout, and the ARKit mesh (ARMeshAnchor with classification) or the RTAB-Map iOS code (BSD) give a textured mesh.

### Gaps
- I could not confirm that RTAB-Map ARCore is currently on Google Play (the page returned 404), nor which export formats current Android builds offer.
- I found no published accuracy figures for RTAB-Map ARCore rooms on non-ToF Android phones.
- I did not look at newer Google platforms (Android XR, ARCore scene-semantics APIs) for phone meshing.
- Commercial meshing SDKs (e.g. Niantic Lightship), Matterport and Polycam are another researcher's scope and were not verified here.

---

## 3. Offline / cloud reconstruction from photos or video — which give metric scale, which allow commercial use?

### Takeaway
A commercially usable server stack exists: COLMAP (BSD-3, now including the former GLOMAP global mapper), gsplat (Apache-2.0), nerfstudio (Apache-2.0, but releases have slowed), OpenMVS (AGPL-3.0, with obligations) and Meshroom/AliceVision (MPL-2.0). The original Inria 3D Gaussian Splatting code and most of its surface-extraction descendants (2DGS, GOF, SuGaR, PGSR) are **non-commercial**. Among the newer "feed-forward" models (one network pass from images to geometry), the commercially usable and metric options are:
- MapAnything's `map-anything-apache` weights (multi-view, metric);
- Depth Anything 3's `DA3METRIC-LARGE` (single-image metric depth; Apache-2.0);
- MoGe-2 (single-image metric point map; MIT);
- VGGT, but only with the gated `VGGT-1B-Commercial` checkpoint, and VGGT is not natively metric.

DUSt3R/MASt3R, UniDepth, π³/Pi3X weights, the Depth Anything V2 Base/Large models and the Depth Anything 3 Large/Giant/Nested models are non-commercial. Depth Pro's weight licence is contradictory between its two official sources.

### Cited Findings
**Classical structure-from-motion, multi-view stereo, meshing and texturing**
- **COLMAP** — "licensed under the new BSD license," noting that "Building COLMAP with these dependencies may affect the resulting COLMAP license." Release 4.2.1 (2026-09-29); last commit 2026-11-04; about 13,158 stars — [COLMAP LICENSE](https://github.com/colmap/colmap/blob/HEAD/LICENSE), [colmap/colmap](https://github.com/colmap/colmap)
- **GLOMAP** — "[DEPRECATED] This project is no longer maintained and has been fully migrated to COLMAP, where GLOMAP functionality is exposed as the 'global' mapper." The repo is archived; last release 1.2.0 (2025-10-31) — [colmap/glomap](https://github.com/colmap/glomap)
- **OpenMVS** — dense multi-view stereo, meshing and texturing. AGPL-3.0; v2.4.0 (2026-01-20); last commit 2026-11-03 — [cdcseacave/openMVS](https://github.com/cdcseacave/openMVS)
- **Meshroom** — MPL-2.0, built on AliceVision (also MPL-2.0) — [Meshroom COPYING.md](https://github.com/alicevision/Meshroom/blob/HEAD/COPYING.md). Meshroom v2025.1.0 and AliceVision v3.3.0 were both released 2025-08-19, and commits continue into Nov 2026 — [alicevision/Meshroom](https://github.com/alicevision/Meshroom)
- **OpenMVG** — MPL-2.0; v2.1 (2023-12-28) — [openMVG/openMVG](https://github.com/openMVG/openMVG)
- **mvs-texturing** — "All source files are distributed under the BSD 3-Clause License unless otherwise noted in the source file" — [nmoehrle/mvs-texturing](https://github.com/nmoehrle/mvs-texturing)

**Radiance-field and Gaussian-splat training frameworks**
- **nerfstudio**
  - Apache-2.0; last release v1.1.5 (2024-11-11); last commit 2025-07-29, so activity has slowed — [nerfstudio-project/nerfstudio](https://github.com/nerfstudio-project/nerfstudio)
  - Imports phone data with `ns-process-data {video,images,polycam,record3d}`. Supported sources are Polycam (iOS with LiDAR), Record3D (iOS with LiDAR), KIRI Engine (iOS or Android), Spectacular AI, Metashape, RealityCapture and ODM — [nerfstudio custom data docs](https://github.com/nerfstudio-project/nerfstudio/blob/HEAD/docs/quickstart/custom_dataset.md)
- **Original 3D Gaussian Splatting (Inria/MPII)**
  - "The *Software* may be used 'non-commercially', i.e., for research and/or evaluation purposes only."
  - "THE USER CANNOT USE, EXPLOIT OR DISTRIBUTE THE *SOFTWARE* FOR COMMERCIAL PURPOSES WITHOUT PRIOR AND EXPLICIT CONSENT OF LICENSORS."
  - About 24,420 stars; last commit 2024-10-30.
  - [gaussian-splatting LICENSE.md](https://github.com/graphdeco-inria/gaussian-splatting/blob/HEAD/LICENSE.md)
  - The method renders in real time (≥ 30 fps at 1080p) — [arXiv 2308.04079](https://arxiv.org/abs/2308.04079)
- **gsplat** — "an open-source library for CUDA accelerated rasterization of gaussians with python bindings." Apache-2.0; v1.5.3 (2025-07-04); last commit 2026-09-19. Its news section shows active work through 2026, including faster 3DGS/3DGUT kernels, MCMC strategies (Jun–Jul 2026) and LiDAR rasterization (Mar 2026) — [nerfstudio-project/gsplat](https://github.com/nerfstudio-project/gsplat); paper [arXiv 2409.06765](https://arxiv.org/abs/2409.06765)

**Gaussian-splat surface and mesh extraction**
- **2DGS** — "collapse the 3D volume into a set of 2D oriented planar Gaussian disks" so that "2D Gaussians provide view-consistent geometry" — [arXiv 2403.17888](https://arxiv.org/abs/2403.17888)
  - It extracts meshes by bounded or unbounded TSDF fusion built on Open3D — [hbb1/2d-gaussian-splatting](https://github.com/hbb1/2d-gaussian-splatting)
  - Its LICENSE is the Inria "Gaussian-Splatting License" (non-commercial) — [2DGS LICENSE.md](https://github.com/hbb1/2d-gaussian-splatting/blob/HEAD/LICENSE.md)
- **Gaussian Opacity Fields (GOF) and SuGaR** also use the Inria Gaussian-Splatting License — [GOF LICENSE.md](https://github.com/autonomousvision/gaussian-opacity-fields/blob/HEAD/LICENSE.md), [SuGaR LICENSE.md](https://github.com/Anttwo/SuGaR/blob/HEAD/LICENSE.md)
- **PGSR** (planar-based Gaussian splatting, aimed at "high-fidelity surface reconstruction") — [arXiv 2406.06521](https://arxiv.org/abs/2406.06521). Its licence allows use "for educational, research and non-profit purposes only. Any modification … must be open-source and prohibited for commercial use"; last commit 2024-12-25 — [PGSR LICENSE.md](https://github.com/zju3dv/PGSR/blob/HEAD/LICENSE.md)
- **instant-ngp** (NVIDIA NeRF) — "The Work and any derivative works thereof only may be used or intended for use non-commercially", where non-commercially means "research or evaluation purposes only" — [instant-ngp LICENSE.txt](https://github.com/NVlabs/instant-ngp/blob/HEAD/LICENSE.txt)

**Feed-forward models: multi-view geometry**
- **DUSt3R and MASt3R**
  - Both are CC BY-NC-SA 4.0 — [DUSt3R LICENSE](https://github.com/naver/dust3r/blob/HEAD/LICENSE), [MASt3R LICENSE](https://github.com/naver/mast3r/blob/HEAD/LICENSE)
  - MASt3R's main checkpoint is named `MASt3R_ViTLarge_BaseDecoder_512_catmlpdpt_metric`, i.e. a metric-trained model. The README says: "Make sure to agree to the license of all the training datasets we used, in addition to CC-BY-NC-SA 4.0. The mapfree dataset license in particular is very restrictive." — [naver/mast3r](https://github.com/naver/mast3r)
  - The checkpoint notice includes dataset terms such as "you may not use the dataset or any derivative work for commercial purposes" — [MASt3R CHECKPOINTS_NOTICE](https://github.com/naver/mast3r/blob/HEAD/CHECKPOINTS_NOTICE)
- **CUT3R** — CC BY-NC-SA 4.0 — [CUT3R/CUT3R](https://github.com/CUT3R/CUT3R)
- **Fast3R** — "FAIR Noncommercial Research License"; the repo is archived — [facebookresearch/fast3r](https://github.com/facebookresearch/fast3r)
- **VGGT**
  - README: "[July 29, 2025] We've updated the license for VGGT to permit **commercial use** (excluding military applications)… only the newly released checkpoint VGGT-1B-Commercial" allows commercial use, at about the same accuracy as the original — [facebookresearch/vggt](https://github.com/facebookresearch/vggt)
  - The code licence ("VGGT License v1") grants a "non-exclusive, worldwide, non-transferable and royalty-free limited license," subject to an Acceptable Use Policy that bars military, warfare and similar uses — [VGGT LICENSE.txt](https://github.com/facebookresearch/vggt/blob/HEAD/LICENSE.txt)
  - The `facebook/VGGT-1B` weights are CC-BY-NC-4.0 — [HF VGGT-1B](https://huggingface.co/facebook/VGGT-1B)
  - `facebook/VGGT-1B-Commercial` is licensed "vggt-aup-license" and gated with manual approval — [HF VGGT-1B-Commercial](https://huggingface.co/facebook/VGGT-1B-Commercial)
  - About 14,599 stars; last commit 2026-05-19.
- **MapAnything (Meta)**
  - "directly regresses the metric 3D scene geometry and cameras" from one or more images "along with optional geometric inputs such as camera intrinsics, poses, depth," using "a metric scale factor" — [arXiv 2509.13414](https://arxiv.org/abs/2509.13414)
  - Code is Apache-2.0. Weights come in two flavours: `facebook/map-anything` (CC-BY-NC 4.0) and `facebook/map-anything-apache` (Apache 2.0). Inputs can be flagged `is_metric_scale` — [facebookresearch/map-anything](https://github.com/facebookresearch/map-anything), [HF map-anything-apache](https://huggingface.co/facebook/map-anything-apache)
  - v1.1.3 was released 2026-07-17. The repo also runs other models through one interface (VGGT, MoGe, Pi3/Pi3X, DUSt3R, MASt3R, Depth Anything 3 …), per its "Notes on Input Requirements."
- **π³ (Pi3) / Pi3X**
  - π³ predicts "affine-invariant camera poses and scale-invariant local point maps", i.e. not metric — [arXiv 2507.13347](https://arxiv.org/abs/2507.13347)
  - Pi3X (released Dec 28, 2025) adds optional camera pose, intrinsics and depth inputs, and "metric scale reconstruction (approximate)."
  - The README states a dual licence: code BSD 3-Clause (commercial use permitted); "Model Weights (Pi3 and Pi3X Weights) — CC BY-NC 4.0 — Strictly Non-Commercial" — [yyfz/Pi3](https://github.com/yyfz/Pi3)
  - **Conflict:** the Hugging Face card for `yyfz233/Pi3` is tagged `bsd-2-clause` — [HF Pi3](https://huggingface.co/yyfz233/Pi3); the `yyfz233/Pi3X` card is tagged cc-by-nc-4.0 — [HF Pi3X](https://huggingface.co/yyfz233/Pi3X)
- **Depth Anything 3 (ByteDance, Nov 2025)**
  - Code is Apache-2.0.
  - Apache-2.0 weights: DA3-SMALL, DA3-BASE, **DA3METRIC-LARGE** (monocular metric depth) and DA3MONO-LARGE.
  - CC BY-NC 4.0 weights: DA3-LARGE, DA3-GIANT and DA3NESTED-GIANT-LARGE (with 1.1 versions).
  - For metric depth: "`metric_depth = focal * net_output / 300.`, where `focal` is the focal length in pixels."
  - The Nested series "uses an Any-view model to estimate pose and depth, and a monocular metric depth estimator for scaling."
  - [ByteDance-Seed/Depth-Anything-3](https://github.com/ByteDance-Seed/Depth-Anything-3), [HF DA3METRIC-LARGE](https://huggingface.co/depth-anything/DA3METRIC-LARGE)
  - It claims a 44.3% gain in camera-pose accuracy and 25.1% in geometry over VGGT on its own benchmark — [arXiv 2511.10647](https://arxiv.org/abs/2511.10647)

**Feed-forward models: single-image depth**
- **Depth Anything V2**
  - "Depth-Anything-V2-Small model is under the Apache-2.0 license. Depth-Anything-V2-Base/Large/Giant models are under the CC-BY-NC-4.0 license." Metric fine-tunes exist.
  - "Prompt Depth Anything" (Dec 2024) "supports 4K resolution metric depth estimation when low-res LiDAR is used to prompt the DA models."
  - [DepthAnything/Depth-Anything-V2](https://github.com/DepthAnything/Depth-Anything-V2)
  - The metric-indoor cards on Hugging Face carry no licence tag — [HF Depth-Anything-V2-Metric-Indoor-Large-hf](https://huggingface.co/depth-anything/Depth-Anything-V2-Metric-Indoor-Large-hf)
- **Apple Depth Pro**
  - "The predictions are metric, with absolute scale, without relying on the availability of metadata such as camera intrinsics … producing a 2.25-megapixel depth map in 0.3 seconds on a standard GPU" — [arXiv 2410.02073](https://arxiv.org/abs/2410.02073)
  - **Licence conflict:**
    - The Hugging Face weights are tagged `apple-amlr` (Apple Machine Learning Research Model licence, use "exclusively for Research Purposes") — [HF apple/DepthPro LICENSE](https://huggingface.co/apple/DepthPro/blob/main/LICENSE).
    - The GitHub README says "The model weights are released under the LICENSE terms." That repo licence is Apple's sample-code-style licence, with no non-commercial clause found — [apple-aiml-research/ml-depth-pro](https://github.com/apple-aiml-research/ml-depth-pro).
  - The repo has moved to the `apple-aiml-research` organisation.
- **Metric3D v2**
  - "zero-shot **metric depth** and **surface normal** estimation from a single image"; code BSD-2; last commit 2025-03-13 — [YvanYin/Metric3D](https://github.com/YvanYin/Metric3D)
  - The Hugging Face weights carry no licence tag — [HF JUGGHM/Metric3D](https://huggingface.co/JUGGHM/Metric3D)
- **UniDepth V2** — predicts metric depth and camera intrinsics "directly from RGB image only"; licence CC BY-NC 4.0 — [lpiccinelli-eth/UniDepth](https://github.com/lpiccinelli-eth/UniDepth)
- **MoGe-2 (Microsoft)**
  - "recovers a metric scale 3D point map of a scene from a single image" (MoGe-1 was affine-invariant) — [arXiv 2507.02546](https://arxiv.org/abs/2507.02546)
  - Code is MIT, except the DINOv2 module, which is Apache-2.0. The README also announces MoGe-3; last commit 2026-08-19 — [microsoft/MoGe](https://github.com/microsoft/MoGe)
  - MoGe-2 weights are MIT on Hugging Face — [HF Ruicheng/moge-2-vitl-normal](https://huggingface.co/Ruicheng/moge-2-vitl-normal)

### Inferences
- **Which pipelines are metric:**
  - Not metric (scale unknown): classic structure-from-motion (COLMAP), splats trained on COLMAP poses, DUSt3R, VGGT and the original π³. For VGGT and DUSt3R this is my reading of the papers; their READMEs make no metric claim.
  - Metric: MapAnything, MASt3R (metric checkpoint), Pi3X (approximate), DA3 Nested and DA3Metric, Depth Pro, Metric3D v2, UniDepth and MoGe-2.
  - **Cheapest reliable source of metric scale for YoungVista:** the phone's own visual-inertial tracking. ARKit and ARCore camera poses are in metres because they use the IMU. Record those poses, optionally with LiDAR or ARCore depth, and either use them directly or pass them to MapAnything as metric inputs. As a fallback, ask the user to confirm one known length, e.g. door height or a wall width.
- **Commercial-safe server stack:**
  - Reconstruction: COLMAP (global or incremental mapper), then gsplat/nerfstudio for splats.
  - Meshing: Open3D TSDF or OpenMVS.
  - Feed-forward: `map-anything-apache`, DA3 Apache variants or MoGe-2; `VGGT-1B-Commercial` after approval.
- **Licences to avoid without a negotiated licence:**
  - Non-commercial: Inria-derived meshers (2DGS, GOF, SuGaR), PGSR, instant-ngp, DUSt3R/MASt3R/CUT3R/Fast3R, UniDepth, Pi3/Pi3X weights, DA2 Base/Large, DA3 Large/Giant/Nested and SpatialLM (Section 4).
  - Unresolved: Depth Pro until its licence conflict is settled.
- **OpenMVS (AGPL-3.0):** using it unmodified as a server step is usually fine. Offering a *modified* version to users over a network triggers the AGPL's network clause, which requires releasing the modified source. This is my reading of the AGPL; get it legally reviewed.
- **For a "sofa looks right" demo**, a clean room shell (walls, floor, openings) with metric scale matters more than photoreal texture. Splats are optional backdrop eye-candy, not the measurement source.

### Gaps
- I did not verify gsplat's 2DGS rasterization support in this session, so I can't say whether a commercially usable 2DGS-style mesher exists.
- The weight licences for the Depth Anything V2 metric fine-tunes and for Metric3D are unclear.
- I collected no head-to-head metric-accuracy benchmark for indoor rooms across these models.
- VGGT's and DUSt3R's scale behaviour comes from paper knowledge, not README text.

---

## 4. Room layout / floor-plan extraction — panoramas, point clouds/meshes, posed images; non-Manhattan, curved walls, multiple rooms, open doors

("Manhattan" means every wall meets at 90° and aligns to one grid.)

### Takeaway
The 360°-panorama methods (HorizonNet, HoHoNet, LED2-Net, LGT-Net, AtlantaNet) all have MIT-licensed code. Their repos are small and mature but quiet, and each outputs one room's outline from one viewpoint. Only AtlantaNet explicitly goes "beyond the Manhattan World Assumption," allowing vertical walls at any angle. None models curved walls as arcs; curves come out as many short straight segments.

The point-cloud methods handle several rooms and doors/windows:
- SpatialLM (walls, doors, windows, object boxes);
- RoomFormer (polygons for multiple rooms; one variant also predicts doors and windows);
- SceneScript (walls, doors, windows).

But their usable weights are mostly non-commercial (SpatialLM 1.1's encoder, SceneScript), or they were trained on datasets with non-commercial terms. A classical geometric pipeline (fit planes, then 2D lines and arcs, then polygons) is the licence-clean fallback.

### Cited Findings
**From a single 360° panorama**
- **HorizonNet**
  - Encodes the layout as 1D vectors; its post-processing "can automatically infer the room shape … it takes less than 20ms for a panorama image" — [arXiv 1901.03861](https://arxiv.org/abs/1901.03861)
  - The README offers "cuboid or general shaped room layout" and "Correct rotation pose to ensure manhattan alignment," with `--force_cuboid` for a four-wall layout. "By downloading the weights, you agree with the license and term of usage of the training datasets."
  - MIT; about 372 stars; last commit 2026-06-07 — [sunset1995/HorizonNet](https://github.com/sunset1995/HorizonNet)
- **HoHoNet** — panorama layout, depth and semantic segmentation; "runs at 52 FPS and 110 FPS with ResNet-50 and ResNet-34" on a 512 × 1024 panorama — [arXiv 2011.11498](https://arxiv.org/abs/2011.11498). MIT; last commit 2023-02-05 — [sunset1995/HoHoNet](https://github.com/sunset1995/HoHoNet)
- **LED2-Net** (CVPR 2021) — frames 360° layout estimation "as a problem of predicting depth on the horizon line of a panorama" — [arXiv 2104.00568](https://arxiv.org/abs/2104.00568). MIT; last commit 2024-02-03 — [fuenwang/LED2-Net](https://github.com/fuenwang/LED2-Net)
- **LGT-Net** (CVPR 2022) — uses "horizon-depth along with room height" plus "a planar-geometry aware loss" — [arXiv 2203.01824](https://arxiv.org/abs/2203.01824). It trains on MatterportLayout and ZInD; the README's dataset table has "Manhattan" and "No-Manhattan(%)" columns. MIT; last commit 2026-07-25 — [zhigangjiang/LGT-Net](https://github.com/zhigangjiang/LGT-Net)
- **AtlantaNet** (ECCV 2020) — "Inferring the 3D Indoor Layout from a Single 360 Image beyond the Manhattan World Assumption." It outputs "general shaped room layout (Manhattan or Atlanta World)," where Atlanta World means "single ceiling, vertical walls." Its curated checkpoint excludes scenes that break that assumption. MIT; about 84 stars — [crs4/AtlantaNet](https://github.com/crs4/AtlantaNet)

**From point clouds or meshes**
- **SpatialLM**
  - A 3D large language model that turns point clouds into "walls, doors, windows, and oriented object boxes." It was trained on a synthetic dataset of "12,328 indoor scenes (54,778 rooms)" — [arXiv 2506.07491](https://arxiv.org/abs/2506.07491)
  - Input point clouds must be "axis-aligned where the z-axis is the up axis." Its examples are "reconstructed from RGB videos using MASt3R-SLAM."
  - Version 1.1 has three modes: Structured Reconstruction (walls/doors/windows/boxes), Layout Estimation (walls/doors/windows), and object detection "conditioned on user-specified categories." The SpatialLM-Dataset was released Sept 2025 — [manycore-research/SpatialLM](https://github.com/manycore-research/SpatialLM)
  - **Licensing is mixed:**
    - The repo's LICENSE.txt is the Llama 3.2 Community License.
    - The README says "SpatialLM1.0 are built upon the SceneScript point cloud encoder, licensed under the CC-BY-NC-4.0 License" and "SpatialLM1.1 are built upon Sonata point cloud encoder, model weight is licensed under the CC-BY-NC-4.0 License."
    - Hugging Face tags: SpatialLM1.1-Llama-1B is `llama3.2`; SpatialLM1.1-Qwen-0.5B is `cc-by-nc-4.0`.
    - [SpatialLM LICENSE.txt](https://github.com/manycore-research/SpatialLM/blob/HEAD/LICENSE.txt), [HF SpatialLM1.1-Llama-1B](https://huggingface.co/manycore-research/SpatialLM1.1-Llama-1B), [HF SpatialLM1.1-Qwen-0.5B](https://huggingface.co/manycore-research/SpatialLM1.1-Qwen-0.5B)
  - About 5,119 stars; v0.1.1 (2025-06-10); last commit 2026-06-26.
- **RoomFormer** (CVPR 2023)
  - Formulates floor-plan reconstruction as finding "a variable-size set of polygons, which in turn are variable-length sequences of ordered vertices," and "generates polygons of multiple rooms in parallel" — [arXiv 2211.15658](https://arxiv.org/abs/2211.15658)
  - Input is a "top-down-view density map of the input point cloud." The SD-TQ variant predicts "room types, doors and windows." It was trained on Structured3D and SceneCAD (ScanNet). MIT; last commit 2025-04-02 — [ywyue/RoomFormer](https://github.com/ywyue/RoomFormer)
- **SceneScript (Meta, ECCV 2024)**
  - Writes the scene out as a structured "language"; trained on the 100k-scene synthetic Aria Synthetic Environments dataset — [arXiv 2403.13064](https://arxiv.org/abs/2403.13064)
  - The released models predict "layout (wall/door/window) and gravity-aligned 3D bounding boxes" from Project Aria glasses point clouds. "The models/code are licensed under the CC BY-NC license." — [facebookresearch/scenescript](https://github.com/facebookresearch/scenescript)
- **HEAT** — "The code, data, and model weights in this repository are not allowed for commercial usage." — [woodfrog/heat LICENSE](https://github.com/woodfrog/heat/blob/HEAD/LICENSE)

**From ordinary photos (unposed, multi-view)**
- **Plane-DUSt3R** (ICLR 2025) — "multi-view room layout estimation leveraging the 3D foundation model DUSt3R," fine-tuned on Structured3D — [arXiv 2502.16779](https://arxiv.org/abs/2502.16779). The repo is MIT but bundles DUSt3R (CC BY-NC-SA); about 53 stars — [justacar/Plane-DUSt3R](https://github.com/justacar/Plane-DUSt3R)

**Training-dataset terms (these decide whether pretrained weights can be used commercially)**
- **Structured3D:** "data is released under the Structured3D Terms of Use" (agreement form required); code MIT — [bertjiazheng/Structured3D](https://github.com/bertjiazheng/Structured3D)
- **ZInD (Zillow):** "free of charge for academic, non-commercial use," with a separate route for commercial requests; data under the ZInD Terms of Use, code Apache — [zillow/zind](https://github.com/zillow/zind)
- **ARKitScenes (Apple):** "Apple grants you a personal, non-commercial, non-exclusive license" — [ARKitScenes LICENSE](https://github.com/apple-aiml-research/ARKitScenes/blob/HEAD/LICENSE)
- **ScanNet:** code MIT, data under the ScanNet terms of use — [ScanNet/ScanNet](https://github.com/ScanNet/ScanNet)

**Apple's own layout tools:** RoomPlan (Section 1) and ARKit's classified mesh (wall, floor, ceiling, door, window) — [ARMeshClassification](https://developer.apple.com/documentation/arkit/armeshclassification)

### Inferences
- **Curved walls:** no open method here outputs arcs. Corner-based panorama methods and RoomFormer's polygons would turn a curve into many short straight segments. Practical recipe:
  1. Project wall points (a band between floor and ceiling) of the phone mesh or point cloud onto the floor.
  2. Fit straight lines and arcs with RANSAC.
  3. Close the outline into a polygon.
  4. Let the user nudge corners.
- **Non-Manhattan rooms:** AtlantaNet (vertical walls at any angle), LGT-Net (trained on ZInD, which contains non-Manhattan rooms), RoomFormer polygons and SpatialLM line segments can all represent angled walls. HorizonNet is built around Manhattan alignment.
- **Multiple rooms and open doors:** single-panorama methods only see what is visible from one spot; a doorway shows up as a gap or as part of the wall. RoomFormer (one polygon per room, plus doors in SD-TQ) and SpatialLM (door primitives) are the open options that model doors explicitly.
- **Commercial use is the bottleneck, not technology.** The code is mostly MIT, but nearly all pretrained layout weights come from non-commercial data. The options are:
  - retrain on licensed or synthetic data;
  - get a licence;
  - stay with geometric fitting plus RoomPlan on iOS.
- Panorama layout methods need a separate 360° capture flow and an assumed camera height for scale. I did not verify the latter in the READMEs; it is my understanding of how these methods work. That makes them a weaker fit than LiDAR or video-based capture for a metric sofa demo.

### Gaps
- I did not check newer 2024–2026 panorama-layout papers (e.g. Bi-Layout, DOPNet, uLayout); the DOPNet repo could not be found under the expected GitHub account.
- No accuracy figures were gathered for non-Manhattan, curved or multi-room scenes.
- HorizonNet's training-dataset terms were not enumerated.
- I found no open-source method that outputs explicit arc walls.

---

## 5. Strategies for the open-door / room-boundary problem

### Takeaway
Apple's answer is (a) ask users to close doors before scanning, (b) record doors as wall-attached surfaces with an open/closed flag, plus doorless "openings", and (c) build a house from **separate per-room scans** merged by StructureBuilder, with the user approving each room. Open-source tools give the parts but not a finished policy:
- room segmentation of 2D maps (ipa_room_segmentation, which can predict doorways but is non-commercial);
- per-room polygon and door prediction (RoomFormer, SpatialLM).

The main product decision is the default boundary rule. **The doorway closes the room** (a virtual wall across the door line) is the simplest rule and fits furniture placement. Alongside it, the user needs a quick way to confirm or edit the boundary, especially for open-plan spaces.

### Cited Findings
- Apple's guidance: "Closing the doors can reduce the chance of scanning unnecessary area outside of the room." — [WWDC22 10127](https://developer.apple.com/videos/play/wwdc2022/10127/)
- RoomPlan models a door as `door(isOpen:)`, a doorless passage as `opening`, and links both to a parent wall — [Surface.Category](https://developer.apple.com/documentation/roomplan/capturedroom/surface/category-swift.enum), [Surface.parentIdentifier](https://developer.apple.com/documentation/roomplan/capturedroom/surface/parentidentifier)
- RoomPlan scans one room per session and merges rooms only through StructureBuilder in a shared world space; merging by hand produces "duplicate walls and potentially duplicate objects" — [StructureBuilder.capturedStructure(from:)](https://developer.apple.com/documentation/roomplan/structurebuilder/capturedstructure(from:)), [WWDC23 10192](https://developer.apple.com/videos/play/wwdc2023/10192/)
- For open-plan spaces, RoomPlan can label several room types inside one captured room (e.g. kitchen + dining) as sections, each with its own center point — [CapturedRoom.Section](https://developer.apple.com/documentation/roomplan/capturedroom/section)
- RoomCaptureView builds in a user confirmation step: it "displays a small-scale version of the scanned room for the user to approve" — [RoomCaptureView](https://developer.apple.com/documentation/roomplan/roomcaptureview)
- **ipa_room_segmentation** (Fraunhofer IPA)
  - Splits a 2D map into rooms with five algorithms: morphological, distance, Voronoi, semantic, and Voronoi random field. "The fifth algorithm (voronoi random field segmentation) is capable of predicting doorways." The morphological method erodes the map step by step until separate regions appear.
  - Licence: "LGPL for academic and non-commercial use; for commercial use, please contact Fraunhofer IPA." Last push 2025-11-20.
  - [ipa320/ipa_coverage_planning (ipa_room_segmentation)](https://github.com/ipa320/ipa_coverage_planning/tree/HEAD/ipa_room_segmentation)
- RoomFormer predicts one polygon per room, and its SD-TQ variant adds doors and windows — [ywyue/RoomFormer](https://github.com/ywyue/RoomFormer)
- SpatialLM outputs doors and windows as separate structured elements alongside walls — [arXiv 2506.07491](https://arxiv.org/abs/2506.07491)

### Inferences (decisions YoungVista must make)
1. **Default boundary rule:**
   - **Option A, doorway = boundary (recommended default):** close each detected door or narrow opening with a virtual plane in its parent wall, and crop everything beyond it. It is simple, predictable and good for furniture placement. Its weakness is open-plan homes, where it can cut a living-dining space in two.
   - **Option B, keep everything scanned:** realistic, but adjacent rooms or corridors become noisy, partly scanned clutter, and wall-snapping and "fits / doesn't fit" logic get harder.
   - **Option C, ask when unsure:** use Option A for doors and gaps under about 1.2 m. For wider openings, ask "include this area?" with a top-down preview. The 1.2 m threshold is my illustrative number, not a sourced one.
2. **Capture guidance:** follow Apple's advice and prompt "close doors if you can," but never require it.
3. **Door swing as data:** store the door's hinge side and swing radius (user-tapped if not detected) so the app can warn when a sofa blocks the door. RoomPlan's `isOpen` flag alone doesn't give the swing.
4. **Confirmation UX for non-experts:** after the scan, show a 2D top-down floor plan with draggable corners, marked doors and windows, and a "cut here" or "extend" tool. This also fixes curved or odd walls without hard-coding room shapes. RoomPlan's own approval step is a precedent.
5. **Multiple rooms:** start with one room per scan (a reasonable demo scope). Later, either scan room by room in one AR session and merge (StructureBuilder on iOS; register point clouds on the server for Android), or do one continuous sweep and segment it afterwards (RoomFormer-style polygons; ipa_room_segmentation only with a commercial licence).
6. **Rendering what lies outside the door:** either hide it or show it as a faint, untextured "context" so users understand the cut. This is a design choice.

### Gaps
- I found no published consumer-UX studies on boundary confirmation.
- I found no open-source tool that automatically closes door openings in 3D meshes; this would have to be built.
- I don't know how RoomPlan treats a wide archway versus an open door in borderline cases; Apple doesn't document the thresholds.

---

## 6. How windows, mirrors and glass affect depth sensing and reconstruction, and how tools cope

### Takeaway
The depth sources involved all fail on specular (mirror-like) or transparent surfaces:
- Apple says "full-height mirrors and glass pose a challenge for the LiDAR sensor."
- ARCore's depth-from-motion is imprecise on featureless surfaces such as white walls.
- Photo-based methods also struggle with reflections (my inference).

Window light makes things worse, through glare and backlit, dim interiors. Mainstream tools cope mostly by planning the capture (open curtains, close doors, light above 50 lux) and by modelling windows as wall-attached planes rather than trusting raw depth. Research methods that explicitly handle mirrors and glass exist but aren't in production.

### Cited Findings
- Apple: "full-height mirrors and glass pose a challenge for the LiDAR sensor to produce the expected output"; "very dark surfaces could be hard for the device to scan"; "opening the curtains can let more natural light in and reduce window occlusions"; a minimum of 50 lux is recommended — [WWDC22 10127](https://developer.apple.com/videos/play/wwdc2022/10127/)
- RoomPlan gives the `lowTexture` coaching instruction for solid-colour walls and `turnOnLight` for darkness — [RoomCaptureSession.Instruction](https://developer.apple.com/documentation/roomplan/roomcapturesession/instruction)
- RoomPlan models windows as `window` surfaces attached to a wall — [Surface.parentIdentifier](https://developer.apple.com/documentation/roomplan/capturedroom/surface/parentidentifier)
- ARKit's mesh classification includes `window` and `door` (iOS 13.4+) — [ARMeshClassification](https://developer.apple.com/documentation/arkit/armeshclassification)
- ARCore: "Surfaces with few or no features, such as white walls, will be associated with imprecise depth." A time-of-flight sensor, where present, helps with featureless surfaces — [ARCore Depth](https://developers.google.com/ar/develop/depth)
- Research: Whelan et al., "Reconstructing Scenes with Mirror and Glass Surfaces" (SIGGRAPH 2018; ACM TOG 37(4), DOI 10.1145/3197517.3201319). An AprilTag (a printed marker) on the scanner gives cues for detecting mirrors and glass, feeding an automated pipeline that reconstructs and tells apart planar glass and mirror surfaces — [Meta/FRL blog](https://www.meta.com/blog/research-reflections-facebook-reality-labs-unveils-new-mirror-reconstruction-technology-ahead-of-siggraph-2018/), [UploadVR coverage](https://uploadvr.com/facebook-reality-labs-mirror-siggraph/)
- **Mirror3D** — "Depth Refinement for Mirror Surfaces" (dataset + method). Code MIT; about 52 stars; last commit 2022-10-12 (stale) — [3dlg-hcvc/mirror3d](https://github.com/3dlg-hcvc/mirror3d)

### Inferences
- **Typical failures** (from known physics; not individually sourced here):
  - Glass: LiDAR or depth returns may pass through it (capturing outdoor geometry) or drop out, leaving holes.
  - Mirrors: they produce a mirrored "phantom room" behind the wall.
  - Photo-based reconstruction (photogrammetry, splats): reflections become geometry behind the mirror plane, or floating blobs ("floaters").
  - Windows: bright exteriors cause exposure swings that hurt tracking and texture.
- **Coping strategies for YoungVista:**
  1. **Layout first:** make wall planes the source of truth and clip any geometry beyond them. This removes phantom rooms and outdoor points. Windows become openings or textured patches on the wall plane.
  2. Treat detected windows (RoomPlan, ARKit, or SpatialLM-style detection) as flat wall features, not 3D depth.
  3. Add an optional "mark mirror or glass" tap during review.
  4. For splat backdrops, crop splats outside the room polygon.
  5. In capture coaching, avoid pointing straight at windows into the sun and keep lights on.
- Mirrors on wardrobe doors and glass balcony doors are common in homes. Expect the "phantom room" bug in early testing and design the clip-to-walls step from day one.

### Gaps
- I found no quantitative data on iPhone LiDAR or ARCore depth error near glass or mirrors.
- I did not collect papers on 3D Gaussian splats with mirrors (e.g. MirrorGaussian-style work) or their licences.
- RoomPlan's behaviour with glass walls and sliding doors is undocumented.

---

## 7. Web-viewing building blocks (three.js, Gaussian-splat viewers, mesh processing, texture baking)

### Takeaway
The web stack is mature and permissively licensed:
- three.js (MIT; r187, 2026-10-30) now has native Gaussian-splat rendering with WebGPU and a loader for the newly ratified `KHR_gaussian_splatting` glTF extension, plus USD/USDZ loaders.
- Spark (MIT, by World Labs; v2.4.0) is the actively developed splat renderer for three.js, with level-of-detail (LoD) and paged loading.
- PlayCanvas engine, SuperSplat and splat-transform (all MIT) form a complete splat toolchain.
- mkkellogg's GaussianSplats3D is no longer actively developed.
- For room shells and GLB furniture, glTF-Transform and meshoptimizer/gltfpack (MIT), Draco and Basis Universal/KTX2 (Apache-2.0) handle compression. xatlas (MIT), mvs-texturing (BSD-3) and OpenMVS (AGPL) cover UV unwrapping and texture baking.

### Cited Findings
**three.js and wrappers**
- three.js: MIT; release r187 (2026-10-30); about 117,630 stars — [mrdoob/three.js](https://github.com/mrdoob/three.js)
- The examples loaders folder includes `GLTFGaussianSplatLoaderExtension.js`, `GaussianSplatPLYLoader.js`, `KSPLATLoader.js`, `SPLATLoader.js`, `USDZLoader.js` and `USDLoader.js` — [three.js examples/jsm/loaders](https://github.com/mrdoob/three.js/tree/HEAD/examples/jsm/loaders)
- The glTF plugin is "A glTF loader plugin for `KHR_gaussian_splatting`," which "must be registered explicitly because GaussianSplat requires WebGPURenderer" — [GLTFGaussianSplatLoaderExtension.js](https://github.com/mrdoob/three.js/blob/HEAD/examples/jsm/loaders/GLTFGaussianSplatLoaderExtension.js)
- Native splats landed in Aug 2026: commits "View-dependent Gaussian Splatting via Spherical Harmonics (#34215)" on 2026-08-12 and "Rename: GaussianSplatMesh -> GaussianSplat (#34306)" on 2026-08-19 — [three.js PR 34215](https://github.com/mrdoob/three.js/pull/34215), [PR 34306](https://github.com/mrdoob/three.js/pull/34306)
- React Three Fiber (a React wrapper for three.js): MIT; v9.8.2 (2026-10-15); about 33,512 stars — [pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber)

**Gaussian-splat renderers and viewers**
- **Spark** — "An advanced 3D Gaussian Splatting renderer for THREE.js. Built by World Labs."
  - It "Integrates with THREE.js rendering pipeline to fuse splat and mesh-based objects," targets "98%+ WebGL2 support," and reads PLY (including compressed PLY), SPZ, SPLAT, KSPLAT and SOG — [sparkjsdev/spark](https://github.com/sparkjsdev/spark)
  - Releases: v2.0.0 (2026-04-14) "LOD System"; v2.2.0 (2026-09-11) experimental faster LoD traversal; v2.3.0 on-demand rendering; v2.4.0 (2026-10-20) SPZ v4 read support and an abstracted paged-splat loader (`FetchSource`); v0.1.10 (Oct 2025) added PlayCanvas's SOG v2 format — [Spark releases](https://github.com/sparkjsdev/spark/releases)
  - MIT; about 3,872 stars.
- **GaussianSplats3D (mkkellogg)** — the README says: "this repo is no longer in active development … I recommend checking out Spark." MIT; last release v0.4.7 (2025-01-25) — [mkkellogg/GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D)
- **PlayCanvas engine**
  - "built on WebGL2 and WebGPU" with "First-class support for loading and rendering 3D Gaussian Splats," and asset streaming built on glTF 2.0, Draco and Basis — [playcanvas/engine](https://github.com/playcanvas/engine)
  - MIT; v2.23.3 (2026-10-15); about 17,209 stars.
- **SuperSplat** — "free and open source tool for inspecting, editing, optimizing and publishing 3D Gaussian Splats … runs in the browser." MIT; v3.7.0 (2026-10-26); about 10,598 stars — [playcanvas/supersplat](https://github.com/playcanvas/supersplat)
- **splat-transform** — "library and CLI tool for converting and editing Gaussian splats":
  - reads PLY, compressed PLY, SOG, streamed SOG, SPZ, SPLAT, KSPLAT and LCC;
  - writes PLY, compressed PLY, SOG, streamed SOG, SPZ, GLB, CSV, an HTML viewer, LOD, voxel and WebP;
  - can build "multi-LOD Streamed SOG."
  - MIT; v3.10.3 (2026-10-21) — [playcanvas/splat-transform](https://github.com/playcanvas/splat-transform)
- **Other splat viewers and formats**
  - **Babylon.js:** Apache-2.0; 9.34.0 (2026-11-05); its core includes `GaussianSplattingMesh` — [BabylonJS/Babylon.js](https://github.com/BabylonJS/Babylon.js)
  - **gsplat.js (Hugging Face):** MIT; 1.2.9 (2025-07-12) — [huggingface/gsplat.js](https://github.com/huggingface/gsplat.js)
  - **antimatter15/splat:** MIT; no releases — [antimatter15/splat](https://github.com/antimatter15/splat)
  - **SPZ (Niantic):** "a file format for compressed 3D gaussian splats." Version 4 uses ZSTD with independently compressed attribute streams, and versions 1–3 can still be read. MIT; v3.0.0 library release (2026-05-05) — [nianticlabs/spz](https://github.com/nianticlabs/spz)
- **glTF standard for splats**
  - The Khronos registry README for `KHR_gaussian_splatting` reads "Status: Complete, Ratified by the Khronos Group." The registry was updated 2026-09-03 and an edit followed 2026-10-13 — [KhronosGroup/glTF KHR_gaussian_splatting](https://github.com/KhronosGroup/glTF/blob/HEAD/extensions/2.0/Khronos/KHR_gaussian_splatting/README.md)
  - Earlier, Khronos had announced a release candidate — [Khronos news](https://www.khronos.org/news/archives/khronos-announces-gltf-gaussian-splatting-extension)
  - Compression comes through nested extensions. A secondary source says `KHR_gaussian_splatting_compression_spz_2` is still a draft; it was not found in the Khronos folder of the registry — [radiancefields.com](https://radiancefields.com/platforms/the-khronos-group)

**Mesh processing, compression and texturing**
- **meshoptimizer** — includes "gltfpack, a command-line tool that automatically optimizes glTF files," plus simplification, vertex quantization and `clusterlod.h` "continuous level of detail." MIT; v1.3 (2026-09-25) — [zeux/meshoptimizer](https://github.com/zeux/meshoptimizer)
- **glTF-Transform** — CLI and functions such as `prune`, `dedup`, `draco` and `textureCompress`. MIT; last commit 2026-10-16, with no GitHub Releases entries — [donmccurdy/glTF-Transform](https://github.com/donmccurdy/glTF-Transform)
- **Draco** — Apache-2.0; 1.5.9 (2026-10-16) — [google/draco](https://github.com/google/draco)
- **Basis Universal (KTX2 texture compression)** — Apache-2.0; v2_50 (2026-08-03) — [BinomialLLC/basis_universal](https://github.com/BinomialLLC/basis_universal)
- **xatlas (UV atlas generation)** — MIT; last commit 2022-07-25 (stable but stale) — [jpcy/xatlas](https://github.com/jpcy/xatlas)
- **mvs-texturing** — BSD-3 — [nmoehrle/mvs-texturing](https://github.com/nmoehrle/mvs-texturing). **OpenMVS** also has texturing, under AGPL-3.0 — [cdcseacave/openMVS](https://github.com/cdcseacave/openMVS)

**Other viewers and formats**
- **model-viewer** — web component for glTF. Apache-2.0; v4.4.0 (2026-10-09) — [google/model-viewer](https://github.com/google/model-viewer)
- **Potree** — point-cloud web viewer. BSD-2; 1.8.2 (2023-12-12) — [potree/potree](https://github.com/potree/potree)
- **OpenUSD** — for processing RoomPlan's USD/USDZ on a server. "Tomorrow Open Source Technology License 1.0," which "differs from the original Apache License 2.0" only in Section 6 (Trademarks); v26.11.1 (2026-10-21) — [OpenUSD LICENSE.txt](https://github.com/PixarAnimationStudios/OpenUSD/blob/HEAD/LICENSE.txt)
- **google/usd_from_gltf** (glTF→USD only, the opposite direction) is archived — [google/usd_from_gltf](https://github.com/google/usd_from_gltf)

### Inferences
- **Suggested web architecture for the demo:**
  - **Room shell:** a lightweight glTF room (wall, floor and opening polygons, generated on the server from RoomPlan JSON or open-source layout fitting), compressed with meshopt or Draco plus KTX2 textures.
  - **Furniture:** GLB product models loaded on top.
  - **Rendering:** three.js or React Three Fiber.
  - **Optional realism layer:** a cropped splat backdrop through Spark (works on WebGL2 today), or three.js's native `GaussianSplat` once WebGPU coverage is acceptable.
- One file format can cover both the room and its splats. With `KHR_gaussian_splatting` ratified, a single glTF can hold room geometry plus splats in the long run; SPZ or SOG cover compressed delivery now.
- **RoomPlan USDZ → web:** three.js's USDZ/USD loaders exist, but I did not test how faithful they are. Converting on the server to GLB, or generating GLB directly from CapturedRoom JSON, is more controllable.
- **Licences for web:** everything in this section is permissive except OpenMVS (AGPL, server-side). xatlas is unmaintained but still usable.

### Gaps
- I collected no mobile-browser performance benchmarks (splat counts or frame rates on mid-range Android or iPhone Safari).
- I did not verify model-viewer's AR modes (Scene Viewer, Quick Look, WebXR); web AR is mainly another researcher's scope.
- I did not verify WebGPU availability on iOS Safari and Android Chrome as of Nov 2026, though it matters for three.js native splats.
- I did not check Blender (headless texture baking) licence details in this session.

---

## 8. Summary table — tool → what it does → where it runs → license → commercial use OK? → maturity/activity

### Takeaway
For a consumer product, these are permissive and actively maintained:
- **Capture/reconstruction:** RTAB-Map, Open3D, COLMAP, gsplat, OpenMVS (AGPL caveat), Meshroom;
- **Feed-forward geometry:** MapAnything-apache, the DA3 Apache variants, MoGe-2, VGGT-1B-Commercial (gated);
- **Web:** three.js, Spark, the PlayCanvas tools, meshoptimizer, glTF-Transform.

The most-cited research models for splat meshing, metric depth and layout/LLM scene parsing are non-commercial: Inria 3DGS and descendants, PGSR, DUSt3R/MASt3R, UniDepth, Pi3 weights, SpatialLM, SceneScript and HEAT.

### Cited Findings
The table data comes from the GitHub GraphQL API and Hugging Face API on 2026-11-05, plus the LICENSE, README and model-card sources cited in Sections 1–7. ★ = GitHub stars; "rel" = latest GitHub Release; "commit" = last default-branch commit.

**Capture / on-device / SLAM**

| Tool | What it does | Where it runs | License | Commercial OK? | Maturity (rel · commit · ★) |
|---|---|---|---|---|---|
| [Apple RoomPlan](https://developer.apple.com/documentation/roomplan) | Parametric room scan: walls (curved, polygon), doors (open/closed), windows, openings, floors, 16 object types, multi-room merge | On-device iOS/iPadOS 16+ with LiDAR | Proprietary Apple SDK | Yes, under Apple SDK terms (not open source) | API unchanged since iOS 17 (2023) |
| [ARKit scene mesh (ARMeshClassification)](https://developer.apple.com/documentation/arkit/armeshclassification) | Live LiDAR mesh labelled wall/floor/ceiling/door/window/seat/table | On-device iOS 13.4+ with LiDAR | Proprietary Apple SDK | Yes (SDK terms) | Platform API |
| [ARCore Depth API](https://developers.google.com/ar/develop/depth) | Per-frame depth images (depth-from-motion, ToF optional); **no meshing** | On-device Android (supported devices) | ARCore Additional ToS (binaries) | Yes, under Google terms | SDK 1.57.0 (2026-10-16) · ★5,250 |
| [ARCore Depth Lab](https://github.com/googlesamples/arcore-depth-lab) | Unity samples of depth-based effects | Android | Apache-2.0 | Yes | 2.0.0 (2021-05-22) · 2026-05-14 · ★874 |
| [RTAB-Map](https://github.com/introlab/rtabmap) | RGB-D/LiDAR/visual SLAM, mesh + point cloud, export PLY/OBJ/LAS | iOS app (LiDAR), Android ("RTAB-Map ARCore" APK), desktop, ROS | BSD-3-style | Yes | 0.24.2 (2026-10-25) · 2026-11-04 · ★4,079 |
| [Open3D](https://github.com/isl-org/Open3D) | 3D processing, TSDF scene reconstruction | Server/desktop (Linux, macOS, Windows) | MIT | Yes | v0.20.0 (2026-09-16) · ★14,179 |
| [ORB-SLAM3](https://github.com/UZ-SLAMLab/ORB_SLAM3) | Sparse visual/visual-inertial SLAM (no mesh) | Desktop/embedded C++ | GPL-3.0 | Copyleft obligations | v1.0 (2021-12-22) · 2022-02-10 · ★9,223 — unmaintained |
| [OpenVINS](https://github.com/rpng/open_vins) | Visual-inertial odometry | Desktop/ROS | GPL-3.0 | Copyleft obligations | v2.7 (2023-06-20) · 2025-11-30 · ★3,171 |
| [InfiniTAM v3](https://github.com/victorprad/InfiniTAM) | Volumetric depth fusion | Desktop + depth camera (CUDA) | Oxford non-commercial | **No** | — · 2018-09-10 · ★976 — unmaintained |
| [Kimera](https://github.com/MIT-SPARK/Kimera) | Metric-semantic SLAM + mesh | ROS, CPU | BSD-2 | Yes | — · 2021-01-30 (VIO 2025-02) · ★2,143 |
| [MASt3R-SLAM](https://github.com/rmurai0610/MASt3R-SLAM) | Monocular dense SLAM, 15 FPS | Server GPU | CC BY-NC-SA 4.0 + dataset terms | **No** | — · 2025-11-09 · ★3,236 |
| [VGGT-SLAM](https://github.com/MIT-SPARK/VGGT-SLAM) | SLAM built on VGGT | Server GPU | BSD-2 code; VGGT weights terms apply | Code yes; weights only via VGGT-1B-Commercial | — · 2026-06-29 · ★1,174 |
| [SplaTAM](https://github.com/spla-tam/SplaTAM) | RGB-D Gaussian-splat SLAM | Server GPU | BSD-3 | Yes (code) | v1.0 (2023-12-07) · 2024-06-19 · ★2,218 |
| [MonoGS](https://github.com/muskie82/MonoGS) | Gaussian-splat SLAM | Server GPU | Imperial non-commercial | **No** | — · 2024-05-13 · ★2,191 |
| [Stray Scanner](https://github.com/strayrobots/scanner) | Records LiDAR RGB-D + poses on iPhone | iOS (LiDAR) | MIT | Yes | v1.4 (2026-04-04) · ★159 |

**Offline / cloud reconstruction**

| Tool | What it does | Where it runs | License | Commercial OK? | Maturity (rel · commit · ★) |
|---|---|---|---|---|---|
| [COLMAP](https://github.com/colmap/colmap) | Structure-from-motion + MVS; includes the "global" mapper (ex-GLOMAP) | Server/desktop | BSD-3 | Yes (check dependencies) | 4.2.1 (2026-09-29) · 2026-11-04 · ★13,158 |
| [GLOMAP](https://github.com/colmap/glomap) | Global SfM — merged into COLMAP | — | BSD-3 | Yes | Archived; 1.2.0 (2025-10-31) · ★2,349 |
| [OpenMVS](https://github.com/cdcseacave/openMVS) | Dense MVS, meshing, texturing | Server | AGPL-3.0 | Yes, with AGPL obligations | v2.4.0 (2026-01-20) · 2026-11-03 · ★4,185 |
| [Meshroom](https://github.com/alicevision/Meshroom) / [AliceVision](https://github.com/alicevision/AliceVision) | Photogrammetry pipeline + GUI | Desktop/server | MPL-2.0 | Yes (file-level copyleft) | v2025.1.0 / v3.3.0 (2025-08-19) · active · ★13,062 / 3,528 |
| [OpenMVG](https://github.com/openMVG/openMVG) | SfM library | Server | MPL-2.0 | Yes | v2.1 (2023-12-28) · 2026-08-30 · ★6,587 |
| [mvs-texturing](https://github.com/nmoehrle/mvs-texturing) | Texturing of reconstructed meshes | Server | BSD-3 (unless noted per file) | Yes | — · 2026-03-11 · ★1,112 |
| [nerfstudio](https://github.com/nerfstudio-project/nerfstudio) | NeRF/splat framework; imports Polycam/Record3D/KIRI/video | Server GPU | Apache-2.0 | Yes | v1.1.5 (2024-11-11) · 2025-07-29 · ★12,151 — slowing |
| [3DGS (Inria)](https://github.com/graphdeco-inria/gaussian-splatting) | Original 3D Gaussian Splatting | Server GPU | Inria/MPII non-commercial | **No** | — · 2024-10-30 · ★24,420 |
| [gsplat](https://github.com/nerfstudio-project/gsplat) | CUDA splat rasterization/training library | Server GPU | Apache-2.0 | Yes | v1.5.3 (2025-07-04) · 2026-09-19 · ★5,870 |
| [2DGS](https://github.com/hbb1/2d-gaussian-splatting) | Surfel splatting + TSDF mesh extraction | Server GPU | Inria GS license (NC) | **No** | — · 2026-08-25 · ★3,331 |
| [PGSR](https://github.com/zju3dv/PGSR) | Planar splatting surface reconstruction | Server GPU | Research / non-profit only | **No** | — · 2024-12-25 · ★1,131 |
| [GOF](https://github.com/autonomousvision/gaussian-opacity-fields) / [SuGaR](https://github.com/Anttwo/SuGaR) | Splat mesh extraction | Server GPU | Inria GS license (NC) | **No** | — · 2024-11 / 2024-09 · ★1,024 / 3,556 |
| [instant-ngp](https://github.com/NVlabs/instant-ngp) | Fast NeRF | Server (NVIDIA GPU) | NVIDIA Source Code License (NC) | **No** | v2.0 (2025-07-08) · ★17,588 |

**Feed-forward geometry and depth models**

| Tool | What it does | Where it runs | License | Commercial OK? | Maturity (rel · commit · ★) |
|---|---|---|---|---|---|
| [DUSt3R](https://github.com/naver/dust3r) / [MASt3R](https://github.com/naver/mast3r) | Pairwise point maps / matching (MASt3R has a metric checkpoint) | Server GPU | CC BY-NC-SA 4.0 (+ dataset terms) | **No** | — · 2025-07 / 2025-06 · ★7,362 / 3,154 |
| [VGGT](https://github.com/facebookresearch/vggt) | Cameras, depth, points from many views in one pass (not metric — inference) | Server GPU | Code: VGGT License v1; weights: VGGT-1B CC-BY-NC / VGGT-1B-Commercial (gated, AUP) | Only with the Commercial checkpoint | — · 2026-05-19 · ★14,599 |
| [MapAnything](https://github.com/facebookresearch/map-anything) | **Metric** multi-view reconstruction; optional intrinsics/poses/depth inputs | Server GPU | Code Apache-2.0; weights CC-BY-NC or **Apache-2.0 variant** | Yes (`map-anything-apache`) | v1.1.3 (2026-07-17) · 2026-08-07 · ★3,885 |
| [π³ / Pi3X](https://github.com/yyfz/Pi3) | Multi-view geometry; Pi3X approximately metric | Server GPU | Code BSD-3; weights CC BY-NC 4.0 (HF card for Pi3 says BSD-2 — conflict) | **No** (weights) | — · 2026-05-18 · ★2,239 |
| [Depth Anything 3](https://github.com/ByteDance-Seed/Depth-Anything-3) | Any-view geometry; DA3Metric gives **metric** single-image depth | Server GPU | Code Apache-2.0; Small/Base/Metric-Large/Mono-Large Apache-2.0; Large/Giant/Nested CC BY-NC | Yes for Apache variants | weights Nov 2025 · 2026-07-27 · ★6,636 |
| [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) | Relative single-image depth (+ metric fine-tunes) | Server/edge | Small Apache-2.0; Base/Large/Giant CC-BY-NC | Small only | — · 2026-03-24 · ★9,106 |
| [Depth Pro](https://github.com/apple-aiml-research/ml-depth-pro) | **Metric** single-image depth, no intrinsics needed | Server GPU | Code: Apple licence; weights: `apple-amlr` research-only on HF vs "LICENSE terms" on GitHub (conflict) | Unclear — treat as No | — · 2026-09-11 · ★5,778 |
| [Metric3D v2](https://github.com/YvanYin/Metric3D) | **Metric** single-image depth + normals | Server GPU | Code BSD-2; weights licence unclear | Code yes; weights unclear | — · 2025-03-13 · ★2,340 |
| [UniDepth V2](https://github.com/lpiccinelli-eth/UniDepth) | **Metric** depth + camera intrinsics from one image | Server GPU | CC BY-NC 4.0 | **No** | — · 2025-05-18 · ★1,277 |
| [MoGe / MoGe-2](https://github.com/microsoft/MoGe) | **Metric** single-image point map + normals | Server GPU | MIT (code + HF weights) | Yes | — · 2026-08-19 · ★3,130 |

**Room layout / floor-plan extraction**

| Tool | What it does | Where it runs | License | Commercial OK? | Maturity (rel · commit · ★) |
|---|---|---|---|---|---|
| [HorizonNet](https://github.com/sunset1995/HorizonNet) | Panorama → layout (cuboid/general, Manhattan-aligned) | Server/edge | MIT code; weights bound by dataset terms | Code yes; weights per datasets | — · 2026-06-07 · ★372 |
| [HoHoNet](https://github.com/sunset1995/HoHoNet) | Panorama layout + depth + semantics | Server | MIT | Code yes | — · 2023-02-05 · ★130 |
| [LED2-Net](https://github.com/fuenwang/LED2-Net) | Panorama layout via horizon depth | Server | MIT | Code yes | — · 2024-02-03 · ★115 |
| [LGT-Net](https://github.com/zhigangjiang/LGT-Net) | Panorama layout; trained incl. ZInD (non-Manhattan) | Server | MIT | Code yes (ZInD weights NC) | — · 2026-07-25 · ★127 |
| [AtlantaNet](https://github.com/crs4/AtlantaNet) | Panorama layout beyond Manhattan (Atlanta world) | Server | MIT | Code yes | — · 2025-02-18 · ★84 |
| [SpatialLM](https://github.com/manycore-research/SpatialLM) | Point cloud → walls/doors/windows/object boxes | Server GPU | Llama 3.2 licence + CC-BY-NC encoder weights (1.1) | Effectively **No** | v0.1.1 (2025-06-10) · 2026-06-26 · ★5,119 |
| [RoomFormer](https://github.com/ywyue/RoomFormer) | Density map → multi-room polygons (+ doors/windows in SD-TQ) | Server GPU | MIT code; weights trained on Structured3D/SceneCAD | Code yes; weights dataset-bound | — · 2025-04-02 · ★342 |
| [SceneScript](https://github.com/facebookresearch/scenescript) | Aria point cloud → wall/door/window/box "script" | Server GPU | CC BY-NC | **No** | — · 2026-01-12 · ★389 |
| [Plane-DUSt3R](https://github.com/justacar/Plane-DUSt3R) | Unposed multi-view room layout | Server GPU | MIT repo + DUSt3R (NC) | **No** (inferred) | — · 2025-03-04 · ★53 |
| [HEAT](https://github.com/woodfrog/heat) | Structured (planar-graph) reconstruction | Server | Non-commercial | **No** | — · 2025-03-26 · ★138 |
| [ipa_room_segmentation](https://github.com/ipa320/ipa_coverage_planning) | 2D map → rooms, doorway prediction | Server/ROS | LGPL for academic/non-commercial; commercial via Fraunhofer | **No** without licence | push 2025-11-20 · ★364 |
| [Mirror3D](https://github.com/3dlg-hcvc/mirror3d) | Mirror-surface depth refinement | Server | MIT | Yes (code) | — · 2022-10-12 · ★52 — stale |

**Web viewing and asset pipeline**

| Tool | What it does | Where it runs | License | Commercial OK? | Maturity (rel · commit · ★) |
|---|---|---|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | WebGL/WebGPU 3D; glTF/USDZ/USD loaders; native GaussianSplat (WebGPU) | Web | MIT | Yes | r187 (2026-10-30) · 2026-11-05 · ★117,630 |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber) | React wrapper for three.js | Web | MIT | Yes | v9.8.2 (2026-10-15) · ★33,512 |
| [Spark](https://github.com/sparkjsdev/spark) | three.js splat renderer, LoD, paged loading | Web (WebGL2) | MIT | Yes | v2.4.0 (2026-10-20) · ★3,872 |
| [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D) | three.js splat viewer | Web | MIT | Yes | v0.4.7 (2025-01-25) · no longer actively developed · ★2,940 |
| [PlayCanvas engine](https://github.com/playcanvas/engine) | WebGL2/WebGPU engine with first-class splats | Web | MIT | Yes | v2.23.3 (2026-10-15) · ★17,209 |
| [SuperSplat](https://github.com/playcanvas/supersplat) | Browser splat editor/publisher | Web | MIT | Yes | v3.7.0 (2026-10-26) · ★10,598 |
| [splat-transform](https://github.com/playcanvas/splat-transform) | Splat conversion, LOD, streamed SOG | CLI/server | MIT | Yes | v3.10.3 (2026-10-21) · ★1,411 |
| [Babylon.js](https://github.com/BabylonJS/Babylon.js) | Engine incl. GaussianSplattingMesh | Web | Apache-2.0 | Yes | 9.34.0 (2026-11-05) · ★26,299 |
| [gsplat.js](https://github.com/huggingface/gsplat.js) | Splat viewer library | Web | MIT | Yes | 1.2.9 (2025-07-12) · ★1,675 |
| [SPZ](https://github.com/nianticlabs/spz) | Compressed splat format + library | All | MIT | Yes | v3.0.0 (2026-05-05), format v4 · ★943 |
| [KHR_gaussian_splatting](https://github.com/KhronosGroup/glTF/blob/HEAD/extensions/2.0/Khronos/KHR_gaussian_splatting/README.md) | glTF extension for splats | Spec | Khronos specification | Yes (open standard) | Ratified (registry 2026-09-03) |
| [meshoptimizer / gltfpack](https://github.com/zeux/meshoptimizer) | Simplification, quantization, glTF optimization, LOD | CLI/server/WASM | MIT | Yes | v1.3 (2026-09-25) · ★8,792 |
| [glTF-Transform](https://github.com/donmccurdy/glTF-Transform) | glTF processing (Draco, meshopt, texture compression) | Node/CLI/browser | MIT | Yes | no GitHub releases · 2026-10-16 · ★2,061 |
| [Draco](https://github.com/google/draco) | Geometry compression | All | Apache-2.0 | Yes | 1.5.9 (2026-10-16) · ★7,541 |
| [Basis Universal](https://github.com/BinomialLLC/basis_universal) | KTX2 texture supercompression | All | Apache-2.0 | Yes | v2_50 (2026-08-03) · ★3,141 |
| [xatlas](https://github.com/jpcy/xatlas) | UV atlas generation for texture baking | Server | MIT | Yes | — · 2022-07-25 · ★2,596 — stale |
| [model-viewer](https://github.com/google/model-viewer) | Drop-in glTF viewer web component | Web | Apache-2.0 | Yes | v4.4.0 (2026-10-09) · ★8,313 |
| [Potree](https://github.com/potree/potree) | Point-cloud web viewer | Web | BSD-2 | Yes | 1.8.2 (2023-12-12) · 2026-01-08 · ★5,658 |
| [OpenUSD](https://github.com/PixarAnimationStudios/OpenUSD) | USD/USDZ toolkit (RoomPlan export processing) | Server | TOST 1.0 (Apache-2.0 variant) | Yes | v26.11.1 (2026-10-21) · ★7,616 |

### Inferences
- **Lowest-licence-risk demo stack:**
  - iOS LiDAR: RoomPlan for the layout, optionally the ARKit mesh for ceilings and texture.
  - Android and non-LiDAR iPhones: record video plus ARCore/ARKit poses (and depth), then on the server use COLMAP or MapAnything-apache for metric geometry, Open3D TSDF for a mesh, and geometric plane/arc fitting for the layout.
  - Web: three.js/R3F + glTF (meshopt/KTX2), with Spark for optional splats.
- **Maintenance flags as of 2026-11-05** — "unmaintained" here means no meaningful commits for at least 2 years:
  - Unmaintained: ORB-SLAM3, InfiniTAM, Kimera (umbrella repo), HoHoNet, Mirror3D, xatlas.
  - Slowing: nerfstudio, and Inria's original 3DGS.
  - Superseded: GaussianSplats3D (by Spark) and GLOMAP (by COLMAP).

### Gaps
- Star counts and dates are one snapshot (2026-11-05). Repos that publish through npm or PyPI rather than GitHub Releases show "—" for releases.
- Licence conflicts that need legal review: Depth Pro weights (HF `apple-amlr` vs the GitHub README), Pi3 (HF BSD-2 tag vs README CC BY-NC), and SpatialLM 1.1-Llama (Llama 3.2 vs a CC-BY-NC encoder).
- Out of scope and not covered here, but relevant to the final report:
  - Apple Measure and phone accuracy;
  - Matterport;
  - commercial SDKs (Polycam, Niantic Lightship, Scaniverse);
  - cross-platform app architecture;
  - AI image generation.
