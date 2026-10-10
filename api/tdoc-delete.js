import { BlobNotFoundError, del } from '@vercel/blob';

/* Tasara experiment: removes a stored seller document from the Vercel Blob
   store. The Firestore governmentIdPath field holds the blob URL itself
   (the capability), so deletion takes a URL. A missing blob is not an error
   — the Firestore record is the source of truth and may simply be cleared. */

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
