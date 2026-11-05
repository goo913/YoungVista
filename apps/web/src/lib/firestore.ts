import { getFirestore } from 'firebase/firestore';
import { firebaseApp } from './firebase';

/** Firestore lives in its own chunk: only the signed-in pages load it. */
export const db = getFirestore(firebaseApp());
