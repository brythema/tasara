import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SELLER_TIERS } from '../src/shared/tiers.mjs';
import { ROLES, SELLER_STATUSES } from '../src/shared/constants.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const requiredFiles = [
  'firebase.json',
  'firestore.rules',
  'firestore.indexes.json',
  'storage.rules',
  'src/client/create-firebase.mjs',
  'src/client/auth.mjs',
  'src/client/profiles.mjs',
  'src/client/admin.mjs',
  'src/client/seller-documents.mjs',
  'src/server/firebase-admin.mjs',
  'src/server/admin-operations.mjs'
];

for (const rel of requiredFiles) {
  try {
    await fs.access(path.join(root, rel));
  } catch {
    throw new Error(`Missing required backend file: ${rel}`);
  }
}

if (Object.keys(SELLER_TIERS).length !== 4) throw new Error('Expected exactly four seller tiers.');
if (SELLER_TIERS[1].stakeDisplay !== '$50' || SELLER_TIERS[1].omniDisplay !== '5') throw new Error('Tier 1 mismatch.');
if (SELLER_TIERS[2].stakeDisplay !== '$200' || SELLER_TIERS[2].omniDisplay !== '20') throw new Error('Tier 2 mismatch.');
if (SELLER_TIERS[3].stakeDisplay !== '$500' || SELLER_TIERS[3].omniDisplay !== '50') throw new Error('Tier 3 mismatch.');
if (SELLER_TIERS[4].stakeDisplay !== '$1,000+' || SELLER_TIERS[4].omniDisplay !== '100+') throw new Error('Tier 4 mismatch.');

const buyerProfile = { name: 'Buyer', email: 'buyer@example.com', phone: '', address: '', role: ROLES.BUYER };
if ('tier' in buyerProfile) throw new Error('Buyer baseline unexpectedly includes tier.');

if (!Object.values(SELLER_STATUSES).every(status => ['pending', 'approved', 'rejected'].includes(status))) {
  throw new Error('Seller status configuration is incomplete.');
}

const rules = await Promise.all(['firestore.rules', 'storage.rules'].map(file => fs.readFile(path.join(root, file), 'utf8')));
for (const text of rules) {
  if (!text.includes("rules_version = '2';")) throw new Error('Rules file is not rules v2.');
  if (/NGN|₦/i.test(text)) throw new Error('Backend rules contain unexpected Naira references.');
}

const firestoreRules = rules[0];
if (!firestoreRules.includes('getAfter(/databases/$(database)/documents/users/$(uid))')) {
  throw new Error('Registration rules must validate the atomic user role with getAfter().');
}
if (!firestoreRules.includes("afterUserRole(uid) == 'seller'")) throw new Error('Seller role validation is missing.');
if (firestoreRules.includes("data.tier == request.resource.data.tier") && !firestoreRules.includes('sellers/{uid}')) {
  throw new Error('Unexpected tier rule structure.');
}

console.log('TASARA backend static checks passed.');
console.log('Roles:', Object.values(ROLES).join(', '));
console.log('Seller statuses:', Object.values(SELLER_STATUSES).join(', '));
console.log('Seller tiers:', Object.values(SELLER_TIERS).map(t => `${t.id}:${t.stakeDisplay}/${t.omniDisplay}`).join(' | '));
