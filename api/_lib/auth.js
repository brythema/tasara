/* Shared server-side auth for the tdoc endpoints. Every endpoint requires a
   Firebase ID token; the read proxy additionally requires the admin custom
   claim. Tokens arrive as an Authorization: Bearer header, or — for <img>
   previews and downloads, which cannot set headers — a ?token= query
   parameter. The service-account credential comes from the
   FIREBASE_SERVICE_ACCOUNT project env (JSON string), never from this repo. */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const APP_NAME = 'tdoc-auth';
let authInstance;

function getFirebaseAuth() {
  if (!authInstance) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const app = getApps().some(a => a.name === APP_NAME)
      ? getApps().find(a => a.name === APP_NAME)
      : initializeApp({ credential: cert(serviceAccount) }, APP_NAME);
    authInstance = getAuth(app);
  }
  return authInstance;
}

/* Returns the decoded token, or null when absent/invalid. */
export async function verifyRequestToken(req) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const queryToken = new URL(req.url, 'http://localhost').searchParams.get('token') || '';
  const token = bearer || queryToken.trim();
  if (!token) return null;
  try {
    return await getFirebaseAuth().verifyIdToken(token);
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
