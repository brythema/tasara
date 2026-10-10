/* Shared server-side auth for the tdoc endpoints. Every endpoint requires a
   Firebase ID token; the read proxy additionally requires the admin custom
   claim. Tokens arrive as an Authorization: Bearer header, or — for <img>
   previews and downloads, which cannot set headers — a ?token= query
   parameter.

   Verification follows Firebase's documented rules for ID tokens: RS256
   signature against the securetoken service account's public certificates
   (the same x509 map firebase-admin uses, cached with the endpoint's
   max-age and refetched once on an unknown key id for rotation), issuer
   https://securetoken.google.com/<project>, audience <project>, and jose's
   expiry check. firebase-admin itself is deliberately NOT a dependency: its
   jwks-rsa chain pulls an ESM-only jose that Vercel's function runtime
   cannot require(). The project id is public web-config data. */
import { createPublicKey } from 'node:crypto';
import { jwtVerify } from 'jose';

const PROJECT_ID = 'tasara-2c9f4e';
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certCache = { certs: null, expires: 0 };

async function publicKeys() {
  if (certCache.certs && Date.now() < certCache.expires) return certCache.certs;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`public key fetch failed with ${res.status}`);
  const certs = await res.json();
  const maxAge = Number((res.headers.get('cache-control') || 'max-age=1800').match(/max-age=(\d+)/)?.[1] || 1800);
  certCache = { certs, expires: Date.now() + maxAge * 1000 };
  return certs;
}

function tokenKeyId(token) {
  const headerPart = token.split('.')[0];
  return JSON.parse(Buffer.from(headerPart, 'base64url').toString()).kid || '';
}

/* Returns { uid, admin } for a valid token, or null when absent/invalid. */
export async function verifyRequestToken(req) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const queryToken = new URL(req.url, 'http://localhost').searchParams.get('token') || '';
  const token = bearer || queryToken.trim();
  if (!token) return null;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const certs = await publicKeys();
      const pem = certs[tokenKeyId(token)];
      if (!pem) {
        /* Unknown key id: the cache may predate a rotation — refetch once. */
        if (attempt === 0) { certCache = { certs: null, expires: 0 }; continue; }
        return null;
      }
      const { payload } = await jwtVerify(token, createPublicKey(pem), {
        algorithms: ['RS256'],
        issuer: `https://securetoken.google.com/${PROJECT_ID}`,
        audience: PROJECT_ID
      });
      if (!payload.sub) return null;
      return { uid: payload.sub, admin: payload.admin === true };
    }
    return null;
  } catch (error) {
    console.error('tdoc token verification failed:', error && error.code ? error.code : error && error.message);
    return null;
  }
}

/* The UID embedded in a seller-document path or blob URL. */
export function documentOwnerUid(value) {
  const match = String(value).match(/seller-government-id\/([A-Za-z0-9_-]{6,128})\//);
  return match ? match[1] : '';
}
