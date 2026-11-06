# YoungVista build plan

Four builds, done in order. Each one ends with something the team can try on a phone. Target: a team-only demo in about a month, on normal iPhones and Android phones (no iPhone Pro needed). The test phone is the owner's iPhone 15.

| Build | What you get |
|---|---|
| 1. Scan | Sign in, scan a room by turning around with the phone, see its floor plan, save it. The website shows your rooms. |
| 2. Furnish | See the room in 3D. Add real-size furniture, move it, turn it, snap it to walls. |
| 3. AR and web 3D | See the furniture in your real room through the camera. Open the room in 3D on the website and share a private link. |
| 4. Final picture | A clean, exact picture of the furnished room from any angle, plus polish. |

## How scanning works (no iPhone Pro)

1. Point the phone at the floor and move it slowly. The app finds the floor (never a bed or table top).
2. The first wall: aim the dot where it meets the floor and tap **Mark**, then further along the same wall and tap **Mark** again. This tells the app which way the walls run, so every corner comes out square.
3. Aim at the top of that wall, where it meets the ceiling, and tap **Mark**. That measures the ceiling height (or skip it: 8 ft).
4. Turn to each other wall and tap **Mark** once on its bottom edge, or on its top edge when furniture is in the way. Each wall appears in the camera view and on the live map as it is marked. The app refuses a wall where it knows a wall cannot be: where the phone has already been, behind the dot when it sits on a bed or desk top, or where a furniture top reaches through. It then asks for that wall's top edge (a bed hiding the window wall made the first real scan 1.5 m short).
5. When the walls go all the way around, the room closes by itself and shows its size. Optionally type one wall's tape-measured length to correct the scale, then review and save. Fix anything later by dragging a corner or typing a length.

The result is a clean model of the room (floor, walls, doors, windows), not a photo-real copy. In simulation, walls land within about 5 cm. Without LiDAR, a phone can't see plain walls reliably by itself, so walls are marked rather than detected; automatic detection stays a test switch until it is proven on phones. Every scan writes a log (`scanLogs`) for debugging. A photo-real scan on normal phones needs cloud processing and comes later; iPhone Pro automatic scanning (Apple RoomPlan) also comes later.

---

## Technical spec

### Stack

- **Monorepo:** npm workspaces. TypeScript strict everywhere.
- **apps/mobile:** Expo SDK 57 (React Native 0.86, the newest SDK that `@reactvision/react-viro` 3.x supports), Expo Router, development builds (Expo Go cannot load AR). `@reactvision/react-viro` for AR (ARKit and ARCore) and the in-app 3D view. UI: react-native-reusables (shadcn/ui for React Native) with NativeWind. Icons: react-icons, rendered natively through react-native-svg. Firebase JS SDK (Auth with AsyncStorage persistence, Firestore, Storage). Google sign-in: `@react-native-google-signin/google-signin`. Bundle ID and package name: `com.youngcorporation.youngvista`; iPhone builds are signed by the company's Apple team, Young Corporation of America.
- **apps/web:** Vite, React, TypeScript, React Router, Tailwind and shadcn/ui, react-icons, three.js through React Three Fiber and drei, Firebase JS SDK. Hosted on Firebase Hosting at https://young-vista.web.app.
- **packages/core:** shared TypeScript with no platform code: room model, scan geometry, placement math, units, catalog types. Vitest tests.
- **Firebase (`young-vista`):** Auth (email/password and Google), Firestore (`nam5`), Storage (`us-central1`), Hosting. Rules and indexes live in the repo.
- **CI/CD:** GitHub Actions on every push to `main`: install, type-check, test, build the website, deploy Hosting and the Firestore and Storage rules. Google Cloud auth is keyless (Workload Identity Federation): repository variables `GCP_WIF_PROVIDER` and `GCP_DEPLOY_SA`; web Firebase settings come from the `VITE_FIREBASE_*` repository secrets.
- **Getting the app onto phones:** the owner does it, following `docs/publishing/`: the owner's iPhone over the cable, then TestFlight for the team. Claude Code prepares the commands and the steps, and never uploads a build or submits anything.
- **Config and secrets:** each app reads Firebase settings from env (`EXPO_PUBLIC_FIREBASE_*`, `VITE_FIREBASE_*`) and commits only `.env.example`. Native Firebase files (`google-services.json`, `GoogleService-Info.plist`) stay out of git; the Expo config reads their paths from env, falling back to the gitignored `.secrets/` folder.

### Conventions

- Units: metres internally; show feet and inches by default with a metres switch.
- World: Y up, floor at y = 0, room outline on the XZ plane.
- Products: GLB, metres, origin at the centre of the footprint on the floor, front facing +Z. Always true size (no resizing).

### Data model

