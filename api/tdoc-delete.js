import { BlobNotFoundError, del } from '@vercel/blob';

/* Tasara experiment: removes a stored seller document. Used by the admin
   "Save ID / delete account" flows. A missing blob is not an error — the
   Firestore record is the source of truth and may simply be cleared. */
const SELLER_DOCUMENT_PATH = /^seller-government-id\/[A-Za-z0-9_-]{6,128}\/government-id-\d+\.(?:pdf|jpg|jpeg|png|webp)$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const path = new URL(req.url, 'http://localhost').searchParams.get('path') || '';
  if (!SELLER_DOCUMENT_PATH.test(path)) {
    res.status(400).json({ error: 'A valid seller document path is required.' });
    return;
  }

  try {
    await del(path);
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
