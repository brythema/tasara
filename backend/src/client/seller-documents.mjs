import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from 'firebase/storage';
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { COLLECTIONS, STORAGE_PATHS } from '../shared/constants.mjs';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function extensionFor(type) {
  return ({
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  })[type] || 'bin';
}

function validateFile(file) {
  if (!file) throw new Error('A government-ID file is required.');
  if (file.size > MAX_BYTES) throw new Error('Government-ID file must be smaller than 10 MB.');
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Government-ID file must be PDF, JPG, PNG, or WEBP.');
}

export async function uploadSellerGovernmentId({ storage, db, uid, file }) {
  validateFile(file);
  const fileName = `government-id-${Date.now()}.${extensionFor(file.type)}`;
  const path = STORAGE_PATHS.SELLER_GOVERNMENT_ID(uid, fileName);
  const sellerRef = doc(db, COLLECTIONS.SELLERS, uid);
  const sellerSnapshot = await getDoc(sellerRef);
  const previousPath = sellerSnapshot.exists() ? sellerSnapshot.data().governmentIdPath : '';
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file, { contentType: file.type });
  try {
    await updateDoc(sellerRef, {
      governmentIdPath: path,
      governmentIdName: String(file.name || fileName),
      governmentIdType: file.type,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    try { await deleteObject(storageRef); } catch (_) {}
    throw error;
  }

  if (previousPath && previousPath !== path) {
    try { await deleteObject(ref(storage, previousPath)); } catch (_) {}
  }
  return path;
}

export function getSellerGovernmentIdDownloadUrl({ storage, path }) {
  if (!path) throw new Error('Seller government-ID path is missing.');
  return getDownloadURL(ref(storage, path));
}
