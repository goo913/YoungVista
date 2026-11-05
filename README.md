# YoungVista

Scan a room with your phone, see it in 3D and through the camera (AR), and place real-size
furniture in it. A website shows the same rooms on a bigger screen.

- Plan: [build.md](build.md). Decisions: [decisions.md](decisions.md). Rules for contributors: [CLAUDE.md](CLAUDE.md).
- Website: https://young-vista.web.app (Firebase project `young-vista`).

## Repo layout

| Path | What it is |
|---|---|
| `apps/web` | Website: Vite, React, React Router, Tailwind, shadcn/ui, react-icons, Firebase. |
| `apps/mobile` | Phone app (Expo and ViroReact). Being added next. |
| `packages/core` | Shared TypeScript with no platform code: room model, scan geometry, measurements, units, catalog types. |
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

Other scripts, all from the repo root:

| Script | Does |
|---|---|
| `npm run typecheck` | TypeScript in every workspace and the rules tests |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run build:web` | Production build into `apps/web/dist` |
| `npm run test:rules` | Firestore and Storage rules against the emulators (needs Java 21+) |

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
