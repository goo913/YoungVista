# Device checklist

Scanning and AR only run on real phones, so each build ends with these checks. Write the phone
model, OS version and app commit at the top of your notes for every run.

## Build 1: scan a room and save it

Phones: the owner's **iPhone 15** (no LiDAR, so plain ARKit plane finding) and at least one
Android phone that supports ARCore (Google Play Services for AR installed).

### Install and sign in

- [ ] Install the app on the iPhone with `npm run iphone` (or from TestFlight) and on Android with
      `npm run android`: [running-the-apps.md](running-the-apps.md). These are Release builds,
      as the team gets them; the debug overlay is in them.
- [ ] Email and password: create an account, sign out, sign in again, and request a password
      reset (the email arrives). A wrong password shows a plain message.
- [ ] "Continue with Google" works on the iPhone and on Android. Closing the Google window does
      nothing; it shows no error.
- [ ] Close the app completely and open it again: still signed in.

### Scan three rooms on each phone

Rooms: an ordinary rectangular room, a **plain white-walled room**, and an **L-shaped room**.
Stand near the middle; face each wall when you mark it.

- [ ] The first scan asks for the camera with an explanation. If you deny it, the screen offers
      Settings; allowing it there and coming back starts the scan.
- [ ] "Point at the floor" shows until the floor is found (note how long it takes). Pointing
      only at a bed or a desk says "That looks like furniture, point at the floor".
- [ ] First wall: aim the dot where a wall meets the floor, tap **Mark**; then further along the
      same wall (50 cm or more) and tap again. A dot appears in the room at each mark.
- [ ] Ceiling: aim where that wall meets the ceiling and tap **Mark the top** (the label under
      the dot shows the height), or tap **Skip, use 8 ft**.
- [ ] Every other wall: one mark at its bottom edge, or at its top edge where furniture is in the
      way. The label under the dot says which edge and how far. Near a corner it says "Face the
      wall". Each wall appears as a line on the floor, a line at the ceiling and a faint wall.
