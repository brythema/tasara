import { put } from '@vercel/blob';

/* Tasara experiment: Vercel Blob document store (replaces Firebase Storage).
   Sellers upload the government ID to this endpoint; the function stores it
   in the PRIVATE "tasara-docs" Blob store (team hemabryt, region cpt1, token
   from the BLOB_READ_WRITE_TOKEN project env) and reports the blob URL. That
   URL — which embeds the unguessable Firebase UID — is what Firestore's
   governmentIdPath now holds. Reading it always goes through api/tdoc-read.js
   (token-authenticated), so the document is never exposed to the open web.

   Upload cap is 4 MB: Vercel serverless function request bodies are capped at
   about 4.5 MB, and a scanned ID fits comfortably in 4 MB. The client
   (seller-documents.js) enforces the same cap before sending. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/* Only our own document paths may be written. This keeps the endpoint from
   becoming a general file sink. */
const SELLER_DOCUMENT_PATH = /^seller-government-id\/[A-Za-z0-9_-]{6,128}\/government-id-\d+\.(?:pdf|jpg|jpeg|png|webp)$/;

/* Content types are derived from the (validated) file extension, never from
   request headers — the header can be normalized away before the function
   sees it. The upload is only ever a seller document, so this is complete. */
const EXTENSION_CONTENT_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES + 512 * 1024) {
        reject(new Error('payload-too-large'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const path = new URL(req.url, 'http://localhost').searchParams.get('path') || '';
    if (!SELLER_DOCUMENT_PATH.test(path)) {
      res.status(400).json({ error: 'A valid seller document path is required.' });
      return;
    }

    const body = await readRawBody(req);
    if (body.length === 0) {
      res.status(400).json({ error: 'The uploaded file is empty.' });
      return;
    }
    if (body.length > MAX_UPLOAD_BYTES) {
      res.status(413).json({ error: 'The file exceeds the 4 MB experiment limit.' });
      return;
    }

    /* The extension is already validated by SELLER_DOCUMENT_PATH, so mapping
       it to a content type is safe and independent of the (unreliable)
       request Content-Type header, which Blob/undici bodies can override. */
    const extension = path.split('.').pop();
    const contentType = EXTENSION_CONTENT_TYPES[extension] || 'application/octet-stream';
    const blob = await put(path, body, {
      access: 'private',
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false
    });

    res.status(201).json({ path: blob.pathname, url: blob.url });
  } catch (error) {
    console.error('tdoc-upload failed:', error && error.message);
    res.status(500).json({ error: 'The document upload did not complete.' });
  }
}
