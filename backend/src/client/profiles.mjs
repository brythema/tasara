import {
  doc,
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { COLLECTIONS } from '../shared/constants.mjs';

export async function getUserProfile({ db, uid }) {
  const snapshot = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export function observeSeller({ db, uid }, callback) {
  return onSnapshot(doc(db, COLLECTIONS.SELLERS, uid), snapshot => {
    callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  });
}

export function observeBuyer({ db, uid }, callback) {
  return onSnapshot(doc(db, COLLECTIONS.BUYERS, uid), snapshot => {
    callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  });
}
