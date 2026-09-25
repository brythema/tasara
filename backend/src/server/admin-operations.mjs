import { getAdminServices } from './firebase-admin.mjs';
import { COLLECTIONS, SELLER_STATUSES } from '../shared/constants.mjs';

export async function provisionAdmin({
  email,
  password,
  name,
  storageBucket,
  serviceAccount
}) {
  const { auth, db } = getAdminServices({ serviceAccount, storageBucket });
  const normalizedEmail = String(email).trim().toLowerCase();

  let user;
  try {
    user = await auth.getUserByEmail(normalizedEmail);
    if (!user) throw new Error('Admin account lookup returned no user.');
    if (password) {
      user = await auth.updateUser(user.uid, { password });
    }
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    user = await auth.createUser({ email: normalizedEmail, password, displayName: name });
  }

  await auth.setCustomUserClaims(user.uid, { admin: true, role: 'admin' });
  await db.collection(COLLECTIONS.USERS).doc(user.uid).set({
    name: String(name || user.displayName || '').trim(),
    email: normalizedEmail,
    role: 'admin',
    createdAt: user.metadata.creationTime ? new Date(user.metadata.creationTime) : new Date(),
    updatedAt: new Date().toISOString()
  }, { merge: true });

  return { uid: user.uid, email: normalizedEmail, role: 'admin' };
}

export async function approveSeller({ uid, reviewerUid, reviewNote = '', storageBucket, serviceAccount }) {
  return decideSeller({ uid, reviewerUid, status: SELLER_STATUSES.APPROVED, reviewNote, storageBucket, serviceAccount });
}

export async function rejectSeller({ uid, reviewerUid, reviewNote = '', storageBucket, serviceAccount }) {
  return decideSeller({ uid, reviewerUid, status: SELLER_STATUSES.REJECTED, reviewNote, storageBucket, serviceAccount });
}

async function decideSeller({ uid, reviewerUid, status, reviewNote, storageBucket, serviceAccount }) {
  if (![SELLER_STATUSES.APPROVED, SELLER_STATUSES.REJECTED].includes(status)) {
    throw new Error(`Unsupported seller decision: ${status}`);
  }
  const { db } = getAdminServices({ serviceAccount, storageBucket });
  const sellerRef = db.collection(COLLECTIONS.SELLERS).doc(uid);
  const snapshot = await sellerRef.get();
  if (!snapshot.exists) throw new Error(`Seller application ${uid} does not exist.`);

  await sellerRef.update({
    status,
    reviewedAt: new Date(),
    reviewedBy: reviewerUid,
    reviewNote: String(reviewNote).trim(),
    updatedAt: new Date()
  });

  return { uid, status };
}

export async function listPendingSellers({ limit = 50, storageBucket, serviceAccount } = {}) {
  const { db } = getAdminServices({ serviceAccount, storageBucket });
  const snapshot = await db.collection(COLLECTIONS.SELLERS)
    .where('status', '==', SELLER_STATUSES.PENDING)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
