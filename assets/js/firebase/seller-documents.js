import { doc, getDoc, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { COLLECTIONS, STORAGE_PATHS } from './constants.js';

/* EXPERIMENT: Vercel Blob document store.
   Firebase Storage is unavailable on this project (free plan, no billing
   card), so the government ID is uploaded through same-origin Vercel
   functions (api/tdoc-*) into the Vercel Blob store instead. The Firestore
   fields are unchanged, so the admin dashboard and the seller flows keep
   working without knowing which backend stores the file. */

/* Vercel function request bodies are capped near 4.5 MB, so the experiment
   document cap is 4 MB (a scanned ID fits well under that). The live site
   keeps its 10 MB Firebase cap. */
const MAX_BYTES = 4 * 1024 * 1024;
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
  if (file.size > MAX_BYTES) throw new Error('Government-ID file must be smaller than 4 MB.');
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Government-ID file must be PDF, JPG, PNG, or WEBP.');
}

function sellerDocumentPath(uid, fileName) {
  return STORAGE_PATHS.SELLER_GOVERNMENT_ID(uid, fileName);
}

async function uploadToBlob(path, file) {
  const response = await fetch(`/api/tdoc-upload?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    body: file,
    headers: { 'Content-Type': file.type }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The document upload did not complete.');
  if (!payload.path) throw new Error('The document upload did not complete.');
  return payload.path;
}

async function deleteFromBlob(path) {
  const response = await fetch(`/api/tdoc-delete?path=${encodeURIComponent(path)}`, { method: 'POST' });
  const payload = await response.json().catch(() => ({}));
  /* A missing blob is success (the record may already be cleared); anything
     else is a hard failure the caller decides how to surface. */
  if (response.ok) return;
  throw new Error(payload.error || 'The document could not be removed.');
}

export async function uploadSellerGovernmentId({ db, uid, file }) {
  validateFile(file);
  const extension = fileExtension(file.type);
  const fileName = `government-id-${Date.now()}.${extension}`;
  const path = sellerDocumentPath(uid, fileName);
  const sellerRef = doc(db, COLLECTIONS.SELLERS, uid);
  const previousSnapshot = await getDoc(sellerRef);
  const previousPath = previousSnapshot.exists() ? previousSnapshot.data().governmentIdPath : '';

  await uploadToBlob(path, file);

  try {
    await updateDoc(sellerRef, {
      governmentIdPath: path,
      governmentIdName: String(file.name || fileName),
      governmentIdType: file.type,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    try { await deleteFromBlob(path); } catch (_) { /* best effort */ }
    throw error;
  }

  if (previousPath && previousPath !== path) {
    try { await deleteFromBlob(previousPath); } catch (_) { /* old file cleanup is best effort */ }
  }

  return path;
}

export async function getSellerGovernmentIdDownloadUrl({ path }) {
  if (!path) throw new Error('No government-ID file is attached to this seller.');
  const response = await fetch(`/api/tdoc-url?path=${encodeURIComponent(path)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.url) throw new Error('The document URL could not be retrieved.');
  return payload.url;
}

export async function saveSellerGovernmentId({ path, filename = 'government-id' }) {
  const url = await getSellerGovernmentIdDownloadUrl({ path });
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

export async function deleteSellerGovernmentId({ db, uid, path }) {
  if (!path) return;
  await deleteFromBlob(path);
  await updateDoc(doc(db, COLLECTIONS.SELLERS, uid), {
    governmentIdPath: '',
    governmentIdName: '',
    governmentIdType: '',
    updatedAt: serverTimestamp()
  });
}

/* Backend-agnostic blob removal, used by the admin delete-account flow. */
export async function deleteGovernmentIdBlob(path) {
  if (!path) return;
  await deleteFromBlob(path);
}
