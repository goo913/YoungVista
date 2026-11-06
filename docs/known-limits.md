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

### Scanning by turning around

- **iPhone only.** It needs the room capture module (in builds from this round on); Android and
  older builds open the marked scan instead.
- **It needs the server and a connection.** About 25 to 45 MB of pictures go up per scan, and
  the room comes back in about a minute. Without a connection, or if the server fails or takes
  more than 3 minutes, the scan offers to mark the walls instead, in the same session. Closing
  the app while sending or measuring ends the scan: it cannot carry on later.
- **Accuracy is not proven yet.** The research estimates a 3 to 6% typical wall-length error
  (about 10% at worst for one in ten walls), to be checked with a laser meter. Walls the server is
  unsure of are shown in amber and offered for a mark by hand; a mark by hand replaces the
  server's wall, so the worst case is the marked scan's accuracy.
- **It reaches ARKit through ViroReact's own headers** (VROViewAR and its iOS session). A
  ViroReact upgrade can break that; the scan then says it cannot reach the camera pictures and
  offers to mark the walls instead.
- **The 4:3 camera format depends on ARKit taking it.** ViroReact runs the tallest format (16:9 4K
  on an iPhone 15); the scan switches to 4:3 1920 × 1440 if frames then keep coming, else it stays
  on the session's format, which sees less of the floor and ceiling per picture, and whose
  full-size pictures are about four times bigger to send.
- **The tilt line is a guide,** placed for the middle of the view; the pictures are kept anywhere
  within 8° of each turn's tilt.
- **Doors and windows** the server is less than 30% sure of are left out; add them in the room
  editor.
- **The pictures are private and deleted** when the scan ends without a saved room, and with the
  room when it is deleted. A room saved without the server's result (it failed, or the user
  marked the walls before it came) keeps no pictures and has no tour.

## Camera view (AR)

- A saved room opens on its page in 3D at once, with no camera. The camera view lines it up
  from two taps at the ends of one wall, in either order, or the room is placed by hand (right
  after a scan it is lined up already). The taps rarely match the plan exactly, since a scan is
  about 90% right: the line-up splits the difference between the two corners and says how big it
  is, and **Move the room** drags and turns it by hand. With a big scan error on a long wall, the
  far end of the room can sit that far off; move it by hand.
- A line-up is not kept between visits: each visit to the camera view lines up again (every AR
  session starts afresh). Over a long walk the phone's tracking can drift: "Line up again" fixes
  it.
- Which corner is which is told by the wall's left and right end seen from inside the room, and
  by doors and windows near it. A room that looks the same both ways round (a plain rectangle)
  can be lined up half a turn out if the user faces the wrong long wall; the ghost doors and
  windows show it. Aim the dot at the middle of the room and tap **Turn 90°** twice (it turns
  about the dot).
- Needs good light and ARKit (iPhone) or Google Play Services for AR (Android). Some Samsung
  phones on Android 16 have known camera problems with the AR library (see decisions.md).
- The iPhone Simulator cannot run the app at all; an Android emulator runs everything except AR.

## Landscape camera screens

- The camera screens (scan, See it in your room, Place freely) run sideways only, either way
  round; every other screen is upright only. Nothing turns upside down. The scan's ceiling step,
  review and saved card stay sideways too: the AR session runs under them, and turning the screen
  would disturb it.
- No wider camera: ARKit's world tracking always uses the iPhone's 1× wide camera, never the 0.5×
  ultra wide (Apple, June 2026: "not configurable"). Holding the phone sideways is what shows more
  of the room across.
- A camera screen slides up upright and then turns, and on closing slides away and then the app
  turns back upright: how iPhones show a sideways screen over upright ones.
- Opening the app with the phone held sideways can show the launch screen sideways for a moment,
  until the first screen turns it upright.
- The AR library (ViroReact 3.0.3) turns its camera picture only when iOS sends an old "the screen
  turned" notice, which iOS 27 no longer sends to apps like this one; the app sends it itself
  (plugins/with-scene-lifecycle.js). Right as a camera screen opens, until the screen has finished
  turning, the picture can be drawn the old way round for an instant. Checked on the iPhone
  Simulator (no camera there); the device checklist covers the real iPhone.
- On Android the same screens should turn the same way, but nobody has tried it there yet.

## Final pictures

- A picture is the 3D view exactly as it is on screen, at the view's own pixel size (about
  1180 × 1400 pixels on an iPhone 15), always portrait. No AI-polished version yet; it comes
  after the demo and will be labelled "AI".
- Pictures upload while the app is open: one taken offline (or when the app is closed before it
  finishes) stays on the phone and uploads the next time the app is open with a connection.
- Pictures are deleted on the room page (press and hold one, or **Delete picture** full
  screen). Deleting one that is already uploaded needs a connection; a picture not uploaded yet
  is deleted at once. The copy in Photos stays: the app never deletes from Photos. Saving to
  Photos is optional: if it is not allowed, the picture still goes to the room.
- On the website, pictures can be downloaded and deleted from the room's gallery, and the 3D view
  can download a picture at twice screen resolution or save it to the room's pictures.

## Saving and connection

- The phone keeps its own copy of each room it has opened, so rooms open and edits are kept
  without a connection. A room never opened on this phone needs a connection the first time.
- Firestore's own offline cache lives in memory on the phone and is gone after a restart; the
  app's copy (AsyncStorage) covers that.
- Deleting a room needs a connection, so that its pictures, their files and its link go from the
  website too; a delete cut short by the connection is finished by deleting again. Renaming works
  offline and is sent when the connection is back.
- A furniture change made elsewhere (the website, another phone) shows on an open furniture or
  camera screen within a few seconds, unless a piece is being moved or a change is still saving
  on the phone at that moment: then the last change wins. The room editor (walls, doors and
  windows) does not follow changes made elsewhere while it is open.

## Furniture

- About 40 free, true-size models (Amazon Berkeley Objects, Poly Haven, Khronos samples), not a
  real product catalog. Sizes are approximate: check tight gaps with a tape.

## Website and sharing

- The website furnishes rooms (the phone's rules), renames and deletes them, and deletes
  pictures; it does not edit walls, doors or windows (the phone's room editor does).
- Two devices changing the same room at the same moment: the last change saved wins (a change
  from the other device that arrives during a drag is replaced when the drag is saved).
- Walking and flying with the keys need a mouse (Pointer Lock); on a touch screen the 3D view
  looks round with a drag, steps with a pinch and walks to a double-tapped spot instead.
- A share link is a snapshot: after changing the room, tap "Update shared copy".

## Phones and stores

- Tested on Android emulators only: nobody has an Android test phone yet, and Google Play is not
  set up. iPhone builds go to the team through TestFlight ([publishing/](publishing/README.md)).
