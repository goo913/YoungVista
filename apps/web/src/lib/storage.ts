import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { emulatorHost, firebaseApp } from './firebase';

/** Cloud Storage, in its own chunk: only the room page's picture gallery loads it. */
export const storage = getStorage(firebaseApp());
if (emulatorHost) connectStorageEmulator(storage, emulatorHost, 9199);
