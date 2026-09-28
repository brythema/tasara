import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {
  deleteObject,
  ref
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';
import { COLLECTIONS, SELLER_STATUSES } from './constants.js';

/* The register loads in one pass. Keep the ceiling in mind: past this many
   accounts the list needs cursor paging instead of a wider limit. */
const REGISTER_PAGE_SIZE = 500;

export function observeBuyers({ db, pageSize = REGISTER_PAGE_SIZE }, callback, onError) {
  const q = query(
    collection(db, COLLECTIONS.BUYERS),
    orderBy('createdAt', 'asc'),
    limit(pageSize)
  );

  return onSnapshot(
    q,
    snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    error => onError?.(error)
  );
}

export function observeSellers({ db, pageSize = REGISTER_PAGE_SIZE }, callback, onError) {
  const q = query(
    collection(db, COLLECTIONS.SELLERS),
    orderBy('createdAt', 'asc'),
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

/**
 * Administrator-only removal of an account.
 *
 * Order matters: the stored government ID is deleted first, so a failure there
 * aborts before any register record disappears.
 *
 * Removing the Firebase Authentication account itself needs the Admin SDK, which
 * a browser client cannot call, so the result reports `authDeleted: false` and the
 * caller must surface that. The sign-in account will still exist until a server
 * side job removes it.
 *
 * @returns {Promise<{ authDeleted: boolean }>}
 */
export async function deleteAccount({ db, storage, uid, role, governmentIdPath = '' }) {
  if (!uid) throw new Error('A user id is required.');
  if (role !== 'buyer' && role !== 'seller') throw new Error('A valid account role is required.');

  if (storage && governmentIdPath) {
    try {
      await deleteObject(ref(storage, governmentIdPath));
    } catch (error) {
      if (error && error.code !== 'storage/object-not-found') throw error;
    }
  }

  const collectionName = role === 'buyer' ? COLLECTIONS.BUYERS : COLLECTIONS.SELLERS;
  await deleteDoc(doc(db, collectionName, uid));
  await deleteDoc(doc(db, COLLECTIONS.USERS, uid));

  return { authDeleted: false };
}
