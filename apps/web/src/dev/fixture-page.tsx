/**
 * Dev tool: the test tour maker, at http://localhost:5173/dev/tour-fixture.html while
 * `npm run dev:web` runs (never built or deployed). It renders synthetic 360° panoramas of one of
 * the signed-in user's rooms (dev/panorama-render.ts) and saves them as the room's tour, exactly
 * where a turn-around scan puts them: `captureFolder(uid, scanId)/pano/spot-N.jpg` in Storage and
 * `rooms/{id}.tour` in Firestore. Test tours have scan ids starting with `test-`.
 *
 * Sign in on the website first (same origin, same session). With VITE_FIREBASE_EMULATOR_HOST set
 * it writes to the emulators; otherwise to the live project, which the page says in red.
 *
 * Address options, for scripts: `?room=<id>` picks the room, `size=2048|4096|8192` the width,
 * `furniture=1` draws the room's furniture into the pictures (a line-up check: the viewers'
 * furniture must land on the pictured one).
 */
import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, listAll, ref, uploadBytes } from 'firebase/storage';
import {
  captureFolder,
  panoramaFile,
  pointInRoom,
  roomArea,
  roomTourToFirestore,
  type Room,
  type RoomTour,
} from '@youngvista/core';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loadCatalog } from '@/lib/catalog';
import { emulatorHost, firebaseAuth, firebaseApp } from '@/lib/firebase';
import { db } from '@/lib/firestore';
import { furnitureEntries, type FurnitureEntry } from '@/lib/furniture';
import { toSummary, type RoomSummary } from '@/lib/rooms';
import { storage } from '@/lib/storage';
import { renderPanoramas, type FixtureSpot } from './panorama-render';

const params = new URLSearchParams(window.location.search);
/** Heights and centre headings that differ per spot, so the viewers' line-up is exercised. */
const HEIGHTS = [1.45, 1.52, 1.4];
const YAWS = [37, -112, 154];

/** Spots spread over the room: 1 up to 12 m², 2 up to 26 m², else 3 (k-means over the floor). */
function autoSpots(room: Room, furniture: readonly FurnitureEntry[]): FixtureSpot[] {
  const area = roomArea(room);
  const k = area <= 12 ? 1 : area <= 26 ? 2 : 3;
  const xs = room.points.map((p) => p[0]);
  const zs = room.points.map((p) => p[1]);
  const free = (x: number, z: number) => {
    if (!pointInRoom(room, { x, z })) return false;
    // Away from the walls...
    for (let i = 0; i < room.points.length; i++) {
      const [ax, az] = room.points[i]!;
      const [bx, bz] = room.points[(i + 1) % room.points.length]!;
      const ex = bx - ax;
      const ez = bz - az;
      const t = Math.max(
        0,
        Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)),
      );
      if (Math.hypot(x - ax - ex * t, z - az - ez * t) < 0.6) return false;
    }
    // ...and out of the furniture.
    return furniture.every((f) => {
      const p = f.footprint;
      const dx = x - p.center.x;
      const dz = z - p.center.z;
      const u = Math.abs(dx * p.axisX.x + dz * p.axisX.z);
      const v = Math.abs(dx * p.axisZ.x + dz * p.axisZ.z);
      return u > p.halfWidth + 0.35 || v > p.halfDepth + 0.35;
    });
  };
  const grid: { x: number; z: number }[] = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.2) {
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.2)
      if (free(x, z)) grid.push({ x, z });
  }
  if (!grid.length) {
    const x = xs.reduce((a, b) => a + b, 0) / xs.length;
    const z = zs.reduce((a, b) => a + b, 0) / zs.length;
    return [{ x, z, height: HEIGHTS[0]!, yawDeg: YAWS[0]! }];
  }
  // Farthest-point start, then a few rounds of k-means.
  const mean = grid.reduce((a, p) => ({ x: a.x + p.x / grid.length, z: a.z + p.z / grid.length }), {
    x: 0,
    z: 0,
  });
  const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    Math.hypot(a.x - b.x, a.z - b.z);
  const centres = [grid.reduce((best, p) => (dist(p, mean) < dist(best, mean) ? p : best))];
  while (centres.length < Math.min(k, grid.length)) {
    centres.push(
      grid.reduce((best, p) =>
        Math.min(...centres.map((c) => dist(p, c))) > Math.min(...centres.map((c) => dist(best, c)))
          ? p
          : best,
      ),
    );
  }
  for (let round = 0; round < 12; round++) {
    const sums = centres.map(() => ({ x: 0, z: 0, n: 0 }));
    for (const p of grid) {
      let best = 0;
      for (let i = 1; i < centres.length; i++) {
        if (dist(p, centres[i]!) < dist(p, centres[best]!)) best = i;
      }
      sums[best]!.x += p.x;
      sums[best]!.z += p.z;
      sums[best]!.n++;
    }
    for (let i = 0; i < centres.length; i++) {
      const s = sums[i]!;
      if (!s.n) continue;
      const m = { x: s.x / s.n, z: s.z / s.n };
      // Keep the centre on free floor: the free grid point nearest the cluster's mean.
      centres[i] = grid.reduce((best, p) => (dist(p, m) < dist(best, m) ? p : best));
    }
  }
  return centres.map((c, i) => ({
    x: +c.x.toFixed(2),
    z: +c.z.toFixed(2),
    height: HEIGHTS[i % HEIGHTS.length]!,
    yawDeg: YAWS[i % YAWS.length]!,
  }));
}

/** Deletes every file of a scan's panorama folder. */
async function removePanoramas(uid: string, scanId: string) {
  const files = await listAll(ref(storage, `${captureFolder(uid, scanId)}/pano`));
  await Promise.all(files.items.map((f) => deleteObject(f)));
}

export function FixturePage() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomId, setRoomId] = useState(params.get('room') ?? '');
  const [spots, setSpots] = useState<FixtureSpot[]>([]);
  const [size, setSize] = useState(Number(params.get('size')) || 4096);
  const [withFurniture, setWithFurniture] = useState(params.get('furniture') === '1');
  const [replaceReal, setReplaceReal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pictures, setPictures] = useState<{ blob: Blob; url: string }[]>([]);
  const [furniture, setFurniture] = useState<FurnitureEntry[]>([]);

  useEffect(() => onAuthStateChanged(firebaseAuth(), setUser), []);
  const uid = user?.uid ?? null;

  const [listed, setListed] = useState(0);
  const reloadRooms = () => setListed((n) => n + 1);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    void getDocs(query(collection(db, 'rooms'), where('ownerId', '==', uid))).then((snap) => {
      if (!live) return;
      const list = snap.docs.map((d) => toSummary(d.id, d.data()));
      setRooms(list);
      setRoomId((id) => id || list[0]?.id || '');
    });
    return () => {
      live = false;
    };
  }, [uid, listed]);

  const room = rooms.find((r) => r.id === roomId) ?? null;
  useEffect(() => {
    if (!room?.room) return;
    let live = true;
    void loadCatalog()
      .then((catalog) => furnitureEntries(room.design, catalog))
      .catch(() => furnitureEntries(room.design, null))
      .then((entries) => {
        if (!live) return;
        setFurniture(entries);
        setSpots(autoSpots(room.room!, entries));
      });
    return () => {
      live = false;
    };
  }, [room]);
  useEffect(() => () => pictures.forEach((p) => URL.revokeObjectURL(p.url)), [pictures]);

  const realTour = room?.tour && !room.tour.scanId.startsWith('test-') ? room.tour : null;
  const target = useMemo(
    () =>
      emulatorHost
        ? `the emulators on ${emulatorHost}`
        : `the LIVE project "${firebaseApp().options.projectId}"`,
    [],
  );

  async function run(label: string, action: () => Promise<string>) {
    setBusy(label);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await action() });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const render = () =>
    run('render', async () => {
      if (!room?.room) throw new Error('Pick a room with a floor plan.');
      const started = performance.now();
      const blobs = await renderPanoramas(room.room, spots, {
        width: size,
        furniture: withFurniture ? furniture : [],
      });
      setPictures(blobs.map((blob) => ({ blob, url: URL.createObjectURL(blob) })));
      const mb = blobs.reduce((a, b) => a + b.size, 0) / 1024 / 1024;
      return `Rendered ${blobs.length} ${blobs.length === 1 ? 'picture' : 'pictures'} (${mb.toFixed(1)} MB) in ${((performance.now() - started) / 1000).toFixed(1)} s.`;
    });

  const save = () =>
    run('save', async () => {
      if (!uid || !room) throw new Error('Sign in and pick a room.');
      if (pictures.length !== spots.length) throw new Error('Render the pictures first.');
      if (realTour && !replaceReal) throw new Error('This room has a real tour: tick “Replace”.');
      const scanId = `test-${Date.now().toString(36)}`;
      const tour: RoomTour = { scanId, spots: [] };
      for (const [i, spot] of spots.entries()) {
        const storagePath = `${captureFolder(uid, scanId)}/${panoramaFile(i)}`;
        await uploadBytes(ref(storage, storagePath), pictures[i]!.blob, {
          contentType: 'image/jpeg',
        });
        tour.spots.push({
          spot: i,
          storagePath,
          width: size,
          height: size / 2,
          position: [spot.x, spot.height, spot.z],
          yawDeg: spot.yawDeg,
        });
      }
      const old = room.tour;
      await updateDoc(doc(db, 'rooms', room.id), {
        tour: roomTourToFirestore(tour),
        updatedAt: serverTimestamp(),
      });
      // The test tour this one replaces goes (a real one stays in Storage).
      if (old?.scanId.startsWith('test-')) await removePanoramas(uid, old.scanId).catch(() => {});
      reloadRooms();
      return `Saved as the room's tour (${scanId}). Open the room and choose 360°.`;
    });

  const remove = () =>
    run('remove', async () => {
      if (!uid || !room?.tour) throw new Error('This room has no tour.');
      if (realTour) throw new Error('This is a real tour: remove it from the room instead.');
      await removePanoramas(uid, room.tour.scanId);
      await updateDoc(doc(db, 'rooms', room.id), {
        tour: deleteField(),
        updatedAt: serverTimestamp(),
      });
      reloadRooms();
      return 'Removed the test tour.';
    });

  const setSpot = (i: number, key: keyof FixtureSpot, value: string) =>
    setSpots((list) => list.map((s, j) => (j === i ? { ...s, [key]: Number(value) || 0 } : s)));

  return (
    <main className="mx-auto grid max-w-3xl gap-4 p-6">
      <title>Test tour maker · YoungVista dev</title>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Test tour maker</h1>
        <p className="text-sm text-muted-foreground">
          Synthetic 360° pictures of a saved room, saved as its tour, for checking the viewers.
          Writes to {target}.
        </p>
      </div>
      {!emulatorHost ? (
        <Alert variant="destructive">
          <AlertDescription>
            Not on the emulators: this writes to the live project, in your own account.
          </AlertDescription>
        </Alert>
      ) : null}
      {user === undefined ? null : !user ? (
        <Alert>
          <AlertDescription>
            <a className="underline" href="/sign-in">
              Sign in on the website
            </a>
            , then come back.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Room</CardTitle>
            <CardDescription>Signed in as {user.email ?? user.uid}.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              aria-label="Room"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.room ? ` · ${roomArea(r.room).toFixed(1)} m²` : ' · no plan'}
                  {r.tour ? ` · tour ${r.tour.scanId}` : ''}
                </option>
              ))}
            </select>
            <div className="grid gap-2">
              <Label>Spots (x, z, camera height in m; centre heading in degrees)</Label>
              {spots.map((s, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[2rem_repeat(4,1fr)_auto] items-center gap-2"
                >
                  <span className="text-sm text-muted-foreground">{i + 1}</span>
                  {(['x', 'z', 'height', 'yawDeg'] as const).map((key) => (
                    <Input
                      key={key}
                      aria-label={`Spot ${i + 1} ${key}`}
                      type="number"
                      step="0.05"
                      value={s[key]}
                      onChange={(e) => setSpot(i, key, e.target.value)}
                    />
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSpots((list) => list.filter((_, j) => j !== i))}
                    disabled={spots.length === 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSpots((list) => [
                      ...list,
                      { ...(list[list.length - 1] ?? { x: 0, z: 0 }), height: 1.45, yawDeg: 0 },
                    ])
                  }
                >
                  Add a spot
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => room?.room && setSpots(autoSpots(room.room, furniture))}
                >
                  Place automatically
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                Width
                <select
                  className="h-8 rounded-md border bg-background px-2"
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  aria-label="Picture width"
                >
                  {[2048, 4096, 8192].map((w) => (
                    <option key={w} value={w}>
                      {w} × {w / 2}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={withFurniture}
                  onChange={(e) => setWithFurniture(e.target.checked)}
                />
                Draw the room&apos;s furniture into the pictures (line-up check)
              </label>
              {realTour ? (
                <label className="flex items-center gap-2 text-destructive">
                  <input
                    type="checkbox"
                    checked={replaceReal}
                    onChange={(e) => setReplaceReal(e.target.checked)}
                  />
                  Replace the room&apos;s real tour
                </label>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void render()} disabled={!!busy || !room?.room}>
                {busy === 'render' ? 'Rendering…' : 'Render pictures'}
              </Button>
              <Button
                variant="outline"
                onClick={() => void save()}
                disabled={!!busy || pictures.length !== spots.length}
              >
                {busy === 'save' ? 'Saving…' : 'Save as the room’s tour'}
              </Button>
              <Button
                variant="outline"
                onClick={() => void remove()}
                disabled={!!busy || !room?.tour || !!realTour}
              >
                {busy === 'remove' ? 'Removing…' : 'Remove the test tour'}
              </Button>
              {room ? (
                <Button variant="ghost" asChild>
                  <a href={`/rooms/${room.id}?view=360`}>Open the room</a>
                </Button>
              ) : null}
            </div>
            {message ? (
              <p
                role="status"
                data-fixture-status={message.ok ? 'ok' : 'error'}
                className={message.ok ? 'text-sm text-emerald-700' : 'text-sm text-destructive'}
              >
                {message.text}
              </p>
            ) : null}
            <div className="grid gap-2">
              {pictures.map((p, i) => (
                <a key={p.url} href={p.url} download={`spot-${i}.jpg`}>
                  <img src={p.url} alt={`Spot ${i + 1}`} className="w-full rounded-md border" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
