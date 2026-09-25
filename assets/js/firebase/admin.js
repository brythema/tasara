import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { COLLECTIONS, SELLER_STATUSES } from './constants.js';

export function observeSellers({ db, pageSize = 100 }, callback, onError) {
  const q = query(
    collection(db, COLLECTIONS.SELLERS),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );

  return onSnapshot(
    q,
    snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    error => onError?.(error)
  );
}

export async function decideSeller({ db, uid, status, reviewerUid, reviewNote = '' }) {
  if (![SELLER_STATUSES.APPROVED, SELLER_STATUSES.REJECTED].includes(status)) {
    throw new Error('Invalid seller decision.');
  }
  if (!reviewerUid) throw new Error('Administrator identity is missing.');

  await updateDoc(doc(db, COLLECTIONS.SELLERS, uid), {
    status,
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewerUid,
    reviewNote: String(reviewNote).trim(),
    updatedAt: serverTimestamp()
  });
}
