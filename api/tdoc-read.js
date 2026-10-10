/* Tasara: authenticated read path for seller documents.
   The "tasara-docs" store is PRIVATE, so a browser cannot fetch a blob URL
   directly. The admin dashboard therefore loads documents through this
   endpoint: it reads the blob with the SDK's token-authenticated get() and
   streams the bytes back. This is the only path that exposes a document, it
   only accepts seller-document URLs, and it requires the caller's Firebase ID
   token (Bearer header or ?token=, since <img>/downloads cannot set headers)
   WITH the admin custom claim. */
import { get } from '@vercel/blob';
import { verifyRequestToken } from './_lib/auth.js';

function isSellerDocumentUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.pathname.includes('/seller-government-id/')
      && /government-id-\d+\.(?:pdf|jpg|jpeg|png|webp)$/.test(url.pathname);
  } catch (_) {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const url = new URL(req.url, 'http://localhost').searchParams.get('url') || '';
  if (!isSellerDocumentUrl(url)) {
    res.status(400).json({ error: 'A valid seller document URL is required.' });
    return;
  }

  const claims = await verifyRequestToken(req);
  if (!claims) {
    res.status(401).json({ error: 'A valid session token is required.' });
    return;
  }
  if (claims.admin !== true) {
    res.status(403).json({ error: 'Only an Administrator may view this document.' });
    return;
  }

  try {
    const result = await get(url, { access: 'private' });
    if (!result || result.statusCode !== 200) {
      res.status(404).json({ error: 'The document is not available.' });
      return;
    }

    const chunks = [];
    for await (const chunk of result.stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);

    res.status(200);
    res.setHeader('Content-Type', result.blob && result.blob.contentType ? result.blob.contentType : 'application/octet-stream');
    res.setHeader('Content-Length', String(bytes.length));
    /* Government documents must not linger in CDN or browser caches. */
    res.setHeader('Cache-Control', 'no-store');
    res.end(bytes);
  } catch (error) {
    console.error('tdoc-read failed:', error && error.message);
    res.status(500).json({ error: 'The document could not be retrieved.' });
  }
}
