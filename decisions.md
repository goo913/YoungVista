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
| Scanning (demo) | Works on normal iPhones and Android phones: the user turns around the room, the app finds the floor and walls by itself, and the user taps twice at the bottom of any wall it misses. Corners are worked out automatically. |
| Scanning (later) | Apple RoomPlan automatic scanning on iPhone Pro (12 Pro or newer). Not in the demo: the team has no Pro to test with. |
| Doors | A doorway closes the room. Wide openings ask "include this area?". |
| Existing furniture | Not captured in the demo; the scan records walls, doors and windows. |
| 3D view | Clean "dollhouse" model: walls, floor, doors, windows. |
| Furniture | About 40 free true-scale models (Amazon Berkeley Objects CC BY 4.0, Poly Haven CC0, Khronos samples), starting with 15. Always real size. Snap to walls, no overlaps, colour options. GLB files served from Firebase Hosting. Credits screen. |
| AR | Placements line up right after the scan; "tap two corners" to line up again later. |
| Sizes | Feet and inches (metres optional), labelled approximate; "check with a tape" for tight gaps. |
| Final picture | v1: an exact, sharp image of the 3D room with the furniture, from any angle. No AI. AI comes after the demo and is always called just "AI". |
| Website | View rooms in 3D; private, revocable share links. No editing yet. |
| Accounts | Firebase Auth: email/password and Google sign-in, on the app and the website. |
| Backend | Firebase project `young-vista`: Firestore (`nam5`), Storage (`us-central1`), Hosting (https://young-vista.web.app). |
| Deploys | Every push to `main` deploys the website and rules through GitHub Actions, using keyless Google Cloud auth. |
| App IDs | iOS bundle ID and Android package `com.youngcorporation.youngvista`, like the company's other app (`com.youngcorporation.ycaclock`). |
| Publishing | The owner puts builds on phones by following `docs/publishing/`: the iPhone 15 over the cable first, then TestFlight for the team. Claude Code never uploads or submits. Google Play waits until there is an Android test phone. |
| Tech | Expo SDK 57 + ViroReact (AR and 3D on both platforms) + react-native-reusables UI on mobile; Vite + React + shadcn/ui + React Three Fiber on the web; shared TypeScript geometry in `packages/core`. Icons from react-icons everywhere. |
| Tech fallback | If ViroReact misbehaves on the team's phones (it has known camera bugs on some Samsung phones running Android 16), replace the AR screens with small native modules: Swift (ARKit, RealityKit) and Kotlin (ARCore, SceneView). |
| Later | iPhone Pro auto-scan, AI picture, business model, real product catalog, multi-room scans, photo-real rooms, web editing, fitted kitchens, Matterport/BIM exports. |
