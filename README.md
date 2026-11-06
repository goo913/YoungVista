# YoungVista

Scan a room with your phone, see it in 3D and through the camera (AR), and place real-size
furniture in it. A website shows the same rooms on a bigger screen.

- Plan: [build.md](build.md). Decisions: [decisions.md](decisions.md). Rules for contributors: [CLAUDE.md](CLAUDE.md).
- Website: https://young-vista.web.app (Firebase project `young-vista`).

## What it does

All four builds of the plan are in (the team demo):

1. **Scan** a room on a normal iPhone or Android phone: the app finds the floor and you mark each
   wall once; tips show before the first scan. Floor plan, wall lengths and area; saved to your
   account.
2. **Furnish** it in 3D with true-size furniture (about 40 free models): move, turn, snap to
   walls, colours. Edit walls, doors and windows. Everything autosaves and works offline.
3. **See it in your room** through the camera (AR), or place furniture freely; open the room in 3D
   on the website and share a private, view-only link.
4. **Take a picture**: an exact picture of the 3D view from any angle, saved to Photos and to the
   room; it shows on the room page and in the website's gallery. Pictures taken offline upload
   later by themselves.

What it doesn't do yet: [docs/known-limits.md](docs/known-limits.md).

## Docs

| Doc | For |
|---|---|
| [docs/running-the-apps.md](docs/running-the-apps.md) | Putting the app on your iPhone or an Android phone, step by step; the development build. |
| [docs/device-checklist.md](docs/device-checklist.md) | What to check on real phones after each build. |
| [docs/known-limits.md](docs/known-limits.md) | What YoungVista does not do yet. |
| [docs/publishing/](docs/publishing/README.md) | TestFlight for the team (the owner uploads; Google Play comes later). |
| [docs/store/testflight-notes.md](docs/store/testflight-notes.md) | The "What to Test" text for each build. |

## Repo layout

| Path | What it is |
|---|---|
| `apps/web` | Website: Vite, React, React Router, Tailwind, shadcn/ui, react-icons, Firebase, React Three Fiber (3D view). |
| `apps/mobile` | Phone app: Expo, Expo Router, ViroReact (AR), react-native-reusables, react-icons, Firebase. |
| `apps/mobile/modules/scene-capture` | The app's own small native module: captures the 3D view for "Take picture" (Swift and Kotlin). |
| `packages/core` | Shared TypeScript with no platform code: room model, scan geometry, 3D room meshes, furniture placement and the design reducer, live sync and autosave, room editing, AR line-up, walking and flying through a room, share and picture documents, units, catalog types. |
| `firebase.json`, `.firebaserc` | Hosting, Firestore and Storage deploy settings. |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | Security rules and indexes, deployed by CI. |
| `firebase.emulators.json`, `tests/rules` | Emulator settings and tests for the security rules. |
| `.github/workflows/deploy.yml` | Checks and deploys on every push to `main`. |

npm workspaces, one lockfile at the root. Units are metres everywhere in code; the apps show feet
and inches by default.

## Run the website locally

Needs Node 24 (see `.nvmrc`) and npm 11.

```sh
npm install
cp apps/web/.env.example apps/web/.env.local   # then fill in the values (see below)
npm run dev:web                                 # http://localhost:5173
```

The website has the rooms list (rename or delete a room from its "…" menu); a room page where
the owner furnishes the room on the plan or in 3D by the phone's rules (core's design reducer,
saved to `rooms/{id}.design` and kept in step with the phone live); a 3D view that goes round the
room, flies and walks through it like the team's closet designer, full screen; the furniture list
with model credits; the room's pictures (download, delete, or save one from the 3D view) and its
private link; and the public shared page at `/s/{shareId}`, which works without signing in.
three.js loads only when the 3D view opens (its own chunk, see `vite.config.ts`).

To try the website without touching the live project, run it against the Firebase emulators
(Java 21+). Put any values in the six `VITE_FIREBASE_*` settings in
`apps/web/.env.emulators.local` (project id `demo-young-vista`; storage bucket
`demo-young-vista.appspot.com`, the phone's, so the gallery shows the phone's pictures), add
`VITE_FIREBASE_EMULATOR_HOST=127.0.0.1` (and `VITE_FIREBASE_EMULATOR_*_PORT` when the emulators
run on other ports, see `apps/web/.env.example`), then:

```sh
npx firebase-tools@15.34.1 emulators:start --config firebase.emulators.json --only auth,firestore,storage --project demo-young-vista
npm run dev -w @youngvista/web -- --mode emulators   # second terminal; sign up to make a user
```

The emulators start empty and forget everything when stopped.

Other scripts, all from the repo root:

