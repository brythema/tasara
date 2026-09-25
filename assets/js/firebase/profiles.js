import { doc, getDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { COLLECTIONS } from './constants.js';

export async function getUserProfile({ db, uid }) {
  const snapshot = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export function observeBuyer({ db, uid }, callback, onError) {
  return onSnapshot(
    doc(db, COLLECTIONS.BUYERS, uid),
    snapshot => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    error => onError?.(error)
  );
}

export function observeSeller({ db, uid }, callback, onError) {
  return onSnapshot(
    doc(db, COLLECTIONS.SELLERS, uid),
    snapshot => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    error => onError?.(error)
  );
}
