import { doc, getDoc, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { COLLECTIONS, SELLER_STATUSES, STORAGE_PATHS } from './constants.js';

/* EXPERIMENT → PRODUCTION: Vercel Blob document store.
   Firebase Storage is unavailable on this project (free plan, no billing
   card), so the government ID is uploaded through the same-origin Vercel
   function api/tdoc-upload.js into the Vercel Blob store instead. Firestore's
   governmentIdPath now holds the blob URL (the access capability; it embeds
   the unguessable UID), and the admin dashboard works without knowing which
   backend stores the file.

   Every tdoc endpoint requires a Firebase ID token server-side (the read
   proxy also requires the admin claim), so callers must be signed in and the
   functions receive `auth` to mint that token. */

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

async function getAuthToken(auth) {
  if (!auth || !auth.currentUser) throw new Error('Your session has ended. Please sign in again.');
  return auth.currentUser.getIdToken();
}

async function uploadToBlob(path, file, token) {
  const response = await fetch(`/api/tdoc-upload?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    body: file,
    headers: { 'Content-Type': file.type, Authorization: `Bearer ${token}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The document upload did not complete.');
  if (!payload.url) throw new Error('The document upload did not complete.');
  return payload.url;
}

async function deleteFromBlob(documentUrl, token) {
  const response = await fetch(`/api/tdoc-delete?url=${encodeURIComponent(documentUrl)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = await response.json().catch(() => ({}));
  /* A missing blob is success (the record may already be cleared); anything
     else is a hard failure the caller decides how to surface. */
  if (response.ok) return;
  throw new Error(payload.error || 'The document could not be removed.');
}

export async function uploadSellerGovernmentId({ db, auth, uid, file }) {
  validateFile(file);
  const extension = fileExtension(file.type);
  const fileName = `government-id-${Date.now()}.${extension}`;
  const path = STORAGE_PATHS.SELLER_GOVERNMENT_ID(uid, fileName);
  const sellerRef = doc(db, COLLECTIONS.SELLERS, uid);
  const previousSnapshot = await getDoc(sellerRef);
  const previousPath = previousSnapshot.exists() ? previousSnapshot.data().governmentIdPath : '';

  const documentUrl = await uploadToBlob(path, file, await getAuthToken(auth));

  try {
    /* Re-uploading a document is a resubmission: the write re-enters the
       review queue. The self-update rule only allows a seller write to end in
       'pending', so an approved seller reaching this flow would be blocked —
       the upload panel is only shown while not approved anyway. */
    await updateDoc(sellerRef, {
      governmentIdPath: documentUrl,
      governmentIdName: String(file.name || fileName),
      governmentIdType: file.type,
      status: SELLER_STATUSES.PENDING,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    try { await deleteFromBlob(documentUrl, token); } catch (_) { /* best effort */ }
    throw error;
  }

  if (previousPath && previousPath !== documentUrl && isValidDocumentUrl(previousPath)) {
    try { await deleteFromBlob(previousPath, token); } catch (_) { /* old file cleanup is best effort */ }
  }

  return documentUrl;
}

export async function getSellerGovernmentIdDownloadUrl({ path, token }) {
  if (!path) throw new Error('No government-ID file is attached to this seller.');
  /* The store is private, so the browser never fetches the blob URL directly.
     The stored value is wrapped in the same-origin read proxy, which requires
     the caller's ID token AND the admin claim; <img>, View and Save all use
     that URL. */
  if (!isValidDocumentUrl(path)) throw new Error('The stored document URL is invalid.');
  if (!token) throw new Error('Your session has ended. Please sign in again.');
  return `/api/tdoc-read?url=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`;
}

export async function saveSellerGovernmentId({ auth, path, filename = 'government-id' }) {
  const url = await getSellerGovernmentIdDownloadUrl({ path, token: await getAuthToken(auth) });
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

export async function deleteSellerGovernmentId({ db, auth, uid, path }) {
  if (!path) return;
  await deleteFromBlob(path, await getAuthToken(auth));
  await updateDoc(doc(db, COLLECTIONS.SELLERS, uid), {
    governmentIdPath: '',
    governmentIdName: '',
    governmentIdType: '',
    updatedAt: serverTimestamp()
  });
}

/* Backend-agnostic blob removal, used by the admin delete-account flow. */
export async function deleteGovernmentIdBlob(path, auth) {
  if (!path) return;
  await deleteFromBlob(path, await getAuthToken(auth));
}
