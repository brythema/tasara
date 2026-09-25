import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { COLLECTIONS, SELLER_STATUSES } from '../shared/constants.mjs';

function assertStatus(status) {
  if (![SELLER_STATUSES.APPROVED, SELLER_STATUSES.REJECTED].includes(status)) {
    throw new Error(`Unsupported seller decision: ${status}`);
  }
}

export function observePendingSellers({ db, pageSize = 50 }, callback) {
  const q = query(
    collection(db, COLLECTIONS.SELLERS),
    where('status', '==', SELLER_STATUSES.PENDING),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );

  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  });
}

export async function decideSeller({ db, uid, status, reviewNote = '', reviewerUid }) {
  assertStatus(status);
  if (!reviewerUid) throw new Error('reviewerUid is required.');

  const sellerRef = doc(db, COLLECTIONS.SELLERS, uid);
  const sellerSnapshot = await getDoc(sellerRef);
  if (!sellerSnapshot.exists()) throw new Error('Seller application not found.');

  await updateDoc(sellerRef, {
    status,
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewerUid,
    reviewNote: String(reviewNote).trim(),
    updatedAt: serverTimestamp()
  });
}

export async function approveSeller({ db, uid, reviewerUid, reviewNote = '' }) {
  return decideSeller({ db, uid, status: SELLER_STATUSES.APPROVED, reviewerUid, reviewNote });
}

export async function rejectSeller({ db, uid, reviewerUid, reviewNote = '' }) {
  return decideSeller({ db, uid, status: SELLER_STATUSES.REJECTED, reviewerUid, reviewNote });
}
