import {
  createUserWithEmailAndPassword,
  deleteUser,
  getIdTokenResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { COLLECTIONS, ROLES, SELLER_STATUSES } from './constants.js';
import { getSellerTier } from './tiers.js';
import { allocateAccountNumber } from './accounts.js';

function cleanEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function commonProfile({ name, email, phone, address, role, accountNumber }) {
  return {
    name: String(name ?? '').trim(),
    email: cleanEmail(email),
    phone: String(phone ?? '').trim(),
    address: String(address ?? '').trim(),
    role,
    accountNumber,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function validateCommon({ name, email, password, phone, address }) {
  if (!String(name ?? '').trim() || !cleanEmail(email) || !String(phone ?? '').trim() || !String(address ?? '').trim()) {
    throw new Error('Please complete every required field.');
  }
  if (String(password ?? '').length < 8) throw new Error('Password must be at least 8 characters.');
}

export async function registerBuyer({ auth, db, name, email, password, phone, address }) {
  validateCommon({ name, email, password, phone, address });
  const credential = await createUserWithEmailAndPassword(auth, cleanEmail(email), password);
  const uid = credential.user.uid;

  try {
    // Reserved inside the try so a failed registration still cleans up the auth user.
    const accountNumber = await allocateAccountNumber({ db });
    const profile = commonProfile({ name, email, phone, address, role: ROLES.BUYER, accountNumber });

    const batch = writeBatch(db);
    batch.set(doc(db, COLLECTIONS.USERS, uid), profile);
    batch.set(doc(db, COLLECTIONS.BUYERS, uid), {
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
      accountNumber,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await batch.commit();
    return credential.user;
  } catch (error) {
    try { await deleteUser(credential.user); } catch (_) { /* best-effort cleanup */ }
    throw error;
  }
}

export async function registerSeller({
  auth,
  db,
  name,
  email,
  password,
  phone,
  address,
  businessName,
  businessLocation,
  tier
}) {
  validateCommon({ name, email, password, phone, address });
  if (!String(businessName ?? '').trim() || !String(businessLocation ?? '').trim()) {
    throw new Error('Please complete the business details.');
  }
  const resolvedTier = getSellerTier(tier);
  const credential = await createUserWithEmailAndPassword(auth, cleanEmail(email), password);
  const uid = credential.user.uid;

  try {
    const accountNumber = await allocateAccountNumber({ db });
    const profile = commonProfile({ name, email, phone, address, role: ROLES.SELLER, accountNumber });

    const batch = writeBatch(db);
    batch.set(doc(db, COLLECTIONS.USERS, uid), profile);
    batch.set(doc(db, COLLECTIONS.SELLERS, uid), {
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
      businessName: String(businessName).trim(),
      businessLocation: String(businessLocation).trim(),
      tier: resolvedTier.id,
      status: SELLER_STATUSES.PENDING,
      accountNumber,
      governmentIdPath: '',
      governmentIdName: '',
      governmentIdType: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await batch.commit();
    return credential.user;
  } catch (error) {
    try { await deleteUser(credential.user); } catch (_) { /* best-effort cleanup */ }
    throw error;
  }
}

export async function signIn({ auth, db, email, password }) {
  const credential = await signInWithEmailAndPassword(auth, cleanEmail(email), password);
  const snapshot = await getDoc(doc(db, COLLECTIONS.USERS, credential.user.uid));

  if (!snapshot.exists()) {
    await signOut(auth);
    throw new Error('Account profile is missing. Please contact TASARA support.');
  }

  const profile = snapshot.data();
  if (![ROLES.BUYER, ROLES.SELLER, ROLES.ADMIN].includes(profile.role)) {
    await signOut(auth);
    throw new Error('This account does not have a valid TASARA role.');
  }

  if (profile.role === ROLES.ADMIN) {
    const tokenResult = await getIdTokenResult(credential.user);
    if (tokenResult.claims.admin !== true) {
      await signOut(auth);
      throw new Error('This account is marked as admin but is not provisioned for administrator access.');
    }
  }

  return Object.freeze({ authUser: credential.user, profile });
}

export async function getCurrentProfile({ auth, db }) {
  if (!auth.currentUser) return null;
  const snapshot = await getDoc(doc(db, COLLECTIONS.USERS, auth.currentUser.uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export function observeAuth({ auth }, callback) {
  return onAuthStateChanged(auth, callback);
}

export function logout({ auth }) {
  return signOut(auth);
}

export function resetPassword({ auth, email }) {
  return sendPasswordResetEmail(auth, cleanEmail(email));
}

export function getUserFriendlyAuthError(error) {
  const code = String(error?.code || '');
  const messages = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/invalid-login-credentials': 'Email or password is incorrect.',
    'auth/user-not-found': 'No TASARA account was found for that email.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'An account already exists with this email address.',
    'auth/weak-password': 'Firebase rejected this password as too weak. Use at least 8 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a little and try again.',
    'auth/network-request-failed': 'Network connection failed. Check your connection and try again.',
    'auth/operation-not-allowed': 'Email/password sign-in is not enabled in this Firebase project.'
  };
  return messages[code] || error?.message || 'Something went wrong. Please try again.';
}
