import { getApps, getApp, initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

let services;

export function getFirebaseServices() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not connected yet. Check that assets/js/firebase/firebase-config.json is present and served correctly.');
  }

  if (!services) {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    services = Object.freeze({
      app,
      auth: getAuth(app),
      db: getFirestore(app),
      storage: getStorage(app)
    });
  }

  return services;
}
