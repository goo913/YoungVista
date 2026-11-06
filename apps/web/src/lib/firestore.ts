import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { emulatorHost, emulatorPorts, firebaseApp } from './firebase';

/** Firestore lives in its own chunk: only the pages that read rooms or shares load it. */
export const db = getFirestore(firebaseApp());
if (emulatorHost) connectFirestoreEmulator(db, emulatorHost, emulatorPorts.firestore);