- [ ] A wall with a bed or desk in front of it: walk around the room first, then aim at the
      floor in front of the furniture. The label says "The wall is further back" (or "Furniture
      in the way", or "On furniture" when the dot is on the bed) and Mark is refused. Aim at that
      wall's top edge instead: it marks, in the right place.
- [ ] Mark a wall in front of the bed **before** walking past it, then walk past: the wall turns
      red, the banner says "The red wall is further back", and marking its top edge closes the
      room.
- [ ] Mark a wall standing at an angle to it (about 25°): it is accepted, no "Face the wall".
- [ ] A wrong mark (the side of the bed, say) turns walls red and the room does not close;
      **Undo** fixes it.
- [ ] Once every wall fits, the room closes by itself and shows its size (`10′ 3″ × 11′ 6″` for
      a rectangle). Change the ceiling if needed, tap Next.
- [ ] Review: the plan matches the room. Measure one wall with a tape, pick it under "Measured a
      wall with a tape?", type the length and tap Rescale. Save; the room page opens.
- [ ] Tape-measure **3 walls per room** (before rescaling) and record the error:

| Room | Phone | Wall | Tape | App | Error (cm) |
| ---- | ----- | ---- | ---- | --- | ---------- |
|      |       |      |      |     |            |

### Check the AR maths with the debug overlay

Tap the bug button on the scan screen. Outlines are the planes as ViroReact places them (blue
upright, yellow level); under each upright plane the green (ZYX, Viro's own order), red (YXZ)
and blue (XYZ) lines are where the app puts that plane on the floor.

- [ ] At a door or a textured wall, the green line runs along the bottom of the blue outline and
      of the real wall.
- [ ] In the planes list, "gap" stays at a few centimetres on the iPhone with "world" picked
      (Android: "local"), not metres. If not, try the other choice and note which one is right.
- [ ] Turn on "Use detected walls (test)" after marking the first wall: real walls found by the
      phone turn blue and count; a desk or bed side in front of a marked wall does not.
- [ ] Note the light estimate in a bright and in a dim room (the "Add more light" limit is 150).
- [ ] Every scan (saved, closed or failed) adds one document to `scanLogs` in Firestore for the
      team; nothing to do on the phone.

### Website

- [ ] Every saved room appears on https://young-vista.web.app with the same plan, wall lengths
      and area.

## Build 2: furnish a room in 3D

Phones: the **iPhone 15** and an Android phone. Use a room saved in Build 1 (an L-shaped one if
you have it). The Android emulator check (not a phone) passed for everything below except what
only a phone can show: the iPhone's 3D drawing, real fingers, and the speed of a real phone.

### 3D view and furniture

- [ ] Open a room, tap **Furnish in 3D**. The room appears in 3D within a few seconds: floor,
      walls, doors and windows; the walls between you and the room are faint.
- [ ] One finger on empty floor turns around the room; two fingers pinch to zoom; **Top view**
      glides to a view straight down and **Corner view** back. Note if anything stutters.
- [ ] **Add furniture**: the categories and pictures show, with sizes in feet and inches (and in
      metres after switching units). Add 5 pieces; each lands in a free spot.
- [ ] Drag a piece with one finger in 3D and in **Plan**: it follows the finger and snaps flush
      to a wall within about 6 inches, turning to face the room, and into corners.
- [ ] Turn a piece with two fingers (in 3D with the piece selected, and in Plan): it turns in 15°
      steps. The 15° buttons do the same.
- [ ] Drag a piece onto another: it turns red with "Overlaps the …" and goes back when let go.
- [ ] **Copy**, **Remove** (and **Undo** in the message) and the colour swatches work; a new
      colour shows in 3D after a moment the first time.
- [ ] A piece whose model cannot load shows as a grey box with its name (try airplane mode with
      a colour never opened before).

### Saving

- [ ] The header says "Saving…", then "Saved". Close the app completely and open it again: the
      furniture is where you left it.
- [ ] In airplane mode, move a piece: the header says "Offline, will save". Close the app, open
      it again still offline: the rooms list, the room and its 3D view (models already opened
      once) all open. Turn airplane mode off: the change reaches the website.
- [ ] The room on https://young-vista.web.app shows the same furniture on the plan and in 3D.

### Room editor

- [ ] **Edit walls, doors and windows**: drag a corner (walls snap straight when nearly
      straight); tap a wall and type a length in feet and inches, then in metres.
- [ ] Add a door, a window and an opening; drag them along the wall; change a window's size and
      sill; remove one. **Undo** takes back the last change.
- [ ] Set a low ceiling (6′): the message says which doors and windows were made smaller. Undo.
- [ ] The website shows the new walls, doors and windows.

### Credits

- [ ] Settings → **3D model credits** (also at the bottom of the furniture picker) lists every
      CC BY model with its author, licence and source link; the links open.

## Build 3: the room in the camera view (AR) and share links

Phone: the owner's **iPhone 15**, in good light. Use a room furnished in Build 2 with three or
more pieces (a door or window on the plan helps). The Android emulator check passed for the share
link, and the AR screens open there (without a camera picture: an emulator has no ARCore). AR
itself needs a real phone, so everything else below is first proven here. Note the gaps you
measure in centimetres or inches.

### Line up a saved room

- [ ] Room page → **See it in your room**. The camera opens and says "Point at the floor" until
      the floor is found.
- [ ] The small plan shows corners 1 and 2 (the ends of the longest wall) and the banner names
      the first ("Aim at the corner by the door", or "Aim at corner 1"). Put the dot where the
      walls meet the floor there and tap **Corner here**: a yellow post marks it. Then corner 2.
- [ ] It says "Lined up, … off" (write down the number). The furniture appears at its saved
      spots, at true size, with soft shadows on the real floor.
- [ ] The ghost walls (box button, top right) sit on the real walls, doors and windows. Write
      down the worst gap at the far corners. The box button hides and shows them.
- [ ] Tap corner 2 a metre short of the corner: it says "That did not line up" and asks again.
      **Other corners** asks for the ends of another wall instead.

### Walk around

- [ ] Walk round the room for a minute, look from the far side and from close up: the furniture
      stays where it was put, on the floor. Write down any drift.
- [ ] Cover the camera with your hand for 3 seconds, then uncover it: "Things may have moved"
      appears. **Line up again** asks for the corners again; **Cancel** brings back the old
      line-up. The crosshair button (top right) does the same at any time.

### Move and add in the camera view

- [ ] Tap a piece: a blue mark appears under it and the card shows its name and size. Drag it along
      the floor: it follows the finger, snaps flush to a wall within about 6 inches, turns red
      over another piece and goes back when let go. Two fingers turn it; so do the 15° buttons.
- [ ] Aim the dot at an open patch of floor, tap **Add furniture**, pick a piece: it lands on the
      dot, facing you, and the label under the top bar says "Saved".
- [ ] Close, then **Furniture and 3D**: the moved and added pieces are there. The website shows
      them too.

### Right after a scan

- [ ] Scan a room, tap Next, save it. "Room saved" → **See it in your room**: no corner taps; it
      says "Lined up from the scan" and the ghost walls sit on the real walls. Add a piece, close:
      the room page has it.

### Place freely

- [ ] Rooms list → **Place freely** (also in the furniture picker): find the floor, add two
      pieces, move, turn and remove them. Close and open it again: nothing was kept.

### Share link

- [ ] Room page → Share → **Create private link**: the share sheet opens; send the link to
      yourself.
- [ ] On a computer, in a private window (signed out), the link shows the room in 3D with its
      furniture.
- [ ] Move a piece in the app, tap **Update shared copy**, reload the page: it shows the move.
- [ ] **Turn off link**: the page says "Link not found or turned off".

## Build 4: final picture and polish

Phone: the owner's **iPhone 15**, with a room furnished in Build 2 or 3 (three or more pieces).
Install with `npm run iphone`: Build 4 adds a native module and new icons, so the first run makes
the iPhone project again (a few minutes longer). The Android emulator check passed for everything
below except what only a phone can show (the iPhone's own picture capture, Photos on iOS, real
fingers and speed, the AR lights).

### Icon, splash and first scan

- [ ] The home screen shows the new icon (a room with a sofa, on dark grey); opening the app shows
      the same mark on the splash screen, in light and in dark mode.
- [ ] The first **Scan a room** shows "Before you scan" with four tips over the camera. **Got
      it** puts them away; the next scan goes straight to the camera. Settings → **Scanning
      tips** shows them again.

### Take a picture

- [ ] **Furnish in 3D**: the buttons over the view say **Top view** and **Corner view** (no second
      "3D"). Choose an angle, tap **Take picture**: a short white flash, then "Picture taken"
      with the picture. The first time, iPhone asks to add photos: allow it.
- [ ] The card says "Saved to Photos" and then "It is on the website too". Open Photos: the
      picture is there, sharp, with no blue or red marks under the furniture, nothing drawn over
      it, and the room exactly as on screen. Write down its size (Photos → swipe up on it).
- [ ] With a piece selected (blue mark) or misplaced (red), tap away, then take a picture: the
      marks are not in it.
- [ ] Take one right after opening the 3D view, while models are still loading: it waits for
      them (or says some showed as grey boxes).
- [ ] Deny "add photos" in Settings → Privacy & Security → Photos → YoungVista → None, then take a
      picture: the card says "Not saved to Photos: allow it in Settings" with **Open Settings**,
      and the picture still reaches the room.
- [ ] Room page → **Pictures**: the new pictures, newest first; tap one to see it full screen. The
      room on https://young-vista.web.app shows the same pictures in its gallery.

### Weak or no connection

- [ ] Airplane mode on, in the 3D view: after a few seconds a quiet grey line says "Weak or no
      connection…". Take a picture: "It will upload when the connection is back". Its tile on
      the room page says **No connection**.
- [ ] Still offline, close the app completely. Turn airplane mode off and open the app: within a
      few seconds the picture uploads (its tile loses the label) and shows on the website.
- [ ] Rooms list, room page and 3D view stay usable offline; the grey line goes away when the
      connection is back.

### Polish

- [ ] **Your rooms**: the top bar has no gear floating over it; **Settings** is a button under
      the intro line. The rooms list and a room page show grey placeholders while loading, and
      "Try again" if they fail (for example a slow first launch in airplane mode).
- [ ] The furniture picker shows grey placeholders while pictures load, and a message for a
      category with nothing in it.
- [ ] VoiceOver (Settings → Accessibility → VoiceOver), for a minute: every round or icon button
      says what it does (close, dismiss, the units, Settings, the picture tiles).
- [ ] **See it in your room** right after opening: the banner says "Starting the camera…", not
      "Move slowly". Then, in a dim corner and in a bright spot, the furniture looks a little
      darker and brighter with the room's light.
- [ ] Dragging furniture in the 3D view and moving around in AR feel as smooth as before or
      smoother.

## Feedback round 1: phone

Phone: the owner's **iPhone 15**, in good light, with a room furnished with three or more pieces
(one with a door or a window on its plan helps) and two or three pictures. Install with
`npm run iphone`: this round changes only the app's code, not its native set-up, so the build is
the usual few minutes. The website side of this round (editing furniture there) is checked in
its own list. The line-up, room-moving and "follow the website" rules are covered by unit tests;
everything below needs the real iPhone.

### A saved room always opens

- [ ] Close the app completely (swipe it away), open it, tap a furnished room. The room page
      opens on the room in 3D with every piece where you left it: no camera, no scan, no corner
      taps. **Top** and **Corner** turn the view; tapping the 3D view opens the furniture screen.
- [ ] Airplane mode on, close and open the app, tap the same room: the same 3D view opens.
- [ ] Scroll the room page up and down with a finger on the 3D view: the page scrolls.

### See it in your room never blocks

- [ ] **See it in your room** → find the floor. The banner says which corner: "Corner 1: the left
      end of the longest wall" (", by the door" when one is near it), and the small plan shows a
      blue arrow where to stand, facing that wall.
- [ ] Tap corner 1, then aim at corner 2: the label under the dot says how far it is from
      corner 1 ("Corner 2 · 15′ 10″ from corner 1"). Compare it with the wall on the plan.
- [ ] Tap corner 2: it lines up every time. Write down the title ("Lined up, 2 cm off", or
      "Lined up. The saved room is about 30 cm shorter here.") and how far the ghost walls are
      from the real walls at the far corners.
- [ ] Line up again and tap the corners the other way round (corner 2 first): it lines up the
      same, and the message says you tapped them the other way round.
- [ ] Line up again and tap the second corner about a metre short of it: it still lines up and
      says the saved room is longer here. Two taps less than 50 cm apart are refused ("too close
      to corner 1").
- [ ] **Move the room** (the arrows button at the top, or in the "Lined up" message): one finger
      drags the whole room along the floor, two fingers turn it about the green dot, **Turn 90°**
      turns it a quarter, **Undo** goes back, **Done** ends. The ghost walls stay on meanwhile,
      and the blue dot on the small plan is where you stand in the room as placed.
- [ ] Line up again → **Place by hand**: stand near the middle facing the longest wall, aim at
      the floor in the middle of the room and tap it. The room appears around the dot; drag and
      turn it until the ghost walls sit on the real walls, then **Done**.
- [ ] After any of these: move a piece and add one, close. The room page's 3D view and the
      website show the change.
- [ ] Cover the camera for 3 seconds: "Things may have moved" → **Line up again** → **Cancel**
      brings the line-up back (also after moving the room by hand).
- [ ] Right after a scan, "See it in your room" still says "Lined up from the scan" with no taps;
      **Move the room** works there too. **Place freely** works as before.
- [ ] Point at a dark, plain floor for 15 seconds: the "Point at the floor" banner offers
      **See it in 3D**, which goes back to the room page.

### Rename, edit and delete rooms

- [ ] Rooms list: the **⋯** on a room (or press and hold it) offers Rename, Edit walls, doors and
      windows, and Delete room. The room page has the same in its **⋯** (top right) and in the
      "This room" card at the bottom.
- [ ] Rename: "Renamed to …" shows; the list, the room page and the website show the new name.
      In airplane mode the new name shows at once, survives closing the app, and reaches the
      website once the connection is back.
- [ ] **Edit walls, doors and windows** from the ⋯ opens the room editor.
- [ ] Delete: the sheet says what goes with the room (its furniture, pictures and link; Photos
      keep their copies) and asks first. In airplane mode the Delete button is off and says it
      needs a connection.
- [ ] Delete a room that has pictures and a private link: the room page closes, the list shows
      "Deleting…" on it, then it disappears and "Deleted …" shows. On the website the room is
      gone and its old link says "Link not found or turned off". In the Firebase console,
      Storage has nothing left under users/{uid}/rooms/{the room's id}/.
- [ ] With the room's page open on the phone, delete the room on the website (if the website
      offers it): the phone says "This room was deleted" with **Back to your rooms**.

### Pictures

- [ ] Furniture screen → **Take picture**: a short flash, then a card **Picture saved** with the
      picture and two lines: "Saved to Photos" with a tick, and "Saved in this room's pictures.
      Uploading to the website…", which turns into "…and on the website" with a tick. The card
      stays a few seconds after both are done. The picture is in Photos.
- [ ] The room page's empty Pictures card says "Open the 3D view" (it does not take a picture by
      itself).
- [ ] Room page → Pictures: press and hold a picture → **Delete**: "Picture deleted" shows, the
      picture leaves the strip and the website's gallery, and stays in Photos. Open another one
      full screen → **Delete picture** → the same.
- [ ] Airplane mode on: deleting an uploaded picture says it needs a connection and keeps it. A
      picture taken offline (not uploaded yet) deletes at once.

### Changes made elsewhere show up

- [ ] Open the furniture screen on the phone. On the website (or a second phone), move a piece:
      within a few seconds the phone shows the move and says "Furniture updated: it was changed
      on the website or another phone."
- [ ] Do it again while holding a piece on the phone: the phone keeps your move when you let go
      (the last change wins), and the website then shows the phone's design.
- [ ] The same in **See it in your room**, once lined up: the piece moves in the camera view.

### Clear confirmations

- [ ] Share card: **Create private link** says "Private link created" and opens the share sheet;
      **Update shared copy** says "Shared copy updated"; **Turn off link** says "Link turned off".
- [ ] Furniture screen and room editor: the top right still says "Saving…", then "Saved".

## Landscape camera screens

Phone: the owner's **iPhone 15** only. The camera screens (scan, **See it in your room**, **Place
freely**) now run sideways, either way round, for a wider view; every other screen stays upright.
This changes the app's native set-up (the turns the app allows, and a relay that tells the AR view
when the screen turns), so `npm run iphone` makes the iPhone project again: a longer build. The
Simulator cannot run the camera, and the maths that turning the phone must not change (the dot's
ray, the marks, the room, the line-up) is covered by unit tests; everything below needs the real
iPhone. "Left" and "right" below are the two ways to hold it sideways: Dynamic Island on the left,
then on the right.

