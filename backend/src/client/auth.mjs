import {
  createUserWithEmailAndPassword,
  deleteUser,
  getIdTokenResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { ROLES, COLLECTIONS, SELLER_STATUSES } from '../shared/constants.mjs';
import { getSellerTier } from '../shared/tiers.mjs';

function cleanEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function baseProfileData({ name, email, phone = '', address = '', role }) {
  if (![ROLES.BUYER, ROLES.SELLER].includes(role)) {
    throw new Error('Public account role must be buyer or seller.');
  }
  return {
    name: String(name ?? '').trim(),
    email: cleanEmail(email),
    phone: String(phone ?? '').trim(),
    address: String(address ?? '').trim(),
    role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

export async function registerBuyer({ auth, db, name, email, password, phone, address }) {
  const credential = await createUserWithEmailAndPassword(auth, cleanEmail(email), password);
  const uid = credential.user.uid;
  const userData = baseProfileData({ name, email, phone, address, role: ROLES.BUYER });
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, COLLECTIONS.USERS, uid), userData);
    batch.set(doc(db, COLLECTIONS.BUYERS, uid), {
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      address: userData.address,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await batch.commit();
    return credential.user;
  } catch (error) {
    try { await deleteUser(credential.user); } catch (_) {}
    throw error;
  }
}

export async function registerSeller({ auth, db, name, email, password, phone, address, businessName, businessLocation, tier }) {
  const resolvedTier = getSellerTier(tier);
  const credential = await createUserWithEmailAndPassword(auth, cleanEmail(email), password);
  const uid = credential.user.uid;
  const userData = baseProfileData({ name, email, phone, address, role: ROLES.SELLER });
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, COLLECTIONS.USERS, uid), userData);
    batch.set(doc(db, COLLECTIONS.SELLERS, uid), {
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      address: userData.address,
      businessName: String(businessName ?? '').trim(),
      businessLocation: String(businessLocation ?? '').trim(),
      tier: resolvedTier.id,
      status: SELLER_STATUSES.PENDING,
      governmentIdPath: '',
      governmentIdName: '',
      governmentIdType: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await batch.commit();
    return credential.user;
  } catch (error) {
    try { await deleteUser(credential.user); } catch (_) {}
    throw error;
  }
}

export async function signIn({ auth, db, email, password }) {
  const credential = await signInWithEmailAndPassword(auth, cleanEmail(email), password);
  const userSnapshot = await getDoc(doc(db, COLLECTIONS.USERS, credential.user.uid));
  if (!userSnapshot.exists()) {
    await signOut(auth);
    throw new Error('Account profile is missing. Please contact TASARA support.');
  }

  const profile = userSnapshot.data();
  if (![ROLES.BUYER, ROLES.SELLER, ROLES.ADMIN].includes(profile.role)) {
    await signOut(auth);
    throw new Error('This account does not have a valid TASARA role.');
  }
  if (profile.role === ROLES.ADMIN) {
    const tokenResult = await getIdTokenResult(credential.user);
    if (tokenResult.claims.admin !== true) {
      await signOut(auth);
      throw new Error('This account is not provisioned for administrator access.');
    }
  }
  return Object.freeze({ authUser: credential.user, profile });
}

export async function getCurrentProfile({ auth, db }) {
  if (!auth.currentUser) return null;
  const snapshot = await getDoc(doc(db, COLLECTIONS.USERS, auth.currentUser.uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export function observeAuth({ auth }, callback) { return onAuthStateChanged(auth, callback); }
export function logout({ auth }) { return signOut(auth); }
export function resetPassword({ auth, email }) { return sendPasswordResetEmail(auth, cleanEmail(email)); }
