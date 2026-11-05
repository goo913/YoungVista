# Cross-platform architecture for YoungVista: room scan → 3D model → AR placement on iPhone and Android, plus a web viewer

Research date: 2026-11-05. I pulled repo and package stats live on 2026-11-05 from the GitHub REST API (stars, `open_issues_count`, license SPDX, last push, latest release) and the npm registry (latest version, publish date, license, peerDependencies, weekly downloads). GitHub's `open_issues_count` includes open pull requests.

How each finding was checked:
- **[V]** means I checked it directly against a primary source in this session (official docs, a GitHub or npm API response, a repo README, or a release page).
- **[V\*]** means the source is primary, but I read it through a search-tool extract and did not open the page myself.
- **[S]** means a secondary or third-party source.
- Inferences appear only in the "Inferences" subsections.

---

## 1. Expo / React Native in late 2026: platform status, the native-code path, and the RoomPlan/AR/3D library landscape

### Takeaway
Expo works as YoungVista's app shell. The team's worry ("Apple and Android use different scanning/AR modules") is valid, but it doesn't rule Expo out. The per-platform code lives in custom Expo native modules behind one TypeScript interface. Those modules need development builds (EAS Build or local Xcode/Android Studio), so Expo Go is not an option.

No React Native library delivers "RoomPlan capture + AR placement on both platforms" ready-made:
- **expo-roomplan:** iOS-only, with a single maintainer.
- **ViroReact v3:** the only actively maintained cross-platform React Native AR library. Each release pins exactly one Expo SDK, and it has open Android device bugs.
- **Everything else** is alpha (SceneView React Native), lacks Expo support (Babylon React Native), or is render-only with no AR (react-native-filament, R3F on expo-gl).

### Cited Findings