### Turning in and out

- [ ] The rooms list, a room page, the furniture screen, the room editor, Settings and sign-in stay
      upright when the phone is turned sideways.
- [ ] Holding the phone upright, tap **Scan a room**: the screen opens and turns sideways. Turn the
      phone to the other side: the screen follows.
- [ ] Holding the phone sideways (left, then right), open **Scan a room**, **See it in your room**
      and **Place freely**: each opens the way the phone is held.
- [ ] Close each one (the X; on the scan also **Discard** and **Open the room page**; a problem
      card's **Back**): the screen turns back upright, with no half-turned screen and nothing left
      sideways. The furniture screen after **Place freely** is upright too.
- [ ] Press the side button while sideways, unlock, and come back to a camera screen; switch to
      another app and back: still sideways, the camera picture right.

### The camera picture after turning

- [ ] On each camera screen, both ways round: the camera picture is the right way up and not
      stretched (a door frame stays upright, a round plate stays round), and it fills the screen.
- [ ] Mid-scan, with a few walls marked, turn the phone from left to right: the picture turns at
      once; the marked lines on the floor and the faint walls stay on the real walls; the dot still
      marks the right place (mark one more wall).
- [ ] Lined up in **See it in your room**, turn the phone from left to right and back: the ghost
      walls and the furniture stay where they were in the room. No "Line up again" is needed.
- [ ] Note anything odd in the first moment after a camera screen opens (a picture turned or
      stretched for an instant is a known limit; one that stays wrong is a bug).

### Layout, both ways round

- [ ] Nothing sits under the Dynamic Island or the screen's rounded corners, on either side; the
      home bar at the bottom covers nothing.
- [ ] The middle of the screen stays clear: with two messages showing at the top (say "Move
      slowly" and a refused mark), they end above the dot; the label under the dot is readable
      and does not touch the buttons at the right.
- [ ] Scan: **Mark**, **Undo**, **Skip, use 8 ft** and **Done** are at the bottom right, under the
      right thumb, with no text cut off; the map is at the bottom left; the bug button (top right)
      puts the raw data at the left with a smaller map under it.
- [ ] Ceiling step: the plan at the bottom left, the card at the bottom right. Tap the height:
      the keyboard opens and the field stays in view; type a height and tap **Next**.
- [ ] Review: the plan on the left, the details on the right. Type a tape length and a room name:
      each field scrolls into view above the keyboard. **Save**.
- [ ] **Room saved** card at the bottom right → **See it in your room**: lined up from the scan;
      its buttons as below.
- [ ] Lining up: **Corner here**, then **Undo**, **Other corners**, **Place by hand** and
      **Cancel** in full rows under it at the right, no text cut off; the small plan at the bottom
      left.
- [ ] **Move the room**: the card at the right with **Turn 90°**, **Undo** and **Done** on one
      line; the plan with the blue dot at the bottom left.
- [ ] Tap a piece: its card at the right shows the four buttons in two rows and the colours.
      **Add furniture** opens the furniture list sideways (5 across, the categories next to the
      title) and the screen does not turn upright; pick one: it appears at the dot.
- [ ] First scan on a fresh install: the four tips show in two columns, readable, **Got it**
      reachable. Deny the camera once: the explanation on the left, the buttons on the right.

### Fingers and aim, sideways

- [ ] Drag a piece with one finger and turn it with two: it follows the finger, both ways round.
      The same for **Move the room**.
- [ ] **Place by hand** sideways, facing the longest wall: the room appears around the dot with
      its walls running the way the real ones do, as it does held upright.
- [ ] During the scan, point the phone straight down at the floor: the blue wedge on the map
      points the way you face, both ways round.
- [ ] Scan one room sideways and tape-measure 3 walls, as in Build 1: the errors match an upright
      scan of the same room.
