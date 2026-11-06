# Known limits

What YoungVista does not do yet, or does only roughly, as of Build 4 (the team demo). Most of
it is planned for after the demo (see "After the demo" in [build.md](../build.md)).

## Scanning

- **Walls are marked by hand.** Without LiDAR, a phone can't see plain walls reliably by itself,
  so you mark each wall once (two marks on the first). Automatic wall detection is a test switch
  in the debug overlay only. Apple RoomPlan (automatic scanning on iPhone Pro) comes later.
- **Square corners only:** rectangles, L and U shapes. Curved or slanted walls come out square.
- **One room per scan.** Furniture already in the room is not captured; doors and windows are
  added in the room editor.
- **Accuracy:** about 5 cm in simulation. Real-phone numbers come from the device checklist; type
  one tape-measured wall on the review screen to correct the scale.

## Camera view (AR)

- A saved room is lined up by tapping two corners (right after a scan it is lined up already).
  Over a long walk the phone's tracking can drift: "Line up again" fixes it.
- Needs good light and ARKit (iPhone) or Google Play Services for AR (Android). Some Samsung
  phones on Android 16 have known camera problems with the AR library (see decisions.md).
- The iPhone Simulator cannot run the app at all; an Android emulator runs everything except AR.

## Final pictures

- A picture is the 3D view exactly as it is on screen, at the view's own pixel size (about
  1180 × 1400 pixels on an iPhone 15), always portrait. No AI-polished version yet; it comes
  after the demo and will be labelled "AI".
- Pictures upload while the app is open: one taken offline (or when the app is closed before it
  finishes) stays on the phone and uploads the next time the app is open with a connection.
- Pictures cannot be deleted from the app or the website yet. Saving to Photos is optional: if
  it is not allowed, the picture still goes to the room.
- The website lists the pictures; its "Download picture at twice screen resolution" is not built
  yet.

## Saving and connection

- The phone keeps its own copy of each room it has opened, so rooms open and edits are kept
  without a connection. A room never opened on this phone needs a connection the first time.
- Firestore's own offline cache lives in memory on the phone and is gone after a restart; the
  app's copy (AsyncStorage) covers that.

## Furniture

- About 40 free, true-size models (Amazon Berkeley Objects, Poly Haven, Khronos samples), not a
  real product catalog. Sizes are approximate: check tight gaps with a tape.

## Website and sharing

- The website shows rooms, furniture and pictures; it can't edit them yet.
- A share link is a snapshot: after changing the room, tap "Update shared copy".

## Phones and stores

- Tested on Android emulators only: nobody has an Android test phone yet, and Google Play is not
  set up. iPhone builds go to the team through TestFlight ([publishing/](publishing/README.md)).
