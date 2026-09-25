import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

export function initializeTasaraAdmin({ serviceAccount, storageBucket } = {}) {
  if (getApps().length) return getApps()[0];

  const credential = serviceAccount ? cert(serviceAccount) : applicationDefault();
  return initializeApp({
    credential,
    ...(storageBucket ? { storageBucket } : {})
  });
}

export function getAdminServices(options = {}) {
  initializeTasaraAdmin(options);
  return Object.freeze({
    auth: getAuth(),
    db: getFirestore(),
    storage: getStorage()
  });
}

export { FieldValue };
