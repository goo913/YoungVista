# Publishing YoungVista

How YoungVista's phone app gets onto phones: your iPhone 15 by cable first, then TestFlight for
the team. Each guide says what to run and where to click, step by step.

## Where things stand (2026-11-05)

- **Nothing is published yet.** YoungVista isn't in App Store Connect, and no build has been
  uploaded.
- **Next:** put Build 1 on your iPhone by cable with `npm run iphone`
  ([../running-the-apps.md](../running-the-apps.md)) and try the scan
  ([../device-checklist.md](../device-checklist.md)). Then TestFlight's one-time set-up and the
  first upload ([apple/testflight.md](apple/testflight.md)).
- **No App Store release** for now: the demo is for the team only, through TestFlight.
- **Android:** nobody has an Android test phone yet. One plugged in gets the app with
  `npm run android`; Google Play comes later.

## The guides

| Guide | What it's for |
| --- | --- |
| [../running-the-apps.md](../running-the-apps.md) | The app on your iPhone (or an Android phone) by cable, and what to do when it stops. |
| [apple/testflight.md](apple/testflight.md) | TestFlight: creating the app in App Store Connect and the key, once; then each build for the team. |
| [../store/testflight-notes.md](../store/testflight-notes.md) | The "What to Test" text testers see. |

## Who does what

- **You:** run the commands on the MacBook Pro, click through App Store Connect, add testers.
- **The team's Account Holder:** accepts Apple's updated agreements when App Store Connect shows a
  banner about one.
- **Claude Code:** the commands, the app's settings for them and these guides. It never uploads a
  build or submits anything to Apple or Google.