| Script | Does |
|---|---|
| `npm run typecheck` | TypeScript in every workspace and the rules tests |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run build:web` | Production build into `apps/web/dist` |
| `npm run test:rules` | Firestore and Storage rules against the emulators (needs Java 21+) |

## Phone app

An Expo app with ViroReact (AR), so it needs a real phone on a cable and a Mac with Xcode (the
Android SDK and JDK 17 for Android).

```sh
npm install                               # from the repo root
cp .secrets/mobile.env apps/mobile/.env   # or fill in apps/mobile/.env.example
npm run iphone                            # Release build on the iPhone plugged in
npm run android                           # the same on an Android phone
npm run publish:iphone                    # upload to TestFlight (the owner runs it)
```

- Step by step, for anyone: [docs/running-the-apps.md](docs/running-the-apps.md) (phones by
  cable, and the development build with Metro) and [docs/publishing/](docs/publishing/README.md)
  (TestFlight; Google Play comes later). Claude Code prepares these; it never uploads.
- `npm run iphone` and `npm run android` make `ios/` and `android/` from `app.config.ts` (both
  gitignored) again only when the native set-up changed. The version and build number are in
  `apps/mobile/release.json`.
- The iOS Simulator cannot run the app at all: ViroReact ships iPhone-only binaries and builds
  simulator apps for Intel, which iOS 27 simulators refuse. An Android emulator (arm64 image) runs
  everything except AR.
- iPhone builds are signed by Young Corporation of America (team `L276BBUKFM`, or set
  `APPLE_TEAM_ID`). Android builds use the React Native debug keystore, whose SHA-1 is registered
  in Firebase for Google sign-in; add the SHA-1 of any other signing key there too.
- `npm run typecheck`, `npm test` and `npx eslint apps/mobile` cover the app. Device checks:
  [docs/device-checklist.md](docs/device-checklist.md).
- To try the app without touching the live project, run a development build against the Firebase
  emulators (above): start Metro with
  `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=10.0.2.2 npx expo start --dev-client` in `apps/mobile`
  (10.0.2.2 is the computer as seen from the Android emulator; a phone on Wi-Fi uses the
  computer's address). The app then uses the demo project `demo-young-vista` and none of the live
  settings, Settings says so, and the rooms list offers "Add a sample room" (an L-shaped room,
  since there is no AR to scan with). Release builds ignore the setting. On an Android emulator,
  the 3D view also needs `adb shell settings put global angle_gl_driver_selection_pkgs
  com.youngcorporation.youngvista` and `... angle_gl_driver_selection_values angle`: ViroReact
  asks for an sRGB screen buffer, which the emulator's own GL driver cannot make. "Take picture"
  works there too: the picture lands in the emulator's gallery, the Storage emulator and the
  website's gallery.
- "Take picture" uses the app's own native module, `apps/mobile/modules/scene-capture`
  (ViroReact has a screenshot only for its AR view): `GLKView.snapshot` on iPhone, which is what
  ViroKit's own screenshot does, and `TextureView.getBitmap()` on Android. Pictures are queued on
  the phone and uploaded to `users/{uid}/rooms/{roomId}/pictures/{id}.jpg` with a
  `rooms/{roomId}/pictures/{id}` record (`apps/mobile/lib/pictures.ts`).
- The app icon, Android adaptive icon and splash screen come from
  `apps/mobile/assets/brand/mark.svg`: after changing it, run
  `node apps/mobile/scripts/render-icons.mjs` and commit the PNGs.
- Development builds have no floating "Tools" button: open the developer menu by shaking the phone
  (Ctrl+M or ⌘M on an Android emulator).

## Settings and secrets

- The website reads its Firebase web settings from `VITE_FIREBASE_*` variables. Locally they come
  from `apps/web/.env.local`; in CI from the repository's GitHub Actions secrets of the same names.
- Only `.env.example` files are committed. `.env.local`, the `.secrets/` folder and the native
  Firebase files (`google-services.json`, `GoogleService-Info.plist`) are gitignored. Team members
  keep their own copies in `.secrets/` (for example `cp .secrets/web.env.local apps/web/.env.local`).
- Never commit keys, tokens or service-account files.

## Deploys

Every push to `main` runs `.github/workflows/deploy.yml`: install (website and core only),
type-check, lint, unit tests, rules tests, build, then deploy Hosting and the Firestore and Storage
rules with keyless Google Cloud auth (repository variables `GCP_WIF_PROVIDER` and `GCP_DEPLOY_SA`).

## Notes

- `@youngvista/core` is consumed as TypeScript source (its `exports` point at `src/index.ts`);
  Vite and Expo's Metro compile it. Firestore cannot store nested arrays, so save rooms with
  `roomToFirestore()` and read them with `roomFromFirestore()`.
- Add shadcn/ui components with `npx shadcn@4 add <name>` in `apps/web`, then switch any
  `lucide-react` icons to the same icons from `react-icons/lu` and remove `lucide-react` (lint
  blocks it).
- Catalog files under `/catalog/` are cached for a year (`catalog.json` for 5 minutes), so give a
  changed model a new file name.
