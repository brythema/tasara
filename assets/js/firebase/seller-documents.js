import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';
import { doc, getDoc, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { COLLECTIONS, STORAGE_PATHS } from './constants.js';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function fileExtension(type) {
  return ({
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  })[type] || 'bin';
}

function validateFile(file) {
  if (!file) throw new Error('A government-issued ID is required.');
  if (file.size > MAX_BYTES) throw new Error('Government-ID file must be smaller than 10 MB.');
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Government-ID file must be PDF, JPG, PNG, or WEBP.');
}

export async function uploadSellerGovernmentId({ storage, db, uid, file }) {
  validateFile(file);
  const extension = fileExtension(file.type);
  const fileName = `government-id-${Date.now()}.${extension}`;
  const path = STORAGE_PATHS.SELLER_GOVERNMENT_ID(uid, fileName);
  const storageRef = ref(storage, path);
  const sellerRef = doc(db, COLLECTIONS.SELLERS, uid);
  const previousSnapshot = await getDoc(sellerRef);
  const previousPath = previousSnapshot.exists() ? previousSnapshot.data().governmentIdPath : '';

  await uploadBytes(storageRef, file, { contentType: file.type });

  try {
    await updateDoc(sellerRef, {
      governmentIdPath: path,
      governmentIdName: String(file.name || fileName),
      governmentIdType: file.type,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    try { await deleteObject(storageRef); } catch (_) { /* best effort */ }
    throw error;
  }

  if (previousPath && previousPath !== path) {
    try { await deleteObject(ref(storage, previousPath)); } catch (_) { /* old file cleanup is best effort */ }
  }

  return path;
}

export async function getSellerGovernmentIdDownloadUrl({ storage, path }) {
  if (!path) throw new Error('No government-ID file is attached to this seller.');
  return getDownloadURL(ref(storage, path));
}

export async function saveSellerGovernmentId({ storage, path, filename = 'government-id' }) {
  const url = await getSellerGovernmentIdDownloadUrl({ storage, path });
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'government-id';
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return url;
}

export async function deleteSellerGovernmentId({ storage, db, uid, path }) {
  if (!path) return;
  await deleteObject(ref(storage, path));
  await updateDoc(doc(db, COLLECTIONS.SELLERS, uid), {
    governmentIdPath: '',
    governmentIdName: '',
    governmentIdType: '',
    updatedAt: serverTimestamp()
  });
}
