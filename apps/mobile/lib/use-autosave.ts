import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import { Autosave, type SaveStatus } from './autosave';
import { clearPending, setPending } from './pending';
import type { PendingEdits } from './room-doc';

interface UseAutosaveOptions<T> {
  roomId: string;
  /** From the room's snapshot: false while the server cannot be reached. */
  online: boolean;
  /** Writes the value; a module-level function (it is a dependency). */
  write: (roomId: string, value: T) => Promise<void>;
  /** The value as a pending edit, kept on the phone until the server has it (module-level too). */
  asPending: (value: T) => PendingEdits;
}

/**
 * Autosave for one room's design or walls: about a second after the last change it writes the
 * value, keeps it on the phone until the server has it (so a restart loses nothing), and writes
 * at once when the screen closes or the app goes to the background.
 */
export function useAutosave<T>({ roomId, online, write, asPending }: UseAutosaveOptions<T>) {
  const uid = useAuth().user?.uid ?? '';
  const [status, setStatus] = useState<SaveStatus>('saved');
  const queue = useRef<Autosave<T> | null>(null);
  const onlineNow = useRef(online);

  // One queue per room. If the effect runs again (Fast Refresh, a new room), the old queue sends
  // what it holds and a new one takes over.
  useEffect(() => {
    const q = new Autosave<T>({
      write: (value) => write(roomId, value),
      onStatus: setStatus,
      onSaved: (value) => void clearPending(uid, roomId, asPending(value)),
    });
    q.setOnline(onlineNow.current);
    queue.current = q;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') q.flush();
    });
    return () => {
      sub.remove();
      q.flush();
      q.dispose();
      if (queue.current === q) queue.current = null;
    };
  }, [uid, roomId, write, asPending]);

  useEffect(() => {
    onlineNow.current = online;
    queue.current?.setOnline(online);
  }, [online]);

  const change = useCallback(
    (value: T) => {
      void setPending(uid, roomId, asPending(value));
      queue.current?.change(value);
    },
    [uid, roomId, asPending],
  );

  return { status, change };
}
