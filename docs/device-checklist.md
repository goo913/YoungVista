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

- [ ] The first scan asks for the camera with an explanation. If you deny it, the screen offers
      Settings; allowing it there and coming back starts the scan.
- [ ] "Looking for the floor…" shows until the floor is found (note how long it takes).
- [ ] Walls appear on the mini-map as you turn; the red wedges and "Turn left/right…" point to
      where walls are still missing. Coaching appears when you move fast or the room is dim.
- [ ] For a wall that is not found, aim the dot at its bottom edge, tap **Mark wall**, then aim
      at the other end and tap again. The wall appears.
- [ ] The room closes by itself when the walls go all the way round (or tap **Done**). If it
      cannot, the reason is clear and scanning continues.
- [ ] Ceiling height shows 8′ 0″; changing it in feet and inches and in metres works.
- [ ] Review shows the plan with lengths; name the room and save; the room page opens.
- [ ] Tape-measure **3 walls per room** and record the error:

| Room | Phone | Wall | Tape | App | Error (cm) |
| ---- | ----- | ---- | ---- | --- | ---------- |
|      |       |      |      |     |            |

### Check the wall maths with the debug overlay

Tap the bug button on the scan screen. Blue patches are the planes as ViroReact places them; for
each wall the red (YXZ), green (ZYX) and blue (XYZ) lines are where the app puts that wall on the
floor with each Euler order.

- [ ] Facing each wall in turn (at least 4 headings), note which coloured line runs along the
      bottom of the real wall and the blue patch. Expected: red and green agree and are right.
- [ ] If every line is turned 90° from its wall, try the axis buttons ("x", "z") and note which
      one fixes it.
- [ ] Note the light estimate in a bright and in a dim room (the "Add more light" limit is 150).
- [ ] Tap "Share the raw data" once per phone and attach it to the notes.

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
      glides to a view straight down and **3D** back. Note if anything stutters.
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
