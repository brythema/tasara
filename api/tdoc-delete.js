import { BlobNotFoundError, del } from '@vercel/blob';
import { documentOwnerUid, verifyRequestToken } from './_lib/auth.js';

/* Tasara: removes a stored seller document from the Vercel Blob store. The
   Firestore governmentIdPath field holds the blob URL itself (the
   capability), so deletion takes a URL. A missing blob is not an error — the
   Firestore record is the source of truth and may simply be cleared.

   PRODUCTION hardening: the caller must present a valid Firebase ID token
   (Bearer header) and be either the document's owner (UID in the path) or an
   Administrator (custom claim). */

function isValidDocumentUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:'
      && url.pathname.includes('/seller-government-id/')
      && /government-id-\d+\.(?:pdf|jpg|jpeg|png|webp)$/.test(url.pathname)
    );
  } catch (_) {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const url = new URL(req.url, 'http://localhost').searchParams.get('url') || '';
  if (!isValidDocumentUrl(url)) {
    res.status(400).json({ error: 'A valid seller document URL is required.' });
    return;
  }

  const claims = await verifyRequestToken(req);
  if (!claims) {
    res.status(401).json({ error: 'A valid session token is required.' });
    return;
  }
  const ownerUid = documentOwnerUid(url);
  if (claims.admin !== true && claims.uid !== ownerUid) {
    res.status(403).json({ error: 'Only the document owner or an Administrator may remove it.' });
    return;
  }

  try {
    await del(url);
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof BlobNotFoundError || error.name === 'BlobNotFoundError') {
      res.json({ ok: false, missing: true });
      return;
    }
    console.error('tdoc-delete failed:', error && error.message);
    res.status(500).json({ error: 'The document could not be removed.' });
  }
}