- `rooms/{roomId}`: `ownerId`, `name`, `createdAt`, `updatedAt`, `units`, `room` (`version`, `points` as `[x, z]` metres in order, `ceilingHeight`, `walls` with `openings` of type door, window or opening with `offset`, `width`, `height`, `sill`), `capture` (`method`, `platform`, `scaleFactor`), `design` (`items` with `id`, `productId`, `variant`, `x`, `z`, `rotationY`), `shareId`.
- `rooms/{roomId}/pictures/{pictureId}`: final picture metadata; the image file lives in Storage at `users/{uid}/rooms/{roomId}/pictures/{pictureId}.jpg`.
- `shares/{shareId}`: a snapshot of a room and its design for a private link. Anyone with the link can read it (the ID is long and random); the owner deletes it to revoke.
- Catalog: `catalog.json` plus `models/*.glb` and `thumbs/*`, served from Hosting under `/catalog/` so the app and the website load the same files.

### Build 1: app foundation and room scan

1. Monorepo, TypeScript, lint and format, Vitest for `packages/core`.
2. Firebase files: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`. Owners read and write their own rooms; shares are public-read.
3. Mobile app:
   - Sign up and sign in with email and password, Google sign-in, sign out, password reset.
   - Room list with an empty state.
   - Scan flow (ViroReact AR session): floor detection; automatic wall finding from vertical planes; "tap twice at the bottom of a wall" fallback; a live top-down mini-map; the room closes automatically when the walls go around (or the user taps Done); ceiling height (8 ft default); review screen with the plan and wall lengths; name and save to Firestore.
   - Coaching messages: move slowly, add light, aim at the wall.
   - A debug overlay that draws the raw detected planes, to check the wall maths on real phones.
4. `packages/core`: wall observations (from planes or taps) into a room outline: merge duplicate walls, order walls around the room, intersect neighbours into corners, optional square-corner snapping, validation (no self-crossing, minimum size); lengths, area, perimeter; feet-and-inches formatting. Unit tests.
5. Website: sign in (email, Google), room list, room page with an SVG floor plan and measurements.
6. CI/CD workflow as above.

Done when: core tests pass; mobile JavaScript bundles build for iOS and Android; the iOS simulator build and Android debug build compile; the website builds and is live at https://young-vista.web.app; a device checklist for scanning is written.

### Build 2: 3D room and furniture

1. Catalog pipeline (`scripts/catalog`): download, normalise (metres, floor origin, facing +Z, scaled to listed dimensions), optimise (textures 1024 px or less, mesh simplification, no compression extensions, for ViroReact compatibility), write GLB files, `catalog.json` (id, name, category, dimensions, placement type, colour variants, licence, credit, source) and thumbnails. Start with 15 models from the research starter set (Amazon Berkeley Objects CC BY 4.0, Poly Haven CC0, Khronos samples).
2. `packages/core`: room into 3D parts (floor, wall panels split around doors and windows, frames); placement maths (snap to a wall within 15 cm, stay inside the room, no overlaps using an oriented-box test, rotate in 15° steps); tests.
3. Mobile app: 3D view (orbit, zoom, top view); room editor (drag corners, type a wall length, add and move doors and windows, ceiling height); furniture picker (categories, thumbnails, dimensions); place, drag, rotate, delete, duplicate; colour variants where the model has them; autosave the design; credits screen.
4. Website: furniture footprints on the floor plan.

Done when: tests pass; builds compile; a scanned room can be furnished with 5 pieces, and the design survives an app restart and shows on the website.

### Build 3: camera view (AR) and website 3D

1. Mobile AR view: line up the saved room with the real one by tapping two room corners on the floor (right after a scan, reuse that session's alignment); furniture appears at its saved spots with soft shadows; a ghost wall outline toggle; move and rotate furniture in AR, saving back to the design; a "place freely" mode that needs no room.
2. Website 3D viewer (React Three Fiber): the same room geometry from `packages/core`, furniture models, orbit and zoom, top view, a furniture list with dimensions and credits; works on desktop and phone screens.
3. Sharing: create and revoke a private link; the shared page works without signing in.
4. Catalog grows to about 40 models covering the 19 categories in the research starter set.

Done when: tests pass; builds compile; the website is deployed; a shared link opens on another computer without signing in; an AR line-up checklist for devices is written.

### Build 4: final picture and polish

1. Final picture (no AI): in the 3D view, choose an angle and tap "Final picture"; the app hides the controls, uses soft light and shadows, captures at high resolution, saves to Photos and uploads to Storage; the picture appears in the room's gallery on the website. The website also offers "Download picture" at twice screen resolution.
2. Polish: three short tips before the first scan; clear coaching during the scan; loading, empty and error states everywhere; saves that survive a weak connection; app icon and splash screen; performance (cached models, polygon limits); accessibility labels.
3. Docs: README (how to run on a phone), device test checklist, known limits.

Done when: tests pass; builds compile; the website is deployed; the full demo runs: sign in, scan, furnish, AR, final picture, open on the website.

### After the demo

iPhone Pro automatic scanning (Apple RoomPlan), an AI-polished picture (always labelled "AI"), a real product catalog, curved walls, photo-real rooms.

### What the checks can and cannot prove

Builds are verified with tests, type checks and native compiles. Scanning and AR only run on real phones, so every build ends with a short device checklist for the team.
