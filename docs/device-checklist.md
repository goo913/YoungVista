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