**Platform status (Expo SDK, New Architecture, Expo Go, native modules)**
- **Expo SDK 58** was published on October 15, 2026 with React Native 0.88, which also folds in the 0.87 changes. It is "built for iOS 27". "Expo Modules 2.0 is in beta on both iOS and Android": you write "an ordinary Swift or Kotlin class". On EAS Build, `expo-modules-core` now ships precompiled Android libraries; in Expo's test a clean four-ABI debug build dropped from about 80 s to about 39 s. R8 is on by default in release builds. "SDK 58 does not support macOS yet." — [Expo SDK 58 changelog](https://expo.dev/changelog/sdk-58) [V]
- **Latest npm versions:** `expo` is 58.0.23 (published 2026-11-03, about 16.8M downloads/week). `react-native` is 0.88.1 (2026-10-27). — [npm: expo](https://www.npmjs.com/package/expo); [npm: react-native](https://www.npmjs.com/package/react-native) [V]
- **SDK 56** (May 21, 2026) shipped React Native 0.85 and React 19.2. It added:
  - "inline modules", which let Expo modules live inside the app's own project tree;
  - prebuilt iOS binaries by default;
  - stable SwiftUI (iOS) and Jetpack Compose (Android) APIs in Expo UI.

  An August 27 note warned of a Hermes V1 memory regression with reanimated/worklets and advised moving to SDK 57. — [Expo SDK 56 changelog](https://expo.dev/changelog/sdk-56) [V\*]
- **New Architecture:** React Native 0.82 (Oct 8, 2025) was the first release that runs only on the New Architecture and blocks re-enabling the legacy setup. React Native 0.81 / Expo SDK 54 were the last releases that allowed the legacy architecture. Expo SDK 58 / React Native 0.88 are therefore New-Architecture-only. — [React Native 0.82 blog](https://reactnative.dev/blog/2025/10/08/react-native-0.82) [V\*]
- **Expo Go limits:**
  - The SDK 58 Expo Go "will be released within a few weeks" and "will support only SDK 58".
  - Expo Go "is not recommended as a development environment for production apps".
  - Adding "a native module Expo Go doesn't support" causes a runtime error, so the guidance is to use development builds. — [Expo SDK 58 changelog](https://expo.dev/changelog/sdk-58) [V]
- **Expo Go store availability is itself unreliable.** As of May 4, 2026, Apple had not approved the SDK 55 Expo Go build, and the stores kept serving the SDK 54 build. — [Expo changelog: Expo Go and the App Store in May 2026](https://expo.dev/changelog/expo-go-and-app-store-may-2026) [V\*]
- **Embedding a native view in React Native:**
  - A module's `View(...)` definition registers a native class that subclasses `ExpoView`. Per the docs, that class "extends `ExpoView`, which extends `RCTView` from React Native" and "eventually extends `View` on Android and `UIView` on iOS".
  - Props are declared with `Prop("...")`. Events use `Events("...")` plus an `EventDispatcher`.
  - The tutorial builds and runs with `npx expo prebuild` / `npx expo run:ios|android`.
  - It covers UIView/View only, not SwiftUI/Compose hosting. — [Expo Modules native view tutorial](https://docs.expo.dev/modules/native-view-tutorial/) [V]
- **Expo DOM components** (`'use dom'`) render web React code in a WebView on iOS and Android, including in Expo Go. From SDK 56, `@expo/dom-webview` is the default. Caveats from the docs:
  - "DOM components only support standard JavaScript, which is slower to parse and start up than optimized Hermes bytecode."
  - Props are serializable only and cross an async JSON bridge.
  - "You cannot add native views to DOM components."
  - "The web also has very good WebGL support", but "devices in low-power mode will often throttle web frame rates." — [Expo DOM components guide](https://docs.expo.dev/guides/dom-components/) [V]

**RoomPlan wrappers**
- **expo-roomplan** (GitHub `fordat`): MIT; 39 stars; 1 open issue; last push 2026-11-03; no GitHub releases. On npm it is at 1.3.2 (2026-11-03) with about 2,940 downloads/week. Recent commits (Sept–Nov 2026) are an Android build-error fix, a usage-description doc, a missing-import fix and Xcode-build CI. — [GitHub fordat/expo-roomplan](https://github.com/fordat/expo-roomplan); [npm expo-roomplan](https://www.npmjs.com/package/expo-roomplan) [V]
- **expo-roomplan features:**
  - `useRoomPlan()`, which presents Apple's pre-built view controller.
  - `RoomPlanView` / `useRoomPlanView()`, an embeddable view with start/cancel/finishScan/addRoom/exportScan/reset controls and status/preview/export callbacks.
  - Export of a `.usdz` plus a `.json` file, with `ExportType` Parametric (default), Mesh or Model.
  - "Requires iOS 16.0 or higher"; multi-room "requires iOS 17.0+".
  - A config plugin (`app.plugin.js`).
  - The README documents no Android functionality. — [expo-roomplan README](https://github.com/fordat/expo-roomplan) [V]
- **react-native-roomplan** (`omarlahkim`): MIT; 2 stars. Its only npm release (0.1.1) and last push were on 2024-03-11, and it gets about 6 downloads/week, so it is effectively abandoned. — [GitHub](https://github.com/omarlahkim/react-native-roomplan); [npm](https://www.npmjs.com/package/react-native-roomplan) [V]
- **Other RoomPlan npm packages** in late 2026 are app-specific Capacitor plugins licensed `UNLICENSED` (jobtwin-, forgeone-, homesmartfix-capacitor-roomplan) and an ISC Cordova plugin last published as a beta in July 2024. — [npm registry search "roomplan"](https://registry.npmjs.org/-/v1/search?text=roomplan&size=20) [V]
- **A 2026 DEV article** wrapped RoomPlan as an Expo module with `isAvailable()` (LiDAR + iOS 17) and `scanRoom()`, returning a typed JS object (floor area, surfaces, confidence levels). The author's views:
  - "Expo's native module API makes this cleaner than the old React Native bridge approach".
  - LiDAR should be "an enhancement, not a hard dependency", with a manual fallback. — [DEV: Wrapping Apple's LiDAR Room Scanner as a Native Expo Module](https://dev.to/toddsullivan/wrapping-apples-lidar-room-scanner-as-a-native-expo-module-cip) [S]

**ViroReact / ReactVision (cross-platform AR in React Native)**
- **Repo and package:** ReactVision/viro is MIT, with 1,835 stars, 27 open issues+PRs, last push 2026-11-05 and latest release v3.0.3 (2026-10-07). `@reactvision/react-viro` gets about 5,572 downloads/week. — [GitHub ReactVision/viro](https://github.com/ReactVision/viro); [npm @reactvision/react-viro](https://www.npmjs.com/package/@reactvision/react-viro) [V]
- **History and business model:**
  - Viro Media built it and open-sourced it in 2019. The community maintained it from late 2020. Morrow Digital bought it in January 2025, and ReactVision became a separate company in late 2025.
  - The core is "MIT licensed and free forever".
  - "Platform features" (Cloud Anchors, Geospatial Anchors, VPS, co-location, AI asset creation) run on ReactVision's managed cloud and need an `rvApiKey`. Co-location "requires a paid plan". The README publishes no pricing for these. — [README](https://github.com/ReactVision/viro); [Releases](https://github.com/ReactVision/viro/releases) [V]
- **Platforms:** iOS (ARKit, deployment target 15.1), Android (ARCore), Meta Quest, visionOS (26.0), and Web (WebGL2/WASM via the optional `@reactvision/viro-web-renderer`). Models: "OBJ, GLTF/GLB and VRX (FBX converted to VRX offline)". — [README](https://github.com/ReactVision/viro) [V]
- **v3.0.0** (Sept 20, 2026) "runs on five platforms from one codebase" and adds VPS, co-location, Vision Pro, web and Quest mixed reality. Other notes:
  - On web, "plane detection and hit test come from ReactVision's own visual-inertial tracker".
  - `onWorldMeshUpdated` "does not fire and never has". It is deprecated in favour of `getWorldMeshStats()`. — [Releases](https://github.com/ReactVision/viro/releases) [V]
- **New Architecture:** v2.43.1 (June 2025) completed the move to React Native's New Architecture and dropped the legacy architecture. — [ViroReact 2.43.1 changelog](https://viro-community.readme.io/changelog/reactvision-2431-full-new-architecture-support-major-stability-fixes) [V\*]
- **Expo SDK pinning:** v3.0.3's peerDependencies are `expo >=57.0.0 <58.0.0` and `react-native >=0.86.0 <0.87.0`. So on 2026-11-05 ViroReact does not yet declare support for Expo SDK 58, which shipped Oct 15. A "Release 3.1.0" tracking issue was opened on 2026-10-28. — [npm @reactvision/react-viro](https://www.npmjs.com/package/@reactvision/react-viro); [Issue #574](https://github.com/ReactVision/viro/issues/574) [V]
- **Expo Go:** "ViroReact requires native code and **cannot run in Expo Go**". The starter kit uses `npx expo prebuild --clean` and development builds. — [ReactVision expo-starter-kit-typescript](https://github.com/ReactVision/expo-starter-kit-typescript) [V]
- **Occlusion:** an `occlusionMode` (`disabled` | `depthBased`) arrived in v2.50.0. It uses LiDAR on Pro iPhones and iPad Pro, a monocular depth model on non-LiDAR iPhones, and the ARCore Depth API on Android. v2.57.0 improved non-LiDAR iOS occlusion. — [v2.50.0](https://github.com/reactvision/viro/releases/tag/v2.50.0); [v2.57.0](https://github.com/reactvision/viro/releases/tag/v2.57.0) [V\*]
- **Open Android issues, late 2026:**
  - ARCore tracking "never settles" on a Galaxy A56 / Android 16, while "plain ARCore apps work on the same phone" (#568).
  - The camera background stays black on a Galaxy S24 / Android 16 (#499) and on a Galaxy A54 under the Expo managed workflow (#513).
  - An Android camera crash is still present in 3.0.3 (#597). — [#568](https://github.com/ReactVision/viro/issues/568); [#499](https://github.com/ReactVision/viro/issues/499); [#513](https://github.com/ReactVision/viro/issues/513); [#597](https://github.com/ReactVision/viro/issues/597) [V, titles via API]

**3D rendering libraries for React Native (no AR) and other AR options**
- **react-native-filament** (Margelo): MIT; 1,433 stars; 58 open; v1.11.0 (2026-05-27); about 21.5k downloads/week.
  - Uses Filament PBR and Bullet physics, and supports `glb` "out of the box" ("only glb supported yet").
  - "Supports old and new arch".
  - No AR. The README describes no Expo config plugin. Peer dependency: `react-native-worklets-core`. — [GitHub margelo/react-native-filament](https://github.com/margelo/react-native-filament); [npm](https://www.npmjs.com/package/react-native-filament) [V]
- **React Three Fiber (R3F):** MIT; 33.5k stars; stable v9.8.2 (Oct 14–15, 2026); v10 in alpha (v10.0.0-alpha.6, 2026-10-17).
  - On native it is imported from `@react-three/fiber/native` and uses `expo-gl` + `expo-asset` (npm peer deps also include `expo-file-system`).
  - The docs warn that "iOS simulators often have incomplete or unreliable OpenGL ES support" and say to "Always test on a physical iOS device (iPhone/iPad running iOS 16 or later)".
  - Metro must be configured for `.glb` assets. — [R3F GitHub](https://github.com/pmndrs/react-three-fiber); [R3F installation docs](https://r3f.docs.pmnd.rs/getting-started/installation); [npm @react-three/fiber](https://www.npmjs.com/package/@react-three/fiber) [V]
- **expo-gl** 58.0.4 (2026-10-31; about 317k/week) is maintained with the Expo SDK.
  - **expo-three** is stale: last push 2024-07-31, last npm 8.0.0 (July 2024), pinned to `three ^0.166`. — [npm expo-gl](https://www.npmjs.com/package/expo-gl); [GitHub expo/expo-three](https://github.com/expo/expo-three) [V]
- **Babylon React Native:** MIT; 435 stars; 2.0.8 (2026-10-26); about 405 downloads/week.
  - iOS 16+; baseline React Native 0.81.6.
  - "Official support for React Native frameworks, like Expo, is not provided by BabylonReactNative."
  - AR comes through Babylon Native XR; the test checklist includes "Start XR" on ARCore/ARKit devices.
  - "multiple views are not yet supported". — [GitHub BabylonJS/BabylonReactNative](https://github.com/BabylonJS/BabylonReactNative); [npm @babylonjs/react-native](https://www.npmjs.com/package/@babylonjs/react-native) [V]
- **SceneView:** Apache-2.0; 1,358 stars; 160 open; v4.66.0 (2026-11-04).
  - Android (Compose + Filament) is "Stable"; iOS (SwiftUI + RealityKit), Web, Flutter and React Native are all "Alpha".
  - The React Native package `@sceneview-sdk/react-native` (Fabric, about 811 downloads/week) and the Flutter package "bridge a subset of the native API". No AR features are listed for React Native. — [GitHub sceneview/sceneview](https://github.com/sceneview/sceneview); [npm @sceneview-sdk/react-native](https://www.npmjs.com/package/@sceneview-sdk/react-native) [V]
- **react-native-arkit:** MIT; last release 0.9.0 in Feb 2018, last push Jan 2023. Dead. — [GitHub react-native-ar/react-native-arkit](https://github.com/react-native-ar/react-native-arkit) [V]
- **react-native-wgpu / react-native-webgpu** (WebGPU via Dawn): MIT; 1,274 stars; pushed 2026-11-05. It is a possible future route for three.js/WebGPU on native; I didn't evaluate it. — [GitHub wcandillon/react-native-webgpu](https://github.com/wcandillon/react-native-webgpu) [V, stats only]

**Library maintenance snapshot (2026-11-05, GitHub API + npm)**

| Library | License (commercial use?) | Stars | Open issues+PRs | Latest release | Weekly npm DL | Status |
|---|---|---|---|---|---|---|
| expo-roomplan | MIT (yes) | 39 | 1 | npm 1.3.2, 2026-11-03 | ~2.9k | Active, single maintainer, iOS-only |
| react-native-roomplan | MIT (yes) | 2 | 0 | 0.1.1, 2024-03-11 | ~6 | Abandoned |
| @reactvision/react-viro | MIT core (yes); paid cloud features | 1,835 | 27 | v3.0.3, 2026-10-07 | ~5.6k | Active; pinned to Expo 57 |
| react-native-filament | MIT (yes) | 1,433 | 58 | v1.11.0, 2026-05-27 | ~21.5k | Active; no AR |
| @react-three/fiber (+ expo-gl) | MIT (yes) | 33,512 | 31 | v9.8.2, Oct 2026 | ~9.5M | Very active; no AR on native |
| @babylonjs/react-native | MIT (yes) | 435 | 32 | 2.0.8, 2026-10-26 | ~405 | Active; Expo unsupported |
| @sceneview-sdk/react-native | Apache-2.0 (yes) | 1,358 (monorepo) | 160 | 4.66.0, 2026-11-04 | ~811 | Alpha |
| expo-three | MIT (yes) | 873 | 103 | 8.0.0, 2024-07 | ~32k | Stale |
| react-native-arkit | MIT (yes) | 1,741 | 43 | 0.9.0, 2018-02 | n/a | Dead |
| @azesmway/react-native-unity | MIT (yes; Unity license separate) | 392 | 112 | v1.1.1, 2026-08-07 | ~1.5k | Active, many open issues |

Sources: the GitHub and npm links above [V]. The MIT and Apache-2.0 licenses both allow commercial use.

### Inferences
- **Expo fits the shell.** That covers auth, onboarding, project lists, the product catalog, sync and sharing, and the 3D viewer. The different Apple/Android modules sit behind one TS contract, for example `<RoomCaptureView onComplete>` and `<ARPlacementView room placements onChange>`. These are implemented in Swift (RoomPlan + RealityKit) and Kotlin (ARCore + SceneView) as Expo modules, which SDK 56 inline modules make cheap to keep inside the app repo. Treat the capture and AR screens as native code whatever framework is chosen.
- **Dev builds are mandatory from day one.** That means EAS Build or local builds, and it affects onboarding for non-native developers.
- **Code sharing for the 3D view.** The in-app 3D/orbit view can share code with the web viewer, either through R3F native on expo-gl or by embedding the web R3F viewer as an Expo DOM component. react-native-filament gives higher native fidelity but is a separate code path.
- **ViroReact trade-offs.** It is the fastest route to JS-level cross-platform AR placement, with GLB on both platforms. But YoungVista would then follow ViroReact's supported Expo SDK (57 today), not the latest Expo. Its AR session is also separate from RoomPlan's ARSession, so aligning a scanned room with Viro's AR world needs extra work, such as a manual corner alignment.

### Gaps
- Expo SDK 58's minimum iOS and Android versions aren't stated in the changelog, and I didn't verify them elsewhere.
- I didn't capture SDK 57's exact release date. It existed by late August 2026, according to the SDK 56 note.
- I didn't research EAS Build pricing.
- ReactVision Platform pricing (VPS, cloud anchors, co-location) isn't published in the README.
- I found no benchmark comparing R3F on expo-gl with react-native-filament or a DOM-component WebView for room-scale scenes.

---

## 2. Fully native (Swift: ARKit/RoomPlan/RealityKit + Kotlin: ARCore/SceneView/Filament; Jetpack XR relevance)

### Takeaway
Native gives the best capture and AR quality and first-class RoomPlan features, for example sharing RoomPlan's ARSession with the AR placement view on iOS 17+. The cost is two complete app codebases plus a separate web viewer. RealityKit only loads USD or Reality files, not glTF, so the iOS side needs USDZ versions of every product. On Android, SceneView (Apache-2.0, Stable on Android) is the maintained ARCore + Filament layer; Sceneform is archived. Jetpack XR is headset-first and not needed for a phone app.

### Cited Findings
- **RoomPlan** (iOS/iPadOS 16+) "uses a device's sensors, trained ML models, and RealityKit's rendering capabilities". It identifies walls, windows, openings and doors, plus furniture and appliances. It "outputs a scan as parametric data" and also provides "various Universal Scene Description (USD) formats". You can use the system `RoomCaptureView` (built-in coaching overlays and instructions) or drive `RoomCaptureSession` yourself for custom UI. — [RoomPlan](https://developer.apple.com/documentation/roomplan) [V]
- `RoomCaptureSession.isSupported` "is `true` if the device contains a LiDAR Scanner; otherwise, `false`." — [isSupported](https://developer.apple.com/documentation/roomplan/roomcapturesession/issupported) [V]
- **iOS 17 additions to RoomPlan:**
  - `RoomCaptureSession.init(arSession:)` and `stop(pauseARSession:)`, so the app can supply and keep its own ARKit session.
  - `CapturedStructure` and `StructureBuilder` for merging multiple rooms.
  - `CapturedRoom.Section` room-type labels (kitchen, dining room, living room).
  - `export(to:metadataURL:modelProvider:exportOptions:)` with a `ModelProvider` that swaps detected objects for chosen 3D models. — [init(arSession:)](https://developer.apple.com/documentation/roomplan/roomcapturesession/init(arsession:)); [stop(pauseARSession:)](https://developer.apple.com/documentation/roomplan/roomcapturesession/stop(pausearsession:)); [CapturedStructure](https://developer.apple.com/documentation/roomplan/capturedstructure); [StructureBuilder](https://developer.apple.com/documentation/roomplan/structurebuilder); [CapturedRoom.Section](https://developer.apple.com/documentation/roomplan/capturedroom/section); [export(…modelProvider…)](https://developer.apple.com/documentation/roomplan/capturedroom/export(to:metadataurl:modelprovider:exportoptions:)) [V]
- **No public RoomPlan API changes since iOS 17.** This is absence of evidence only:
  - A forum thread asking about RoomPlan changes in iOS 26 got no substantive answer.
  - A June 2026 community reply: "I haven't seen any updates to roomplan in the versions 27".
  - At the WWDC26 ARKit Q&A, Apple said: "We cannot comment on future plans … As for detecting custom objects, iOS 27 now supports ML-based object tracking." — [Forum 788885](https://developer.apple.com/forums/thread/788885); [Forum 829418](https://developer.apple.com/forums/thread/829418); [Forum 831707](https://developer.apple.com/forums/thread/831707) [V]
- **RealityKit file formats:** "RealityKit supports loading entities from USD (`.usd`, `.usda`, `.usdc`, `.usdz`) and Reality (`.reality`) files" (the async `Entity(contentsOf:)` API is iOS 18+). glTF isn't listed. SceneView's README (Nov 2026): "On Apple, RealityKit reads no glTF". GLB has to be converted to USDZ. — [Entity init(contentsOf:withName:)](https://developer.apple.com/documentation/realitykit/entity/init(contentsof:withname:)); [SceneView README](https://github.com/sceneview/sceneview) [V]
- **RealityView** (SwiftUI RealityKit container) is available on iOS 18+. — [RealityView](https://developer.apple.com/documentation/realitykit/realityview) [V]
- **SceneKit is "soft-deprecated"** (WWDC25): "SceneKit is unlikely to gain new capabilities … migrate to another native framework like RealityKit." That makes ARSCNView a legacy choice for a new app. — [Bringing your SceneKit projects to RealityKit](https://developer.apple.com/documentation/realitykit/bringing-your-scenekit-projects-to-realitykit) [V]
- **LiDAR-only ARKit features:** scene reconstruction (a polygonal mesh, iOS 13.4+) "requires a device with a LiDAR Scanner", and `sceneDepth` is "only on LiDAR-capable devices". — [supportsSceneReconstruction](https://developer.apple.com/documentation/arkit/arworldtrackingconfiguration/supportsscenereconstruction(_:)); [sceneDepth](https://developer.apple.com/documentation/arkit/arconfiguration/framesemantics-swift.struct/scenedepth) [V]
- **Runtime glTF loading on Apple (third-party):**
  - GLTFKit2: MIT; 235 stars; push 2026-06-10. It loads glTF 2.0 and bridges to SceneKit, Model I/O and QuickLook. RealityKit isn't a listed target. — [GLTFKit2](https://github.com/warrenm/GLTFKit2) [V]
  - SwiftGLTF: BSD-3; 52 stars. It converts glTF to RealityKit entities, but is reportedly described by its author as unfinished/hobby-grade with partial glTF coverage. — [SwiftGLTF](https://github.com/schwa/SwiftGLTF) [S, search extract]
- **Android rendering stack:**
  - Google's Sceneform is archived (last push July 2020), and SceneView's own Sceneform fork is archived too (2024).
  - **SceneView Android** (Compose + Filament) offers ARCore plane detection and rendering, per-frame hit tests against planes or depth, `depthMode`, Anchor/Cloud/Geospatial anchor nodes, and `AutoPlacementScene`.
  - It loads glTF/GLB directly.
  - Requirements: `minSdk` 24, compile SDK 37, AGP 9.4+, Kotlin 2.4, JVM 21. — [SceneView](https://github.com/sceneview/sceneview); [google-ar/sceneform-android-sdk (archived)](https://github.com/google-ar/sceneform-android-sdk); [sceneview/sceneform-android (archived)](https://github.com/sceneview/sceneform-android) [V]
  - **Filament** (Google; Apache-2.0; 20.7k stars; active) is the renderer under SceneView and react-native-filament. — [google/filament](https://github.com/google/filament) [V]
- **ARCore SDK:**
  - 1.57.0 (2026-10-16) only changed sample build tooling.
  - 1.56.0 (2026-09-04) moved targetSdk to 37 and added `AcquireDepthImageMeters` / `AcquireRawDepthImageMeters` (depth in metres as floats).
  - 1.54.0 (Apr 2026) added `ArCoreNativeInterop`. — [ARCore SDK releases](https://github.com/google-ar/arcore-android-sdk/releases) [V]
- **Jetpack XR:** ARCore for Jetpack XR, SceneCore and the XR Runtime moved to beta on August 18, 2026. ARCore for Jetpack XR can run on supported phones through Google Play Services for AR, but phones lose locally persistent anchors, face tracking and eye tracking. The testing pointers name Galaxy XR and the Android XR Emulator. — [Run ARCore for Jetpack XR apps on mobile devices](https://developer.android.com/develop/xr/jetpack-xr-sdk/arcore/mobile); [Android Developers Blog, Aug 2026](https://android-developers.googleblog.com/2026/08/jetpack-xr-sdk-core-libraries-beta.html) [V\*]

### Inferences
- **Native quality advantages.** The iOS path can be RoomPlan (`RoomCaptureView` coaching) → hand the same ARSession (via `init(arSession:)`) to a RealityKit view → place products immediately in the scanned room's coordinate frame. No re-alignment is needed in that first session. I haven't verified this end to end, but the APIs exist on iOS 17+.
- **Effort.** Fully native means two complete apps (Swift and Kotlin) plus a web viewer, so three UI codebases. Expo plus native modules means one app with about 2–3 native screens per platform plus a web viewer. For a demo-stage startup the hybrid roughly halves UI work and keeps native-quality capture and AR. This is a judgement, not measured.
- **Choose fully native** only if the team is already Swift/Kotlin-strong, or if AR/scan screens will dominate the app's surface area.
- **Product format on iOS.** RealityKit can't read GLB, so every product needs a USDZ (pre-converted offline) or a third-party loader. GLTFKit2 targets SceneKit, which is soft-deprecated, so pre-converting the catalog is the low-risk choice.
- **Jetpack XR** is aimed at Android XR headsets. For phones, the classic ARCore SDK plus SceneView is the practical stack in 2026.

### Gaps
- I didn't verify the quality or stability of SceneView's iOS (RealityKit) alpha.
- I didn't confirm whether RealityKit's UIKit `ARView` has any deprecation status on iOS 26/27.
- I didn't verify cross-session relocalization (ARKit world-map persistence, ARCore Cloud Anchors) against current docs. That matters for reopening AR in a scanned room on another day.

---

## 3. Unity with AR Foundation

### Takeaway
Unity gives one C# codebase for ARKit and ARCore, plus a web build. It doesn't solve YoungVista's hard problems:
- AR Foundation meshing works on ARKit (LiDAR) but not ARCore.
- RoomPlan still needs a native plugin.
- Unity-as-a-Library on mobile is full-screen-only and keeps 80–180 MB of memory resident.
- Pro seats cost $2,310/yr since Jan 2026.

It's poor value for a demo unless the team already knows Unity.

### Cited Findings
- **AR Foundation 6.2.1:** session, device tracking, plane detection and anchors are supported by all seven providers. Meshing is supported by 5 of 7. — [AR Foundation 6.2 manual](https://docs.unity3d.com/Packages/com.unity.xr.arfoundation@6.2/manual/index.html) [V, table partially extracted]
- **Google ARCore XR Plug-in 6.2:**
  - Supports camera, occlusion, point clouds, environment probes, ray casts, anchors, image tracking, face tracking and plane detection.
  - "not supported by ARCore 1.48": meshing, bounding-box detection, object tracking, body tracking, participants.
  - Requires Unity 6 (6000.0). — [ARCore XR Plug-in](https://docs.unity3d.com/Packages/com.unity.xr.arcore@6.2/manual/index.html) [V]
- **Apple ARKit XR Plug-in 6.2:** supports meshing, occlusion, participants, body tracking, environment probes, ray casts, anchors, plane detection and more. It requires Xcode 26.0+ and Unity 6+. — [ARKit XR Plug-in](https://docs.unity3d.com/Packages/com.unity.xr.arkit@6.2/manual/index.html) [V]
- **RoomPlan in Unity:** it isn't part of AR Foundation. A third-party "RoomPlan for Unity Kit" asset exists on the Asset Store. — [Unity Asset Store: RoomPlan for Unity Kit](https://assetstore.unity.com/packages/tools/utilities/roomplan-for-unity-kit-255058) [S]
- **Unity as a Library (Unity 6.6 docs):**
  - Supported on Android, iOS and Windows/UWP.
  - "You can't load or integrate more than one instance of the Unity runtime."
  - On Android/iOS, "Unity supports only full-screen rendering."
  - An unloaded runtime "retains memory (between 80 and 180 MB)".
  - On iOS, after `Application.Quit`, "you can't reload Unity again in the same app session".
  - Plug-ins may need adapting. — [Unity as a Library](https://docs.unity.com/en-us/engine/current/manual/platform-specific/cross-platform-features/unityasa-library) [V]
- **Embedding wrappers:**
  - `@azesmway/react-native-unity`: MIT; 392 stars; 112 open; v1.1.1 (2026-08-07); about 1.5k downloads/week.
  - `flutter-unity-view-widget`: BSD-3-Clause; 2.3k stars; 272 open; last release Feb 2024 (push July 2026).
  - Unity's own `uaal-example` is active (push Oct 2026). — [react-native-unity](https://github.com/azesmway/react-native-unity); [flutter-unity-view-widget](https://github.com/juicycleff/flutter-unity-view-widget); [Unity uaal-example](https://github.com/Unity-Technologies/uaal-example) [V]
- **Pricing:**
  - From January 12, 2026, Pro and Enterprise rose 5%: Pro is $2,310 per seat per year prepaid (was $2,200) or $210/month.
  - Personal stays free under $200,000 in annual revenue or funding.
  - Companies above $25M revenue need Enterprise. — [Unity pricing updates](https://unity.com/products/pricing-updates) [V\*]; [CG Channel, Nov 10, 2025](https://www.cgchannel.com/?p=171673) [S]
- **Web export:**
  - Unity 6.6's official docs list WebGPU limitations: no async compute, no synchronous GPU readback, and some texture formats or extensions missing on Safari and Firefox. — [Unity 6.6 WebGPU limitations](https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/develop/graphics/web-gpu/limitations) [V]
  - Secondary coverage says WebGPU is "no longer experimental" and fully supported from Unity 6.6 (Sept 2026), while web builds still default to WebGL 2. — [AlternativeTo news, Sept 2026](https://alternativeto.net/news/2026/9/unity-6-6-adds-webgpu-build-analysis-and-coreclr-prep/); [Cinevva, Sept 1, 2026](https://app.cinevva.com/news/2026-09-01-unity-6-6-webgpu-production) [S]
- **App size:** I found no authoritative IPA/APK size figures. A React Native + Unity talk page flags larger bundles as a drawback. — [GitNation](https://gitnation.com/contents/integrating-unity-with-react-native-for-enhanced-app-development) [S]

### Inferences
- **The Android gap stays.** Unity doesn't fix Android capture: AR Foundation gives no ARCore meshing, and there's no structured room API.
- **Full-screen-only embedding.** Unity screens can't sit inline with React Native UI, so teams usually end up building the whole app in Unity. That's weaker for ordinary app UX (auth, lists, sharing).
- **Heavy web viewer.** A Unity web build is a heavy share-link viewer compared with three.js.
- **When Unity makes sense:** the team is already Unity-skilled, or the roadmap is game-like (physics, rich interactions, headsets).

### Gaps
- I didn't find measured binary sizes for Unity 6 iOS/Android AR builds.
- I didn't retrieve Unity's own release note confirming WebGPU's "supported" status, or its support matrix for mobile web browsers.

---

## 4. Flutter AR plugin ecosystem (brief)

### Takeaway
Flutter's cross-platform AR plugins are unmaintained. Only an iOS-only ARKit plugin and some RoomPlan launchers are active, and SceneView's Flutter binding is alpha. Flutter would need as much custom platform code as Expo, with no code reuse for a React/three.js web viewer.

### Cited Findings
- **ar_flutter_plugin** (ARKit + ARCore): MIT; 353 stars; 123 open; last release v0.7.3 (Nov 2022); last push Aug 2024. — [CariusLars/ar_flutter_plugin](https://github.com/CariusLars/ar_flutter_plugin) [V]
- **arcore_flutter_plugin:** MIT; 449 stars; 152 open; last push Mar 2024; no releases. — [giandifra/arcore_flutter_plugin](https://github.com/giandifra/arcore_flutter_plugin) [V]
- **arkit_flutter_plugin** (iOS only): MIT; 842 stars; v1.5.0 (2026-06-15). — [olexale/arkit_flutter_plugin](https://github.com/olexale/arkit_flutter_plugin) [V]
- **RoomPlan wrappers on pub.dev:** `flutter_roomplan` lists a LiDAR scanner as a requirement, and `roomplan_launcher` wraps Apple's native scanner. — [flutter_roomplan](https://pub.dev/documentation/flutter_roomplan/latest/); [roomplan_launcher](https://pub.dev/documentation/roomplan_launcher/latest) [S]
- SceneView's Flutter binding is "Alpha". — [SceneView](https://github.com/sceneview/sceneview) [V]

### Inferences
- I see no advantage over Expo for YoungVista. TypeScript/React shares the most with a React-based web viewer.

### Gaps
- I didn't pull maintenance stats for `flutter_roomplan` / `roomplan_launcher`.

---

## 5. Android: no RoomPlan equivalent — what ARCore offers and the realistic capture approach

### Takeaway
I found no first-party RoomPlan equivalent from Google. ARCore gives building blocks:
- motion tracking, plane detection and hit tests;
- Depth and Raw Depth with per-pixel confidence, on more than 88% of active devices (May 2026);
- depth in metres since 1.56.

Its Scene Semantics is outdoor-only, and it has no meshing or room-layout API. For a demo, the realistic Android capture is **guided corner/wall tapping on ARCore planes and depth hit tests**, producing the same parametric room JSON as RoomPlan. Depth-based meshing and video-to-cloud reconstruction are later add-ons.

### Cited Findings
- **The gap is acknowledged.** A user-filed ARCore GitHub feature request notes that ARCore offers plane detection and the Depth API but no indoor-scanning API that outputs a structured room layout. — [arcore-android-sdk issue #1772](https://github.com/google-ar/arcore-android-sdk/issues/1772) [S, undated]
- **Depth API:**
  - "uses a depth-from-motion algorithm"; when a ToF sensor is present it is fused in automatically.
  - "Valid depth data are only available after the user has started moving their device around."
  - Range is "0 to 65 meters", with best accuracy "half a meter to about five meters".
  - Uses: occlusion, physics, and depth hit tests that "work even on non-planar and low-texture areas".
  - No meshing or reconstruction API is described. — [ARCore Depth](https://developers.google.com/ar/develop/depth) [V]
- **Raw Depth:**
  - Gives "very accurate depth estimate for some, but not all, pixels" plus a confidence image (0–255).
  - Listed use cases are "3D reconstruction", "measurement" and "shape detection".
  - It "does not require a supported hardware depth sensor" and costs about half the compute of full depth.
  - "Surfaces with no texture usually yield a confidence of zero". — [ARCore Raw Depth (Java)](https://developers.google.com/ar/develop/java/depth/raw-depth) [V]
- **Device coverage:** "As of May 2026, over 88% of active devices support the Depth API." The supported-devices list marks each device "Supports Depth API". Examples include Pixel 2 and later, Galaxy S21/S25 Ultra and Galaxy A52/A54/A56; the original Pixel and Galaxy A51/A71 lack it. — [ARCore supported devices](https://developers.google.com/ar/devices) [V]
- **Depth in metres:** ARCore 1.56 (Sept 2026) added depth images in metres as floats. — [ARCore releases](https://github.com/google-ar/arcore-android-sdk/releases) [V]
- **Scene Semantics** labels are outdoor classes (sky, building, tree, road, sidewalk, vehicle, person …). The developer guide restricts the feature to outdoor scenes, and the reference warns that indoor results may be unreliable. — [Scene Semantics](https://developers.google.com/ar/develop/scene-semantics); [Config.SemanticMode reference](https://developers.google.com/ar/reference/java/com/google/ar/core/Config.SemanticMode) [V\*]
- **No meshing through Unity:** the ARCore XR Plug-in lists meshing as "not supported by ARCore 1.48". — [Unity ARCore XR Plug-in](https://docs.unity3d.com/Packages/com.unity.xr.arcore@6.2/manual/index.html) [V]
- **SceneView Android** exposes depth hit-testing, a depth mesh and `depthMode`. Google's ARCore Depth Lab sample (Apache-2.0; 874 stars; push May 2026) demonstrates depth interactions. — [SceneView](https://github.com/sceneview/sceneview); [googlesamples/arcore-depth-lab](https://github.com/googlesamples/arcore-depth-lab) [V]
- **Commercial precedents** (details are another researcher's scope):
  - magicplan's help centre says Android lacks the LiDAR its Auto-Scan needs and points Android users to manual room tools.
  - Plotlay Scan (Play Store, Oct 2026 listing) uses ARCore corner-tapping on capable phones and typed or traced entry elsewhere.
  - AR Floor Plan 3D ties autoscan to ToF-equipped phones. — [magicplan help](https://help.magicplan.app/scan-a-room-with-the-camera-of-your-mobile-device-android); [Plotlay Scan](https://play.google.com/store/apps/details?id=io.plotlay.scan); [APKMirror: AR Floor Plan 3D](https://www.apkmirror.com/?p=13098410) [S]

### Inferences
Realistic Android capture options, ranked for a demo:
1. **Guided capture (recommended for the demo).** ARCore detects the floor plane. The user taps floor corners (or wall bases), sets the ceiling height, then marks doors and windows on wall segments. The app outputs a floor polygon, walls, openings and height in the same JSON schema as RoomPlan-derived data.
   - It works on every ARCore device and is cheap to build. Depth hit tests help on low-texture floors where supported.
   - The same flow can serve non-LiDAR iPhones (ARKit plane detection works on all ARKit devices), giving one shared fallback UX.
   - Risks are tracking drift on large rooms and the need for good coaching UX for non-technical users. RoomPlan provides that coaching built in; on Android YoungVista must design it.
2. **Depth-based meshing.** Fuse Raw Depth plus confidence into a TSDF/mesh on device (custom C++/Kotlin), then fit wall planes. This takes several engineer-months, works only on depth-capable devices, and struggles with white walls, which return low confidence. It's a post-demo R&D track.
3. **Video/photos → cloud reconstruction** (photogrammetry, NeRF, Gaussian splats). This gives the best visual fidelity but minutes of latency and GPU cost. It doesn't produce editable walls and isn't aligned for live AR. It's a possible "premium visual" layer later; tools are covered by other researchers.
- **Product framing.** The demo can treat the iOS LiDAR path as the "wow" path and Android/non-LiDAR as "guided" capture, without promising parity.

### Gaps
- I didn't check the current status of ARCore Instant Placement.
- I didn't verify any third-party Android room-scanning SDK; that is another researcher's scope.
- I have no measured accuracy for corner tapping versus LiDAR; that is the Measure-app researcher's scope.

---

## 6. Web viewer stack (three.js / R3F / Babylon.js / model-viewer / PlayCanvas; Gaussian splats; WebXR; Quick Look and Scene Viewer)

### Takeaway
For the "see my room on a big screen" viewer, three.js via React Three Fiber is the default choice: MIT, the largest ecosystem, native GLB support, the same React mental model as the app, and code sharing with the in-app viewer. Babylon.js is the strongest alternative, with built-in splats and WebXR. Web AR is asymmetric:
- **Android Chrome** supports WebXR `immersive-ar`, with hit test, anchors, depth and lighting shipped and plane detection in developer trial.
- **iOS Safari** still has no WebXR through iOS 27.2. iPhone web AR means AR Quick Look with USDZ, which `<model-viewer>` can generate on the fly from GLB.

### Cited Findings
- **Engine maintenance (2026-11-05):**
  - three.js: MIT; 117.6k stars; r187 (2026-10-30); about 33.8M npm downloads/week.
  - R3F: MIT; 33.5k stars; 9.8.2.
  - Babylon.js: Apache-2.0; 26.3k stars; 9.34.0 (2026-11-05).
  - `<model-viewer>`: Apache-2.0; 8.3k stars; v4.4.0 (2026-10-09); about 830k/week; peer `three ^0.183`.
  - PlayCanvas engine: MIT; 17.2k stars; v2.23.3 (2026-10-15).

  All of these licenses allow commercial use. — [three.js](https://github.com/mrdoob/three.js); [R3F](https://github.com/pmndrs/react-three-fiber); [Babylon.js](https://github.com/BabylonJS/Babylon.js); [model-viewer](https://github.com/google/model-viewer); [PlayCanvas engine](https://github.com/playcanvas/engine) [V]
- **Gaussian splats on the web:**
  - Spark (three.js-based; MIT; 3.9k stars; v2.4.0 2026-10-20; about 419k npm/week) is active.
  - PlayCanvas SuperSplat editor (MIT; 10.6k stars; v3.7.0 2026-10-26) is active.
  - mkkellogg GaussianSplats3D (MIT; 2.9k stars) is slowing: last release Jan 2025, last push Oct 2025.
  - Babylon.js's loader reads PLY, .splat, compressed PLY, Niantic SPZ and SOG/SOGS. — [Spark](https://github.com/sparkjsdev/spark); [SuperSplat](https://github.com/playcanvas/supersplat); [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D); [Babylon.js Gaussian Splatting loader](https://doc.babylonjs.com/features/featuresDeepDive/importers/gaussianSplatting) [V/V\*]
- **KHR_gaussian_splatting:** Khronos announced the glTF extension as a release candidate (Feb 2026). One third-party site reports ratification via a Sept 3, 2026 registry commit; I found no Khronos announcement confirming it. — [Khronos news](https://www.khronos.org/news/archives/khronos-announces-gltf-gaussian-splatting-extension); [radiancefields.com](https://radiancefields.com/platforms/the-khronos-group) [V\*/S, conflicting status]
- **WebXR browser support:**
  - Safari on iOS is "Not supported" for every listed version through 27.2.
  - Safari macOS: "Disabled by default".
  - Chrome for Android: "Partial support".
  - Samsung Internet 12–31: partial.
  - Firefox: disabled by default. — [caniuse: WebXR](https://caniuse.com/webxr) [V]
- **Android web AR:** "WebXR uses ARCore to power AR experiences on the Google Chrome browser on Android devices". Chrome status: Hit Test, Anchors, Depth API and Lighting Estimation are "Shipped"; Plane Detection is "Developer Trial". — [ARCore: WebXR](https://developers.google.com/ar/develop/webxr); [ARCore vs WebXR comparison](https://developers.google.com/ar/develop/webxr/arcore-comparison) [V]
- **AR Quick Look from a web page:** wrap a `.usdz` link: `<a rel="ar" href="/assets/models/my-model.usdz"><img …></a>`. Content must be `.usdz` or `.reality`. When tapped in Safari, "iOS presents your scene in an AR Quick Look view". iOS 12+. Custom action and Apple Pay banners are configured through URL fragments. — [Apple: Previewing a Model with AR Quick Look](https://developer.apple.com/documentation/arkit/previewing-a-model-with-ar-quick-look); [Apple: AR Quick Look](https://developer.apple.com/augmented-reality/quick-look/) [V]
- **Scene Viewer (Android) from a web page:**
  - Launch with `intent://arvr.google.com/scene-viewer/1.0?file=<GLB URL>&mode=ar_preferred#Intent;…;S.browser_fallback_url=…;end;`.
  - Accepts glTF 2.0/GLB over HTTPS, where 1 unit = 1 m.
  - Needs an "ARCore supported device running Android 7.0 Nougat (API Level 24) or later".
  - Recommended limits: ≤10 MB (warning above 10 MB, error above 15 MB), ≤100k triangles, ≤10 materials, textures ≤2048².
  - "Scene Viewer plays only the first animation". — [Scene Viewer](https://developers.google.com/ar/develop/scene-viewer) [V]
- **`<model-viewer>` AR behaviour:**
  - `ar-modes` defaults to "webxr scene-viewer quick-look".
  - "Including quick-look here without an ios-src (our default) will generate a USDZ on the fly", although "USDZ generation is not perfect, for instance animations are not yet supported".
  - `ar-placement` is `floor|wall`; `ar-scale` is `auto|fixed`. — [model-viewer docs data (repo)](https://github.com/google/model-viewer/blob/master/packages/modelviewer.dev/data/docs.json) [V]
- **@react-three/xr** (WebXR for R3F): 2.6k stars; npm 6.6.32 (2026-10-13). The license field reads "SEE LICENSE IN LICENSE" and GitHub reports NOASSERTION, so review the LICENSE file before commercial use. — [pmndrs/xr](https://github.com/pmndrs/xr); [npm @react-three/xr](https://www.npmjs.com/package/@react-three/xr) [V]
- **iOS-capable WebAR without WebXR:**
  - 8th Wall's hosted platform is winding down. Editing and login ended Feb 28, 2026, hosted projects run until Feb 28, 2027, and the engine modules were open-sourced (MIT). — [8th Wall forum](https://forum.8thwall.com/t/important-changes-to-8th-wall-business/8578); [Road to VR](https://roadtovr.com/niantic-webar-platform-8th-wall-open-source/) [V\*/S]
  - Needle Engine (commercial) claims "mobile AR to iOS WebXR"; GitHub does not detect its license. — [needle-engine-support](https://github.com/needle-tools/needle-engine-support) [V, description only]
  - ViroReact v3's web renderer says it does AR on the web with its own visual-inertial tracker. — [Viro releases](https://github.com/ReactVision/viro/releases) [V, vendor claim]

### Inferences
- **Recommended web stack:** React (Next.js or Vite) + R3F + drei + three.js. It renders the room procedurally from JSON and loads product GLBs. Orbit, pan and zoom come from drei's camera controls, which also allow dragging products on the floor plane. If splats are added later, Spark is the three.js-native choice.
- **Where `<model-viewer>` fits:** it's ideal for single-product "View in your room" buttons (Quick Look/Scene Viewer handoff) and product pages. It isn't built for composed, editable room scenes.
- **Babylon.js** is the best alternative if the team prefers a batteries-included engine. Its React Native story doesn't support Expo, which reduces the code-sharing benefit.
- **The website should not promise AR of the whole room on iPhone:**
  - WebXR is unavailable in iOS Safari.
  - Quick Look could show a composed USDZ of the room, but at an arbitrary placement, not aligned to the real room.
  - So the website is a non-AR 3D viewer. Live room-aligned AR stays in the native app. Android Chrome could offer WebXR as a bonus.

### Gaps
- I didn't verify WebGPU availability in iOS Safari 26/27 (only WebXR).
- I have no mobile-web performance benchmarks for room scenes.
- I didn't verify PlayCanvas's WebXR or splat feature set beyond repo stats.

---

## 7. Formats and data model (RoomPlan outputs, USDZ↔GLB, RealityKit and glTF, shared room schema)

### Takeaway
Make a platform-neutral, versioned **room JSON** the source of truth: metres, floor polygon, walls, openings, detected objects and transforms. Derive it from RoomPlan's Codable `CapturedRoom` on LiDAR iPhones and from guided capture elsewhere, then render it **procedurally** in every engine (three.js, RealityKit, SceneView/Filament). Then all three surfaces show the same geometry without depending on USDZ↔GLB conversion quality. Keep **GLB as the master product format** and pre-generate **USDZ** for iOS, because RealityKit and Quick Look don't read glTF. Store RoomPlan's USDZ (parametric or mesh) and the raw `CapturedRoom` JSON as optional attachments.

### Cited Findings
- **`CapturedRoom` contents** (iOS 16+): `walls`, `doors`, `windows`, `openings`, `floors`, `objects`, `sections`, `story`, `identifier`, `version`. It supports `encode(to:)` / `init(from:)`, so it is Codable and can be serialised to JSON. — [CapturedRoom](https://developer.apple.com/documentation/roomplan/capturedroom) [V]
- **Categories:**
  - Surfaces: `floor`, `door(isOpen:)`, `opening`, `wall`, `window`.
  - Objects: bathtub, bed, chair, dishwasher, fireplace, oven, refrigerator, sink, sofa, stairs, storage, stove, table, television, toilet, washerDryer.
  - Both have confidence levels and (iOS 17) attributes. — [Surface.Category](https://developer.apple.com/documentation/roomplan/capturedroom/surface/category-swift.enum); [Object.Category](https://developer.apple.com/documentation/roomplan/capturedroom/object/category-swift.enum) [V]
- **USD export options:**
  - `.parametric`: "stores elements as unit-sized cubes versus polygonal units. The scale of each element determines whether it appears as a plane or a box."
  - `.mesh`: stores "elements as polygonal units".
  - `.model`: replaces categorised objects with "3D models that you choose in advance" via `ModelProvider` (iOS 17).
  - The output format is USD. "Before iOS 17.4, the first letter of the USD file name needs to be a character other than a number." — [USDExportOptions](https://developer.apple.com/documentation/roomplan/capturedroom/usdexportoptions); [parametric](https://developer.apple.com/documentation/roomplan/capturedroom/usdexportoptions/parametric); [mesh](https://developer.apple.com/documentation/roomplan/capturedroom/usdexportoptions/mesh); [model](https://developer.apple.com/documentation/roomplan/capturedroom/usdexportoptions/model); [export(to:metadataURL:modelProvider:exportOptions:)](https://developer.apple.com/documentation/roomplan/capturedroom/export(to:metadataurl:modelprovider:exportoptions:)) [V]
- **Interop quirks:**
  - Kodeco's tutorial says an export without custom options defaults to mesh. (expo-roomplan defaults to Parametric.)
  - A developer reported that Blender failed to import RoomPlan parametric USDA output but imported mesh output. — [Kodeco RoomPlan tutorial](https://www.kodeco.com/41003944-augmented-reality-s-roomplan-for-ios-getting-started?page=2); [Apple forum 724014](https://developer.apple.com/forums/thread/724014); [expo-roomplan README](https://github.com/fordat/expo-roomplan) [S/V]
- **RealityKit and glTF:** RealityKit loads only USD and `.reality` files. Neither Apple's docs nor SceneView's README (Nov 2026) show any native glTF support on iOS 26/27. — [Entity init(contentsOf:withName:)](https://developer.apple.com/documentation/realitykit/entity/init(contentsof:withname:)); [SceneView README](https://github.com/sceneview/sceneview) [V]
- **Conversion tools:**
  - **GLB → USDZ:**
    - `<model-viewer>` generates USDZ on the fly from GLB for Quick Look. — [model-viewer docs data](https://github.com/google/model-viewer/blob/master/packages/modelviewer.dev/data/docs.json) [V]
    - three.js ships a `USDZExporter`. — [three.js USDZExporter](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/exporters/USDZExporter.js) [V, file exists; capabilities not tested]
    - guc converts glTF → USD with MaterialX. Apache-2.0; 154 stars; v0.5 Nov 2025. — [pablode/guc](https://github.com/pablode/guc) [V]
    - Apple's Reality Converter is a free macOS GUI that converts OBJ, glTF and USD → USDZ. — [CG Channel, Jan 2020 (dated)](https://www.cgchannel.com/2020/01/get-free-usdz-file-converter-and-viewer-reality-converter/) [S, possibly outdated]
    - Google's `usd_from_gltf` is archived (last push 2023). — [google/usd_from_gltf](https://github.com/google/usd_from_gltf) [V]
  - **USDZ → GLB:**
    - Adobe's USD-Fileformat-plugins include gltf, fbx, obj, ply, stl, spz and sbsar plugins, release 2026.07. The repo ships `LICENSE-2.0.txt` (Apache 2.0); GitHub's API doesn't auto-detect it. — [adobe/USD-Fileformat-plugins](https://github.com/adobe/USD-Fileformat-plugins) [V]
    - three.js has a `USDLoader` (the `USDZLoader` file is a 266-byte stub). — [three.js USDLoader](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/USDLoader.js) [V, file exists; RoomPlan compatibility untested]
    - `usdz-to-glb` (pure JS, MIT) has 7 stars and was released Mar 2026, so it is immature. — [Uzithei/usdz-to-glb](https://github.com/Uzithei/usdz-to-glb) [V]
- **Observed RoomPlan file sizes** in public GitHub repos (sizes from the GitHub API; RoomPlan origin inferred from file names and repos, not verified):
  - `CapturedRoom.json` 302 KB + `CapturedRoom.usdz` 128 KB.
  - Four `room_N.usdz` at 10–32 KB.
  - A `room.json` of 43 KB.
  - `newFullScan.usdz` 225 KB and `fullMesh.usdz` 1.25 MB. — [BaidetskyiYurii/RoomPlanDemo](https://github.com/BaidetskyiYurii/RoomPlanDemo); [pressanykeyplease/RoomPlan-Sandbox](https://github.com/pressanykeyplease/RoomPlan-Sandbox); [zuls/roomplan](https://github.com/zuls/roomplan); [Hlebushkek/RoomPlaner](https://github.com/Hlebushkek/RoomPlaner) [V sizes]
- **Product model budget:** Scene Viewer's guidance (≤10 MB, ≤100k triangles, ≤2048² textures, 1 unit = 1 m) is a sensible per-product GLB budget. — [Scene Viewer](https://developers.google.com/ar/develop/scene-viewer) [V]

### Inferences
- **Proposed canonical schema** (`room.v1.json`):
  - Units in metres, right-handed and Y-up (the glTF convention). The origin is a floor corner; the X axis runs along the first wall.
  - `floor.polygon[]`.
  - `walls[] {id, start, end, height, thickness}`.
  - `openings[] {wallId, kind: door|window|opening, offsetAlongWall, width, height, sillHeight, isOpen}`.
  - `objects[] {category, transform, dimensions, confidence}` (RoomPlan only).
  - `source {platform, method: roomplan|guided|depth, device, appVersion, roomplanVersion}`.
  - `attachments {capturedRoomJson?, roomplanUsdz?, meshGlb?, thumbnail}`.
  - A separate `design.v1.json` holds `placements[] {productId, productVersion, position, yaw, variant}`, with scale fixed at 1:1 for real-size furniture.
- **Convert on device.** On iOS, convert RoomPlan's `simd_float4x4` transforms and wall dimensions into this frame. Keep the original Codable JSON for future reprocessing; RoomPlan's own data `version` may change.
- **Procedural rendering.** Extruding walls with opening cut-outs and a floor polygon is about 200–400 lines per engine (three.js, RealityKit, Filament/SceneView; a rough estimate). It avoids USD parsing on Android and the web and guarantees identical geometry. An optional `meshGlb`, converted server-side from RoomPlan mesh USDZ (Blender or the Adobe plugins), can add fidelity later.
- **Products.** Author or buy GLB (glTF 2.0, PBR, KTX2/Draco or Meshopt compression as needed). Run an offline pipeline that emits GLB for Android and the web and USDZ for iOS RealityKit and Quick Look, and store both URLs in the product record. ViroReact or a glTF loader on iOS would remove the USDZ need, at the cost of the trade-offs noted in sections 1–2.

### Gaps
- I found no authoritative Apple figure for typical RoomPlan export sizes; the GitHub samples are of unverified provenance.
- I didn't test three.js `USDLoader` against RoomPlan USDZ.
- I couldn't confirm Reality Converter's current GLB support (sources are from 2020).

---

## 8. Backend for cross-device viewing (auth, storage of scans and placements, share links)

### Takeaway
Parametric scans and designs are small: tens to a few hundred KB of JSON plus about 10–130 KB of USDZ per room. Any BaaS works. **Supabase** (Postgres + Auth + Storage + row-level security) fits a demo: the free tier caps files at 50 MB, and Pro is $25/mo with 100 GB of storage. **Firebase** now needs the paid Blaze plan for Cloud Storage. Add **Cloudflare R2** (S3-compatible, zero egress) once product GLBs, meshes or splats grow.

### Cited Findings
- **Supabase:**

  | | Free ($0) | Pro (from $25/month) |
  |---|---|---|
  | File storage | 1 GB | 100 GB, then $0.0213/GB |
  | Max upload | 50 MB | 500 GB |
  | Egress | 5 GB | 250 GB, then $0.09/GB |
  | Database | 500 MB | 8 GB |
  | Auth MAU | 50,000 | 100,000 |

  Pro also includes Smart CDN and image transformations, and its spend caps are on by default. — [Supabase pricing](https://supabase.com/pricing); [Supabase Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits) [V]
- **Firebase:** projects that hadn't yet provisioned a default bucket have needed the Blaze plan since Oct 30, 2024. Since Feb 3, 2026, Blaze is required to keep access to the default bucket. — [Firebase Cloud Storage FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024) [V\*]
- **Cloudflare R2:** $0.015/GB-month. Class A operations cost $4.50/M and Class B $0.36/M, and egress is free. The free tier is 10 GB-month, 1M Class A and 10M Class B (page updated Oct 30, 2026). — [R2 pricing](https://developers.cloudflare.com/r2/pricing/) [V]

### Inferences
- **Tables and buckets:**
  - Tables: `profiles`, `rooms` (JSON in `jsonb`, schema version, thumbnail), `room_assets` (storage keys for USDZ, mesh GLB and raw JSON), `designs` (placements `jsonb`), `products` (GLB/USDZ URLs, dimensions, variants) and `share_links` (random slug, design id, expires_at, revoked).
  - Buckets: `scans` (private) and `catalog` (public or CDN).
- **Share links.** The web viewer route `/s/{slug}` fetches JSON and short-lived signed asset URLs. Room scans reveal a home's interior, so treat them as sensitive personal data: private by default, unguessable slugs, revocable links, and RLS policies. Privacy law (e.g., GDPR, Korean PIPA) wasn't researched here.
- **Sync and size.** For the demo, use last-write-wins with `updated_at` and offline-first capture (save locally, upload when online). A parametric room plus design is under 1 MB, so the Supabase Free tier is enough. Textured meshes or splats (tens to hundreds of MB; another researcher's scope) would exceed the 50 MB free-tier file cap, so move to Pro or R2 at that point.

### Gaps
- I didn't research auth specifics (Sign in with Apple / Google requirements) or data-residency choices.
- I didn't verify typical textured-scan sizes here.

---

## 9. Device support matrix

### Takeaway
RoomPlan reaches only LiDAR devices: Pro iPhones from the 12 Pro onward, and iPad Pros. Every non-Pro iPhone, including the iPhone 17 and iPhone Air, needs the same non-LiDAR guided capture as Android. AR placement itself (ARKit or ARCore world tracking with planes) works on essentially every current phone.

### Cited Findings
- **RoomPlan:** iOS/iPadOS 16+ (multi-room and `init(arSession:)` need iOS 17+). `isSupported` is true only with a LiDAR Scanner. — [RoomPlan](https://developer.apple.com/documentation/roomplan); [isSupported](https://developer.apple.com/documentation/roomplan/roomcapturesession/issupported); [CapturedStructure](https://developer.apple.com/documentation/roomplan/capturedstructure) [V]
- **LiDAR iPhones:** the scanner arrived with the iPhone 12 Pro in 2020 and has been limited to Pro models since. The iPhone 17 Pro and Pro Max have it; the iPhone 17 and iPhone Air don't. — [Engadget](https://engadget.com/2250700/iphone-lidar-sensor-purpose-how-to-use); [MacRumors iPhone 17 buyer's guide](https://www.macrumors.com/guide/iphone-17-air-pro-or-pro-max/) [S]
- **ARKit:** "ARKit requires iOS 11.0 or later and an iOS device with an A9 or later processor". Scene reconstruction (mesh) and scene depth need LiDAR. — [Apple: Verifying device support](https://developer.apple.com/documentation/arkit/verifying-device-support-and-user-permission); [supportsSceneReconstruction](https://developer.apple.com/documentation/arkit/arworldtrackingconfiguration/supportsscenereconstruction(_:)) [V]
- **iOS 27 devices:** iOS 27 kept iOS 26's device list: iPhone 11 / iPhone SE (2nd gen) and later. — [AppleInsider, June 8, 2026](https://appleinsider.com/articles/26/06/08/ios-27-keeps-iphone-11-and-newer-compatibility) [S]
- **ARCore:**
  - Devices must pass Google certification (camera, motion sensors, CPU).
  - Android 7.0+ unless a device row says otherwise.
  - "AR Required" apps need minSdk ≥24; "AR Optional" apps need ≥19.
  - Over 88% of active devices support the Depth API (May 2026). — [ARCore supported devices](https://developers.google.com/ar/devices) [V]
- **Library and web minimums:**
  - Scene Viewer needs an ARCore device on Android 7.0+.
  - WebXR AR runs in Chrome on Android ARCore devices; iOS Safari has no WebXR.
  - Babylon React Native needs iOS 16+; ViroReact targets iOS 15.1; SceneView Android has `minSdk` 24.
  - R3F's docs say to test on physical iOS 16+ devices. — [Scene Viewer](https://developers.google.com/ar/develop/scene-viewer); [caniuse WebXR](https://caniuse.com/webxr); [BabylonReactNative](https://github.com/BabylonJS/BabylonReactNative); [ViroReact](https://github.com/ReactVision/viro); [SceneView](https://github.com/sceneview/sceneview); [R3F docs](https://r3f.docs.pmnd.rs/getting-started/installation) [V]

| Capability | iOS (LiDAR: 12 Pro → 17 Pro; iPad Pro 2020+) | iOS (non-LiDAR: iPhone 11+, SE 2/3, all non-Pro incl. 17/Air) | Android (ARCore certified, Android 7+) | Web |
|---|---|---|---|---|
| Automatic structured room scan | RoomPlan (iOS 16+; multi-room iOS 17+) | No; guided capture via ARKit planes | No first-party API; guided capture via ARCore planes and depth hit tests | No |
| AR placement (planes, raycast) | ARKit / RealityKit | ARKit / RealityKit | ARCore / SceneView | Android Chrome WebXR; iOS Quick Look (single USDZ, not room-aligned) |
| Depth / occlusion | LiDAR depth + mesh | Monocular only (e.g., ViroReact's model) | Depth API on >88% of active devices | Chrome Depth API shipped |
| 3D orbit viewer | Yes | Yes | Yes | three.js / R3F |

### Inferences
- Feature-detect at runtime: `RoomCaptureSession.isSupported` on iOS, and `ArCoreApk.checkAvailability` / `Session.isDepthModeSupported` on Android. Route users to the LiDAR fast path or to guided capture.
- In B2C, a large share of iPhone users likely have no LiDAR. I found no installed-base statistic, so the guided path isn't optional for a consumer launch, though it can be for a demo.

### Gaps
- I found no source for the share of active iPhones that have LiDAR.
- LiDAR on the iPhone 18 Pro (reported Sept 2026 launch) isn't confirmed from Apple in this research.
- ARCore's total certified-device count isn't published on its list page.

---

## 10. Recommended approach, runner-up, risks, and what would change the recommendation

### Takeaway
**Recommended:** an Expo (SDK 58, TypeScript) app shell built with development builds (EAS). Thin custom Expo native modules handle capture and AR: RoomPlan + RealityKit on iOS, and ARCore + SceneView with guided capture on Android. One canonical parametric room JSON feeds a shared three.js/R3F renderer, used for both the in-app 3D view and the web viewer. Supabase is the backend.

**Runner-up:** the same Expo shell and data model, but with **ViroReact** for AR placement on both platforms and **expo-roomplan** for iOS capture. It trades native control and Expo-version freedom for faster JS-only AR development.

### Cited Findings
- **Native modules are supported, and dev builds are required.** Expo's Modules API wraps native UIView/Android View classes as React Native components, and Expo Go can't load custom native modules. — [Expo native view tutorial](https://docs.expo.dev/modules/native-view-tutorial/); [Expo SDK 58 changelog](https://expo.dev/changelog/sdk-58) [V]
- **Inline modules** keep native code inside the app repo (SDK 56+). — [Expo SDK 56 changelog](https://expo.dev/changelog/sdk-56) [V\*]
- **A starting point for RoomPlan:** expo-roomplan (MIT, active, single maintainer) already wraps RoomPlan with USDZ+JSON export. — [expo-roomplan](https://github.com/fordat/expo-roomplan) [V]
- **ARSession sharing:** RoomPlan on iOS 17+ accepts an app-supplied ARSession and can stop without pausing it. — [init(arSession:)](https://developer.apple.com/documentation/roomplan/roomcapturesession/init(arsession:)); [stop(pauseARSession:)](https://developer.apple.com/documentation/roomplan/roomcapturesession/stop(pausearsession:)) [V]
- **No glTF on iOS natively:** RealityKit loads only USD/Reality, and SceneKit is soft-deprecated. — [RealityKit Entity loading](https://developer.apple.com/documentation/realitykit/entity/init(contentsof:withname:)); [SceneKit soft-deprecation](https://developer.apple.com/documentation/realitykit/bringing-your-scenekit-projects-to-realitykit) [V]
- **SceneView on Android** is stable, Apache-2.0 and actively released (v4.66.0, Nov 4, 2026). — [SceneView](https://github.com/sceneview/sceneview) [V]
- **ViroReact's constraints:** it pins Expo 57 / React Native 0.86 in v3.0.3 and has open Android 16 Samsung camera and tracking issues. — [npm @reactvision/react-viro](https://www.npmjs.com/package/@reactvision/react-viro); [#568](https://github.com/ReactVision/viro/issues/568); [#499](https://github.com/ReactVision/viro/issues/499) [V]
- **R3F runs on native** via expo-gl. — [R3F installation docs](https://r3f.docs.pmnd.rs/getting-started/installation) [V]
- **iOS Safari has no WebXR;** Android Chrome WebXR AR ships hit test, anchors and depth. — [caniuse WebXR](https://caniuse.com/webxr); [ARCore vs WebXR](https://developers.google.com/ar/develop/webxr/arcore-comparison) [V]
- **Unity's constraints:** Unity-as-a-Library is full-screen-only on mobile, and ARCore meshing isn't available through AR Foundation. — [Unity as a Library](https://docs.unity.com/en-us/engine/current/manual/platform-specific/cross-platform-features/unityasa-library); [ARCore XR Plug-in](https://docs.unity3d.com/Packages/com.unity.xr.arcore@6.2/manual/index.html) [V]
- **No Google equivalent of RoomPlan:** ARCore Depth/Raw Depth exist, and Scene Semantics is outdoor-only. — [ARCore Depth](https://developers.google.com/ar/develop/depth); [Raw Depth](https://developers.google.com/ar/develop/java/depth/raw-depth); [Scene Semantics](https://developers.google.com/ar/develop/scene-semantics) [V/V\*]

### Inferences

**Recommended stack (all inference; built on the cited findings above)**
1. **App shell:**
   - Expo SDK 58 with TypeScript, Expo Router, EAS Build/Submit and development builds (no Expo Go).
   - TanStack Query (or similar) for sync.
   - Cross-platform screens: auth, onboarding, project list, catalog browser, design editor UI, sharing and settings.
2. **iOS native module "YVCapture"** (Swift, an Expo inline module):
   - Wrap `RoomCaptureView`/`RoomCaptureSession` (fork or borrow from expo-roomplan, which is MIT).
   - Run with an app-owned ARSession (iOS 17+).
   - On finish, emit the canonical room JSON, plus the raw `CapturedRoom` JSON and a parametric USDZ as attachments.
   - Non-LiDAR iPhones get the guided capture screen built on ARKit plane raycasts.
3. **iOS native module "YVAR":**
   - A RealityKit `ARView` (UIKit, wrapped in `ExpoView`) or a `RealityView` (SwiftUI, iOS 18+, hosted in a container view).
   - It builds the room procedurally from the JSON (it can be invisible, with occlusion/shadows only, or a translucent overlay) and places product USDZs.
   - Gestures: tap to place, drag along the floor, rotate around Y.
   - In the scan session, reuse the ARSession for automatic alignment. In later sessions, align by having the user tap two known floor corners. Persistent relocalization is a later enhancement.
4. **Android native module "YVCapture/YVAR"** (Kotlin):
   - ARCore + SceneView (Compose `ARScene` hosted in a `ComposeView` inside `ExpoView`).
   - Guided capture: detect the floor, tap corners or wall bases, set height, add openings. Use depth hit tests when supported. The output uses the same JSON.
   - AR placement loads product GLBs directly.
5. **3D model view (in app):**
   - The same R3F scene component as the web viewer. Run it natively through `@react-three/fiber/native` + expo-gl for best integration, or embed it as an Expo DOM component for maximum code reuse, accepting WebView overhead.
   - Start with the DOM component for the demo if performance is acceptable on mid-range Android; otherwise move to R3F native.
6. **Web viewer:** Next.js/Vite + R3F + drei. It is read-only (orbit, zoom, toggle products) at a share-link URL. Optionally add `<model-viewer>` "View in AR" for individual products (Quick Look on iOS, Scene Viewer/WebXR on Android).
7. **Assets:** a GLB master per product (≤10 MB, ≤100k triangles), with USDZ generated offline (guc, Reality Converter or Blender) and validated on device. Store both in the catalog.
8. **Backend:** Supabase (Auth with Apple and Google sign-in, Postgres `jsonb` for room and design, Storage for attachments and the catalog, RLS, share-link table). Move bulky assets to R2 later.
9. **Demo scoping:** the iPhone Pro LiDAR path is the hero flow. Android and non-LiDAR iPhones use guided capture. The web viewer is a read-only share link.

**Why this beats the alternatives for YoungVista:**
- **vs. fully native:** one UI codebase plus small native islands, and the web viewer and in-app viewer share code. Native quality is kept where it matters (scan and AR).
- **vs. ViroReact-centric (runner-up):** no dependence on one vendor's Expo-version cadence. Direct access to RoomPlan's ARSession, so there is no re-alignment step right after scanning. Native ARCore/SceneView avoids the Viro-specific Android camera and tracking issues currently open. The cost is more Swift/Kotlin code (rough estimate: a few thousand lines across both platforms).
- **vs. Unity:** no license cost, no full-screen-only embedding, a lighter app, and a lighter web viewer. Unity also doesn't solve Android room capture.
- **vs. Flutter:** a dead cross-platform AR plugin ecosystem and no React code sharing with the web.

**Runner-up details (Expo + ViroReact + expo-roomplan):**
- Build AR placement once in JSX with `ViroARSceneNavigator`, `ViroARPlane` and `Viro3DObject` loading GLB on both platforms. This avoids the USDZ pipeline for in-app AR.
- Use expo-roomplan for LiDAR capture. Android and non-LiDAR devices still need a custom guided-capture module, or a guided flow built on Viro plane detection and hit tests.
- Pin Expo to SDK 57 until ViroReact 3.1 supports SDK 58.
- Choose this if the team has no Swift/Kotlin capacity and wants the fastest demo.

**Key risks and mitigations:**
1. **LiDAR coverage.** RoomPlan works only on Pro iPhones and iPad Pros, so most consumers fall back to guided capture. Mitigation: design guided capture as a first-class flow and allow manual editing of the floor plan in the 3D/2D editor.
2. **Android capture quality.** Corner tapping suffers ARCore drift, and depth is noisy on white walls. Device fragmentation is real (see the Samsung/Android 16 camera issues in Viro's tracker). Mitigation: test a matrix of 5–8 popular Android devices early, and add coaching UX, measurement correction (snap to right angles, editable wall lengths) and a manual-entry fallback.
3. **Thin wrapper ecosystem.** expo-roomplan has one maintainer and 39 stars; SceneView's React Native and iOS bindings are alpha; ViroReact pins Expo versions. Mitigation: own the native modules in-repo (fork MIT code), keep the native surface small, and keep a stable TS interface.
4. **Format divergence.** RealityKit needs USDZ while Android and the web use GLB, and conversion fidelity varies (Blender failed on parametric USDA). Mitigation: render rooms procedurally from JSON, and run an automated GLB→USDZ pipeline with visual QA per product.
5. **Expo upgrade cadence.** Roughly three SDKs per year, with breaking changes and occasional regressions (e.g., the SDK 56 Hermes memory issue). Mitigation: pin the SDK for the demo and upgrade deliberately. Expo Go store delays are irrelevant if you use dev builds.
6. **Re-alignment across sessions and devices.** AR placement on another day needs relocalization. Mitigation: a two-corner manual alignment for the demo; investigate ARKit world maps or ARCore Cloud Anchors later. The latter wasn't verified in this research.
7. **Web AR on iPhone.** Safari has no WebXR, so whole-room AR on iPhone isn't possible from the website. Mitigation: position the website as a 3D viewer and keep AR in the app; offer product-level Quick Look.
8. **Privacy.** Home interior scans are sensitive. Mitigation: private-by-default storage, RLS, revocable share links.

**What would change the recommendation:**
- **The team is Unity-proficient** or the roadmap is game-like or headset-first → Unity 6 + AR Foundation (RoomPlan via plugin), accepting license, size and full-screen trade-offs.
- **The team is native-strong and the app's surface is mostly scan and AR** → fully native Swift + Kotlin, with a separate web viewer.
- **ViroReact ships Expo SDK 58+ support quickly and its Android camera/tracking issues close** → ViroReact becomes co-equal, especially if the USDZ pipeline proves costly.
- **Google ships a structured room-capture API, or a third-party Android SDK proves solid** (another researcher's scope) → swap the Android guided-capture module for it behind the same TS interface.
- **Apple adds WebXR `immersive-ar` to iOS Safari, or adds glTF loading to RealityKit** → web-based AR, or GLB-only assets, become viable.
- **The demo can be iOS-only** → the fastest path is SwiftUI + RoomPlan + RealityKit alone, with the Expo shell deferred. That makes the later Android work a port, though.

### Gaps
- I have no measured engineering-effort data for these options; the line-count and effort statements are estimates.
- I didn't prototype a RoomPlan → RealityKit ARSession handoff inside an Expo module, or hosting SceneView Compose inside `ExpoView`. Both are plausible, but this research didn't verify them.
- I haven't researched EAS Build costs, App Store review considerations for camera/LiDAR apps, or privacy-law requirements.
