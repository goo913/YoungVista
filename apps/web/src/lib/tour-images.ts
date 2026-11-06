/**
 * Where a tour's 360° pictures come from: the bytes of each panorama, by its Storage path.
 *
 * - On the room page and a shared link's page: Firebase Storage, as the signed-in owner or as the
 *   link's viewer (storage.rules lets anyone read a panorama marked with a live link's id).
 * - In the phone's WebView (`/embed/tour`): the download URLs the app handed over.
 */
export type TourImages = (storagePath: string) => Promise<Blob>;

/** Downloaded pictures, newest last: switching tabs back to the 360° view does not fetch again. */
const kept = new Map<string, Promise<Blob>>();
const KEEP = 6;

/** From Firebase Storage (loaded only when a tour opens). */
export const storageTourImages: TourImages = (storagePath) => {
  let blob = kept.get(storagePath);
  if (!blob) {
    blob = Promise.all([import('./storage'), import('firebase/storage')]).then(
      ([{ storage }, { getBlob, ref }]) => getBlob(ref(storage, storagePath)),
    );
    // A failed download is tried again next time.
    blob.catch(() => kept.delete(storagePath));
  } else {
    kept.delete(storagePath);
  }
  kept.set(storagePath, blob);
  while (kept.size > KEEP) kept.delete(kept.keys().next().value!);
  return blob;
};

/** From download URLs, by Storage path. */
export function urlTourImages(urls: Readonly<Record<string, string>>): TourImages {
  return async (storagePath) => {
    const url = urls[storagePath];
    if (!url) throw new Error('This picture has no address.');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`The picture could not be downloaded (HTTP ${res.status}).`);
    return res.blob();
  };
}
