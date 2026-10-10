/* Tasara experiment: token-authenticated read proxy for seller documents.
   The "tasara-docs" store is PRIVATE, so a browser cannot fetch a blob URL
   directly. The admin dashboard therefore loads documents through this
   endpoint (same origin), which fetches the blob with the project's
   BLOB_READ_WRITE_TOKEN and streams it back. This is the only path that
   exposes a document, and it only accepts seller-document URLs. */

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

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'The document service is not configured.' });
    return;
  }

  try {
    const upstream = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    res.status(upstream.status === 404 ? 404 : upstream.ok ? 200 : 502);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    if (upstream.ok) {
      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Length', String(bytes.length));
      res.end(bytes);
    } else {
      res.end();
    }
  } catch (error) {
    console.error('tdoc-read failed:', error && error.message);
    res.status(500).json({ error: 'The document could not be retrieved.' });
  }
}
