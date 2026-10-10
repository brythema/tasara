import { doc, getDoc, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { COLLECTIONS, STORAGE_PATHS } from './constants.js';

/* EXPERIMENT: Vercel Blob document store.
   Firebase Storage is unavailable on this project (free plan, no billing
   card), so the government ID is uploaded through the same-origin Vercel
   function api/tdoc-upload.js into the Vercel Blob store instead. Firestore's
   governmentIdPath now holds the blob URL (the access capability; it embeds
   the unguessable UID), and the admin dashboard works without knowing which
   backend stores the file. */

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

function isValidDocumentUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.pathname.includes('/seller-government-id/')
      && /government-id-\d+\.(?:pdf|jpg|jpeg|png|webp)$/.test(url.pathname);
  } catch (_) {
    return false;
  }
}

async function uploadToBlob(path, file) {
  const response = await fetch(`/api/tdoc-upload?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    body: file,
    headers: { 'Content-Type': file.type }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The document upload did not complete.');
  if (!payload.url) throw new Error('The document upload did not complete.');
  return payload.url;
}

async function deleteFromBlob(documentUrl) {
  const response = await fetch(`/api/tdoc-delete?url=${encodeURIComponent(documentUrl)}`, { method: 'POST' });
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
  const path = STORAGE_PATHS.SELLER_GOVERNMENT_ID(uid, fileName);
  const sellerRef = doc(db, COLLECTIONS.SELLERS, uid);
  const previousSnapshot = await getDoc(sellerRef);
  const previousPath = previousSnapshot.exists() ? previousSnapshot.data().governmentIdPath : '';

  const documentUrl = await uploadToBlob(path, file);

  try {
    await updateDoc(sellerRef, {
      governmentIdPath: documentUrl,
      governmentIdName: String(file.name || fileName),
      governmentIdType: file.type,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    try { await deleteFromBlob(documentUrl); } catch (_) { /* best effort */ }
    throw error;
  }

  if (previousPath && previousPath !== documentUrl && isValidDocumentUrl(previousPath)) {
    try { await deleteFromBlob(previousPath); } catch (_) { /* old file cleanup is best effort */ }
  }

  return documentUrl;
}

export async function getSellerGovernmentIdDownloadUrl({ path }) {
  if (!path) throw new Error('No government-ID file is attached to this seller.');
  /* EXPERIMENT: the store is private, so the browser never fetches the blob
     URL directly. The stored value is wrapped in the token-authenticated
     same-origin read proxy; <img>, View and Save all use that URL. */
  if (!isValidDocumentUrl(path)) throw new Error('The stored document URL is invalid.');
  return `/api/tdoc-read?url=${encodeURIComponent(path)}`;
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
