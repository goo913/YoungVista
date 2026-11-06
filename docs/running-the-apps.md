# Running the phone app

How to put YoungVista on your iPhone 15 with its cable, on an Android phone the same way, and how
engineers run the development build. Every command is typed in Terminal, in the YoungVista folder:
**⌘ Space**, type `Terminal`, **Return**, then `cd ~/Developer/2_Young/YoungVista` (once per
Terminal window). Or ask Claude Code in that folder ("put the app on my iPhone"): it runs the same
commands.

The app needs a real phone: the iPhone Simulator can't run it at all (its AR library, ViroReact,
is made for real iPhones only).

| Command | What it does |
| --- | --- |
| `npm run iphone` | Builds the app and puts it on **your iPhone**, plugged into the Mac with its cable. |
| `npm run android` | The same for an **Android phone**, plugged in with its cable. |

Both put the finished app on the phone (a Release build, as TestFlight's): it runs on its own
afterwards, with no cable and no Mac, and the scan screen's bug button shows the debug overlay
that [device-checklist.md](device-checklist.md) uses. Each command checks what it needs first and
says in plain words what to do when something is missing.

## Your iPhone

### The first time

Steps 1 and 2 are probably done already: YCACLOCK's `npm run iphone` works on this Mac and your
iPhone.

1. **Xcode is signed in to the company's team.** Xcode → **Settings…** → **Accounts** shows your
   Apple ID with **Young Corporation of America**. If not: **+** (bottom left) → **Apple Account**
   → **Continue**, sign in; then click your Apple ID, the **Young Corporation of America** line →
   **Manage Certificates…** → **+** → **Apple Development** → **Done**.
2. **Developer Mode is on, on the iPhone:** Settings → Privacy & Security → **Developer Mode** (at
   the very bottom) → on → **Restart**; after the restart, **Turn On** and the passcode.
3. **The app's settings,** once per YoungVista folder: `cp .secrets/mobile.env apps/mobile/.env`
4. **Plug the iPhone in** and unlock it. If it asks "Trust This Computer?", tap **Trust** and enter
   the passcode.
5. **Run `npm run iphone`** (below). This first run also registers YoungVista with Apple: Xcode
   makes the app's ID (`com.youngcorporation.youngvista`) and its signing profile for the company's
   team by itself. If the Mac asks for its password so that `codesign` can use your signing key,
   type it and click **Always Allow**.
6. **If the iPhone says "Untrusted Developer"** when YoungVista opens: Settings → General →
   **VPN & Device Management** → under "Developer App", tap **Young Corporation of America** →
   **Trust**. Then open YoungVista again.

### Every time

1. Plug the iPhone in, unlock it, and keep it unlocked.
2. Run:

   ```sh
   npm run iphone
   ```

   It says what it is doing at each step (`▸ …`). The first time, and after a change to the app's
   native set-up, it makes the iPhone project (a few minutes). Then it builds the app, signed by
   Young Corporation of America (10 to 20 minutes the first time, a few minutes after that),
   installs it and opens it. It ends with:

   ```
   ✓ YoungVista is on <your iPhone>, signed by Young Corporation of America, and runs without the Mac.
     This copy keeps opening until <a day about a year from now>. Before then, plug the iPhone in and run npm run iphone again.
   ```

3. Unplug. Sign in, then scan: [device-checklist.md](device-checklist.md), Build 1.

**Run it again** after a change to the app (`git pull` first), and before the day it printed: on
that day this copy stops opening (Apple's signing profile for it ends). Running the command again
with the iPhone plugged in gives it another year. A copy from TestFlight replaces this one, and
this one replaces TestFlight's: it is the same app.

## An Android phone

Nobody has an Android test phone yet; when someone does, this puts the app on it. The phone must
support ARCore (Google Play Services for AR, from the Play Store). Google Play comes later.

1. **The first time, on the phone:** Settings → **About phone** → tap **Build number** 7 times;
   then Settings → System → **Developer options** → **USB debugging**: on. Plug it into the Mac and
   on "Allow USB debugging?" tick **Always allow from this computer** → **Allow**.
2. **Every time:** plug it in, unlock it, and run `npm run android`. It ends with
   `✓ YoungVista is on <the phone>, and runs without the Mac.`

It needs Android Studio and Java 17 on the Mac (this one has both). The app is signed with the
React Native debug key, whose fingerprint (SHA-1) Firebase knows, so Google sign-in works.

## When it doesn't work

1. **Read the last lines** the command printed: "No iPhone is plugged in", "Developer Mode is off",
   "doesn't trust this Mac yet", "signed in with a personal Apple ID only" and the like say
   exactly what to do.
2. **Run the same command again.** A download that failed halfway is the most common cause.
3. **Build from scratch:** `npm run iphone -- --rebuild` (or `npm run android -- --rebuild`). It
   takes as long as the first time.
4. **Ask Claude Code**, for example "npm run iphone fails". The logs are in
   `apps/mobile/.expo/logs/`.

| What you see | What to do |
| --- | --- |
| YoungVista no longer opens, about a year after it was installed | Expected: plug in and run `npm run iphone`. |
| "Untrusted Developer" when opening the app | On the iPhone: Settings → General → VPN & Device Management → Young Corporation of America → **Trust**. |
| "No iPhone is plugged in" although it is | Unlock it, use a cable that carries data, tap **Trust** if it asks. |
| "Xcode is still getting the iPhone ready" | The first time on a new Xcode: wait a few minutes with the iPhone plugged in and unlocked, then run it again. |
| After Xcode updated itself | Open Xcode once and let it install what it asks for, then run the command again. |

## For engineers: the development build

While working on the app's code, a development build takes the code from Metro on the Mac and
reloads as it changes:

```sh
cd apps/mobile
npx expo run:ios --device     # iPhone: builds, signs, installs, starts Metro
npx expo run:android          # Android phone
npx expo start --dev-client   # later, with the development build already installed
```

It has the same app ID as the Release build, so each replaces the other. After changing
`app.config.ts`, `release.json`, `GOOGLE_IOS_URL_SCHEME` in `.env`, a package with native code or
the app's own native module (`apps/mobile/modules/`), run `npx expo prebuild --clean` first
(`npm run iphone` and `npm run android` notice by themselves). The developer menu opens by shaking
the phone: the floating "Tools" button is turned off, because it covered the screens' top bars.

## Where things are

| | |
| --- | --- |
| `scripts/phone.mjs` | `npm run iphone` and `npm run android`. |
| `scripts/publish.mjs` | `npm run publish:iphone` ([publishing/apple/testflight.md](publishing/apple/testflight.md)). |
| `apps/mobile/release.json` | The version and build number the app gets. |
| `apps/mobile/.env` | The app's Firebase and Google settings. Never in git. |
| `apps/mobile/.expo/logs/` | What the builds printed, for when something goes wrong. |
| `apps/mobile/ios/`, `apps/mobile/android/` | The native projects, made from `apps/mobile/app.config.ts`. Never edited by hand, never in git. |
