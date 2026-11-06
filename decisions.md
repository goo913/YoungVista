# YoungVista decisions

Decided 2026-11-05. The team asked Claude to make these calls; change any of them by saying so. How they get built: `build.md`.

## Team answers (2026-11-05)

- iPhone Pro to test with: **no**
- Demo needed: **in about 1 month**
- Who sees the demo first: **just the team**
- "Pretty final picture" in v1: **yes, an exact picture now, AI later**

## Team answers (2026-11-05, second round)

- Meeting notes and research: **in the repo, with names taken out**
- Apple account: **the company's team, Young Corporation of America**, set up like YCACLOCK
- Test phone: **the owner's iPhone 15**
- Accounts: **Firebase through the owner's Google account that owns `young-vista`; GitHub through `goo913` only**

## Decisions

| Area | Decision |
|---|---|
| Customer goal | See whether furniture looks right in their room, at real size. Fit checks are approximate. |
| Rooms | One room per scan. Afterwards, a top-down editor lets users drag corners and type wall lengths. |
| Scanning (demo) | Works on normal iPhones and Android phones: the app finds the floor, and the user turns around the room and marks each wall once (its bottom edge, or its top edge behind furniture), with two marks on the first wall. Rooms have square corners (rectangles, L and U shapes). Changed 2026-11-05 after the first iPhone 15 test: automatic wall detection failed on plain walls (and a bug placed detected walls twice as far away), so it is now a test switch only. Each scan writes a debug log to `scanLogs`. The second iPhone 15 scan closed but came out 1.5 m short on the window wall, because a bed hid its bottom edge and the mark landed in front of the bed. So the app now refuses a wall where the phone has already been, or that a furniture top reaches through, and asks for that wall's top edge. |
| Scanning (turn-around) | The goal: no marks. The user finds the floor, then turns in place (three landscape rings: down, level, up) while the app keeps posed 4:3 AR keyframes. A Cloud Run GPU job (MoGe-2 depth, MIT; scale anchored to the AR floor; square-cornered fit from floor lines, ceiling lines, wall points above furniture and free space) returns the walls as marks, and the phone builds the room with the same solver as marked walls. Walls the server is unsure of ask for one mark by hand; marked walls stay as the fallback. Research: `docs/research/room-capture-and-ai.md`. Not used: panorama layout networks and SpatialLM (no commercially usable weights), general AI chat models for distances (25–45% off), the 0.5× camera (ARKit cannot use it). |
| Panorama photos | A Camera-app panorama is not measured: its scale would rest on a guessed camera height (−9% to +15%), its vertical view misses most floor lines, and the missing 90° can hide a wall. The same turn inside the app is measured, and also makes the 360° pictures. |
| Real-picture tours | Each standing spot of a turn-around scan gives a 360° panorama, stitched on the server through the fitted room; the website and the app show it with the furniture drawn in at true size. |
| Doors | A doorway closes the room. Wide openings ask "include this area?". |
| Existing furniture | Not captured in the demo; the scan records walls, doors and windows. |
| 3D view | Clean "dollhouse" model: walls, floor, doors, windows. |
| Furniture | About 40 free true-scale models (Amazon Berkeley Objects CC BY 4.0, Poly Haven CC0, Khronos samples), starting with 15. Always real size. Snap to walls, no overlaps, colour options. GLB files served from Firebase Hosting. Credits screen. |
| AR | Placements line up right after the scan. Later, a saved room opens in 3D at once; in the camera view it lines up from two corner taps in either order (a mismatch is shown, never refused), can be dragged and turned by hand, or placed by hand without corners. |
| Sizes | Feet and inches (metres optional), labelled approximate; "check with a tape" for tight gaps. |
| Final picture | An exact, sharp image of the 3D room with the furniture, from any angle. AI images (always called just "AI"): a 3D-view image made photo-real, and a real photo of the room shown with the furniture, by Google's Nano Banana 2.1 on Vertex AI (billed to the `young-vista` project, no new account), called from a Cloud Function. The app asks before a home photo goes to AI. |
| Website | View and furnish rooms in 3D and on the plan (same rules and saved design as the phone, synced live); orbit, fly and walk (the closet project's controls) and full screen; rename and delete rooms and pictures; private, revocable share links. |
| Accounts | Firebase Auth: email/password and Google sign-in, on the app and the website. |
| Backend | Firebase project `young-vista`: Firestore (`nam5`), Storage (`us-central1`), Hosting (https://young-vista.web.app). |
| Deploys | Every push to `main` deploys the website, the Cloud Functions and the rules through GitHub Actions, using keyless Google Cloud auth. |
| App IDs | iOS bundle ID and Android package `com.youngcorporation.youngvista`, like the company's other app (`com.youngcorporation.ycaclock`). |
| Publishing | The owner puts builds on phones by following `docs/publishing/`: the iPhone 15 over the cable first, then TestFlight for the team. Claude Code never uploads or submits. Google Play waits until there is an Android test phone. |
| Tech | Expo SDK 57 + ViroReact (AR and 3D on both platforms) + react-native-reusables UI on mobile; Vite + React + shadcn/ui + React Three Fiber on the web; shared TypeScript geometry in `packages/core`. Icons from react-icons everywhere. |
| Tech fallback | If ViroReact misbehaves on the team's phones (it has known camera bugs on some Samsung phones running Android 16), replace the AR screens with small native modules: Swift (ARKit, RealityKit) and Kotlin (ARCore, SceneView). |
| Later | iPhone Pro auto-scan, AI picture, business model, real product catalog, multi-room scans, photo-real rooms, web editing, fitted kitchens, Matterport/BIM exports. |
