/**
 * "Delete picture", from the room page's picture strip (press and hold a picture) and from the
 * full-screen viewer: asks first, then deletes it from this phone, Storage and the room's list
 * (lib/pictures.ts `deletePicture`), and says how it went. The copy in Photos stays.
 */
import { Alert as NativeAlert } from 'react-native';
import { errorCode } from '@/lib/auth-errors';
import type { StripPicture } from '@/lib/picture-state';
import { deletePicture } from '@/lib/pictures';
import { deleteErrorMessage } from '@/lib/room-doc';
import { toasts } from '@/lib/toast';

export interface DeletePictureInput {
  uid: string;
  roomId: string;
  picture: StripPicture;
  /** From the room's snapshot: false while the server cannot be reached. */
  online: boolean;
  /** The delete starts (the viewer closes, the tile says "Deleting…"). */
  onStart?: () => void;
  /** The delete finished, or failed. */
  onEnd?: (deleted: boolean) => void;
}

/** What went wrong, in words, for a picture that was not deleted. */
export function deletePictureError(error: unknown, online: boolean): string {
  if (!online && errorCode(error) === 'unavailable') {
    return 'This picture is on the website too, so deleting it needs a connection. Connect to the internet and try again.';
  }
  return deleteErrorMessage(error, 'picture');
}

export function confirmDeletePicture(input: DeletePictureInput): void {
  const waiting = input.picture.pending !== null && input.picture.pending.step === 'upload';
  NativeAlert.alert(
    'Delete this picture?',
    waiting
      ? 'It has not been uploaded yet; it is removed from this room. The copy in Photos stays.'
      : 'It is removed from this room and from the website. The copy in Photos stays.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run(input) },
    ],
  );
}

async function run({ uid, roomId, picture, online, onStart, onEnd }: DeletePictureInput) {
  onStart?.();
  try {
    await deletePicture({ uid, roomId, picture, online });
    toasts.show({ tone: 'success', title: 'Picture deleted', detail: 'The copy in Photos stays.' });
    onEnd?.(true);
  } catch (error) {
    toasts.show({
      tone: 'error',
      title: 'The picture was not deleted',
      detail: deletePictureError(error, online),
    });
    onEnd?.(false);
  }
}
