# TestFlight: YoungVista on the team's iPhones

TestFlight puts the app on the team's iPhones without a cable: you upload a build from the
MacBook Pro, and everyone in the "Team" group gets it in the TestFlight app. Internal testers need
no review by Apple. There is no App Store submission for now: the demo is for the team only.

**Who does what:** you run the command and click in App Store Connect; Claude Code prepares the
build and these steps, and never uploads anything.

## Once

Before you start: `npm run iphone` has put YoungVista on your iPhone at least once
([../../running-the-apps.md](../../running-the-apps.md)). That first run registers the app's ID,
`com.youngcorporation.youngvista`, with Apple (Xcode's automatic signing does it).

1. **Create the app in App Store Connect.** https://appstoreconnect.apple.com → **Apps** → the
   **+** next to "Apps" → **New App**:
   - **Platforms:** iOS
   - **Name:** `YoungVista`. If Apple says the name is taken, `YoungVista Rooms`. (The name under
     the icon on the phone stays YoungVista.)
   - **Primary Language:** English (U.S.)
   - **Bundle ID:** `com.youngcorporation.youngvista` (listed as "XC com youngcorporation
     youngvista", the name Xcode gave it). Not in the list? It appears after the first
     `npm run iphone`. Or register it by hand: https://developer.apple.com/account/resources/identifiers/list
     → **+** → **App IDs** → **Continue** → **App** → **Continue** → Description `YoungVista`,
     Bundle ID **Explicit**, `com.youngcorporation.youngvista` → **Continue** → **Register**.
     Then open the New App form again.
   - **SKU:** `youngvista`
   - **User Access:** **Full Access** → **Create**.

   If App Store Connect shows a banner about an agreement, the team's Account Holder accepts it
   first; until then Apple may refuse uploads.
2. **Note its Apple ID:** YoungVista → **App Information** (on the left, under General) →
   **Apple ID**, a 10-digit number. It goes into `appstore.json` in step 3.
3. **Put the API key in place.** The command uploads with an App Store Connect API key. In
   Terminal, in the YoungVista folder, either:
   - **Reuse YCACLOCK's key** (a team key with App Manager access, made for YCACLOCK's uploads):

     ```sh
     mkdir -p apps/mobile/.publish
     cp ~/Developer/2_Young/YCACLOCK/mobile/.publish/appstore.json ~/Developer/2_Young/YCACLOCK/mobile/.publish/AuthKey_*.p8 apps/mobile/.publish/
     open -e apps/mobile/.publish/appstore.json
     ```

     In TextEdit, replace the number after `"appleId":` with YoungVista's Apple ID from step 2
     (keep the quotes), then **⌘S** and close it.
   - **Or make a new key:** App Store Connect → **Users and Access** → **Integrations** →
     **App Store Connect API** → **Team Keys** → **+** → name `YoungVista publishing`, access
     **App Manager** → **Generate** → **Download API Key** (Apple offers it once only). Move the
     downloaded `AuthKey_XXXXXXXXXX.p8` into `apps/mobile/.publish/` (make the folder if needed) and
     create `apps/mobile/.publish/appstore.json` with the key's **Key ID**, the **Issuer ID** at
     the top of that page, and the Apple ID from step 2:

     ```json
     { "keyId": "XXXXXXXXXX", "issuerId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "appleId": "1234567890" }
     ```

   `apps/mobile/.publish/` is gitignored: it never goes into git. The command also finds the
   `.p8` in `~/.appstoreconnect/private_keys/`. Keep a copy of a new `.p8` in a password manager.
4. **Make the "Team" group:** YoungVista → **TestFlight** → the **+** next to **Internal Testing**
   → name `Team`, tick **Enable automatic distribution** → **Create**. Every processed build then
   reaches the group by itself.
5. **Add testers:** the **Team** group → the **+** next to **Testers** → tick them → **Add**.
   Testers must be users of the company's App Store Connect team. Someone new: **Users and
   Access** → **+** → their name, the email of the Apple ID on their iPhone, role **Marketing**
   (the least a tester needs), Apps: **YoungVista** → **Invite**; they accept Apple's email first.
   Each tester installs **TestFlight** from the App Store, then opens Apple's invitation email →
   **View in TestFlight** → **Accept** → **Install**.

## Each build

1. **Upload it:** in Terminal, in the YoungVista folder, on the newest `main` (`git pull`):

   ```sh
   npm run publish:iphone
   ```

   15 to 30 minutes. It raises the build number in `apps/mobile/release.json`, builds the App
   Store version, signs it as Young Corporation of America and uploads it. It ends with
   `✓ Uploaded YoungVista 0.1.0 (build 2) to App Store Connect.` If it stops before
   **Uploading it to App Store Connect**, nothing reached Apple: do what it says, then run
   `npm run publish:iphone -- --no-bump` so the number it raised isn't skipped.
   (`npm run publish:iphone -- --dry-run` builds and signs but uploads nothing.)
2. **Keep the build number:** ask Claude Code to "commit the build number". Apple takes each
   number once, so the next upload has to count on from this one.
3. **Wait for Apple's processing,** 10 to 30 minutes: YoungVista → **TestFlight** shows the
   build as **Processing**, then ready, and Apple emails. No encryption question comes up: the app
   says it uses only standard encryption.
4. **What to Test:** **TestFlight** → click the build → **What to Test** → paste the text from
   [../../store/testflight-notes.md](../../store/testflight-notes.md) → **Save**.
5. **Install it:** on the iPhone, the **TestFlight** app → YoungVista → **Install** (or
   **Update**). The team's iPhones get it the same way. TestFlight's copy replaces the one
   `npm run iphone` installed (it is the same app), and the other way round.

TestFlight shows the version and build number, like 0.1.0 (2): the number goes up with each
upload and is not the plan's Build 1 to 4. A build can be installed for 90 days.

Apple's guide: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview
