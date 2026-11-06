/**
 * A room's real 360° pictures (`rooms/{id}.tour`, from a turn-around scan) on the phone: whether
 * the room has them, what the tour page needs to show them, and sharing them with a private link.
 * The pictures are shown by the website's viewer in a WebView (lib/tour-page.ts).
 */
import {
  buildTourEmbed,
  roomToFirestore,
  roomTourFromFirestore,
  roomTourToFirestore,
  TOUR_SHARE_METADATA,
  toursEqual,
  type Design,
  type Room,
  type RoomTour,
  type TourEmbed,
  type UnitSystem,
} from '@youngvista/core';
import { deleteField, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, updateMetadata } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { firebaseStorage, firestore } from './firebase';

/** The room's tour, kept up to date; null while unknown or when it has none. */
export function useRoomTour(roomId: string): RoomTour | null {
  const [tour, setTour] = useState<{ id: string; tour: RoomTour | null } | null>(null);
  useEffect(() => {
    return onSnapshot(
      doc(firestore(), 'rooms', roomId),
      (snap) => {
        const next = roomTourFromFirestore(snap.data()?.tour);
        setTour((prev) =>
          prev?.id === roomId && toursEqual(prev.tour, next) ? prev : { id: roomId, tour: next },
        );
      },
      () => setTour({ id: roomId, tour: null }),
    );
  }, [roomId]);
  return tour?.id === roomId ? tour.tour : null;
}

/**
 * Everything the tour page shows: the room, its furniture and a download address per picture
 * (which needs a connection).
 */
export async function loadTourEmbed(input: {
  name: string;
  units: UnitSystem;
  room: Room;
  design: Design;
  tour: RoomTour;
}): Promise<TourEmbed> {
  const storage = firebaseStorage();
  const urls = await Promise.all(
    input.tour.spots.map((s) => getDownloadURL(ref(storage, s.storagePath))),
  );
  const images: Record<string, string> = {};
  input.tour.spots.forEach((s, i) => {
    images[s.storagePath] = urls[i]!;
  });
  return buildTourEmbed({
    name: input.name,
    units: input.units,
    room: roomToFirestore(input.room),
    design: input.design,
    tour: input.tour,
    images,
  });
}

/**
 * After a private link is made or refreshed: marks the room's 360° pictures with the link's id
 * (storage.rules then lets the link's viewers read them) and copies the tour into the link's
 * snapshot, as the website does. A room without a tour clears the snapshot's. Failures are left
 * to the caller: the link itself already works.
 */
export async function shareTourPictures(roomId: string, shareId: string): Promise<void> {
  const room = await getDoc(doc(firestore(), 'rooms', roomId));
  const tour = roomTourFromFirestore(room.data()?.tour);
  const share = doc(firestore(), 'shares', shareId);
  if (!tour) {
    await updateDoc(share, { tour: deleteField() });
    return;
  }
  const storage = firebaseStorage();
  await Promise.all(
    tour.spots.map((s) =>
      updateMetadata(ref(storage, s.storagePath), {
        customMetadata: { [TOUR_SHARE_METADATA]: shareId },
      }),
    ),
  );
  await updateDoc(share, { tour: roomTourToFirestore(tour) });
}
