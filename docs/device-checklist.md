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
