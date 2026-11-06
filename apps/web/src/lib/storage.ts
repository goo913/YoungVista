import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { emulatorHost, emulatorPorts, firebaseApp } from './firebase';

/** Cloud Storage, in its own chunk: only the room page (pictures, deleting a room) loads it. */
export const storage = getStorage(firebaseApp());
if (emulatorHost) connectStorageEmulator(storage, emulatorHost, emulatorPorts.storage);
