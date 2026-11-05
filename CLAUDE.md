# YoungVista

A phone app (iPhone and Android) that scans a room, shows it in 3D and in the live camera (AR), and lets people place real-size furniture. A website shows the same rooms on a big screen.

- Build plan: `build.md` (4 builds). Decisions: `decisions.md`.
- Layout: `apps/mobile` (Expo + ViroReact AR), `apps/web` (Vite + React + shadcn/ui, Firebase Hosting), `packages/core` (shared room geometry and placement math), Firebase config and rules at the repo root.
- Firebase project: `young-vista` (Auth email/password + Google, Firestore, Storage, Hosting at https://young-vista.web.app).

## Strict rules

- **GitHub account:** only the work account `goo913`, never the personal one (`goochoi913`), in this repo and folder. The repo's own git config sets `user.name` to `goo913` and `user.email` to `goo.choi@takeoffprime.com`, and pushes use goo913's token through the repo's credential helper. Run `gh` commands as goo913.
- **Firebase and Google Cloud:** run `firebase` and `gcloud` commands as the owner's Google account that owns the `young-vista` project. That is a Google account; it has nothing to do with the GitHub rule above.
- **Publishing is the owner's job:** Claude Code never uploads a build or submits anything to Apple or Google. It prepares the commands and the step-by-step guides in `docs/publishing/`, and the owner runs them.
- **No PR needed until the owner says so.** Push to `main` directly and automatically.
- **AI naming (permanent rule):** the app never names the AI model or provider in labels, settings, messages, or errors; it is always "AI."
- **UI:** shadcn/ui components, icons from react-icons. On mobile, use react-native-reusables (the shadcn/ui port for React Native); icons still come from react-icons.
- **Secrets:** never commit API keys, service-account files, tokens, passwords, or PINs. Firebase settings live in `.env` files (gitignored, see each app's `.env.example`) and in GitHub Actions secrets. Firebase app config files (`google-services.json`, `GoogleService-Info.plist`) stay out of git.
- **No attribution trailers.** Commits carry no co-authored-by line, no session line, and no "generated with" footer, in commit messages or pull request bodies. Every commit is authored solely as the git user is configured.
- **Conventional Commits v1.0.0:** `<type>[(scope)][!]: <imperative description>`, blank line, body, blank line, footers. Types: feat, fix, docs, refactor, test, chore, perf, build, ci, style.
- **Commit far less often:** one commit per meaningful, self-contained piece of work (a feature, a fix, a refactor, or a runbook). Small things join the commit they belong to. Never commit per file, per review round, or per step of a session. A day's work is a handful of commits split by type and scope, not by when the edits were made.
