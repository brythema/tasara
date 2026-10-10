import { getDownloadUrl } from '@vercel/blob';

/* Tasara experiment: returns a viewable URL for a stored seller document.
   The admin dashboard renders the document image from this URL next to the
   signup details it already has from Firestore. */
const SELLER_DOCUMENT_PATH = /^seller-government-id\/[A-Za-z0-9_-]{6,128}\/government-id-\d+\.(?:pdf|jpg|jpeg|png|webp)$/;

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const path = new URL(req.url, 'http://localhost').searchParams.get('path') || '';
  if (!SELLER_DOCUMENT_PATH.test(path)) {
    res.status(400).json({ error: 'A valid seller document path is required.' });
    return;
  }

  res.json({ path, url: getDownloadUrl(path) });
}
