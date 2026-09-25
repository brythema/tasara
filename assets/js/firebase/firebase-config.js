// TASARA Firebase web configuration.
// The values live in firebase-config.json (same folder) and are fetched at
// runtime, keeping configuration data out of application code.
// Firebase web config values are identifiers, not service-account secrets —
// access control is enforced by the Firestore/Storage security rules and the
// project's authorized domains.
let config = {};

try {
  const response = await fetch(new URL('./firebase-config.json', import.meta.url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  config = await response.json();
} catch (error) {
  console.warn('Firebase web configuration could not be loaded:', error.message);
}

export const firebaseConfig = Object.freeze(config);

export const BUYER_TELEGRAM_URL = 'https://t.me/TasaraHub';

const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

export function isFirebaseConfigured() {
  return REQUIRED_KEYS.every(key => {
    const value = firebaseConfig[key];
    return typeof value === 'string' && value.trim() && !value.includes('YOUR_FIREBASE_');
  });
}
