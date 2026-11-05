# YoungVista

Scan a room with your phone, see it in 3D and through the camera (AR), and place real-size
furniture in it. A website shows the same rooms on a bigger screen.

- Plan: [build.md](build.md). Decisions: [decisions.md](decisions.md). Rules for contributors: [CLAUDE.md](CLAUDE.md).
- Website: https://young-vista.web.app (Firebase project `young-vista`).

## Repo layout

| Path | What it is |
|---|---|
| `apps/web` | Website: Vite, React, React Router, Tailwind, shadcn/ui, react-icons, Firebase, React Three Fiber (3D view). |
| `apps/mobile` | Phone app: Expo, Expo Router, ViroReact (AR), react-native-reusables, react-icons, Firebase. |
| `packages/core` | Shared TypeScript with no platform code: room model, scan geometry, 3D room meshes, furniture placement, room editing, AR line-up, share and picture documents, units, catalog types. |
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

The website has the rooms list; a room page with the plan (furniture footprints: hover or tap for
names), a 3D view, the furniture list with model credits, the room's pictures and its private
link; and the public shared page at `/s/{shareId}`, which works without signing in. three.js loads
only when the 3D view opens (its own chunk, see `vite.config.ts`).

To try the website without touching the live project, run it against the Firebase emulators
(Java 21+). Put any values in the six `VITE_FIREBASE_*` settings in
`apps/web/.env.emulators.local` (project id `demo-young-vista`), add
`VITE_FIREBASE_EMULATOR_HOST=127.0.0.1`, then:

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

A development build of an Expo app (Expo Go cannot load AR). Needs a Mac with Xcode for the
iPhone, the Android SDK and JDK 17 for Android, and the phone on a cable with developer mode
(iPhone) or USB debugging (Android) on.

```sh
npm install                               # from the repo root
cp .secrets/mobile.env apps/mobile/.env   # or fill in apps/mobile/.env.example
cd apps/mobile
npx expo run:ios --device                 # iPhone: build, sign, install, start Metro
npx expo run:android                      # Android phone
```

- The first run creates `ios/` and `android/` from `app.config.ts` (both gitignored). After
  changing `app.config.ts`, `.env`'s `GOOGLE_IOS_URL_SCHEME` or a package with native code, run
  `npx expo prebuild --clean` before building again.
- Later, with the app already installed: `npx expo start --dev-client`, then open the app.
- Scanning needs a real phone. The iOS Simulator cannot run the app at all: ViroReact ships
  iPhone-only binaries and builds simulator apps for Intel, which iOS 27 simulators refuse. An
  Android emulator (arm64 image) runs everything except AR.
- iPhone builds are signed by Young Corporation of America (team `L276BBUKFM`, or set
  `APPLE_TEAM_ID`). Android debug builds use the React Native debug keystore, whose SHA-1 is
  registered in Firebase for Google sign-in; add the SHA-1 of any other signing key there too.
- `npm run typecheck`, `npm test` and `npx eslint apps/mobile` cover the app. Device checks:
  [docs/device-checklist.md](docs/device-checklist.md).

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
