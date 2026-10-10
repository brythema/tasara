# TASARA Firebase Integration Build Notes

This package supersedes the earlier frontend/backend split for the current phase.

## Locked business rules

- Exactly three account roles: `buyer`, `seller`, `admin`.
- Buyers have **no tier** and become active immediately after registration.
- Buyer dashboard contains the community button that opens the existing TASARA Telegram URL.
- Sellers alone choose Tier 1–4.
- Seller tiers: $50 / 5 Omni; $200 / 20 Omni; $500 / 50 Omni; $1,000+ / 100+ Omni.
- Every seller starts `pending`.
- Admin sees pending sellers in realtime.
- Admin approves or rejects.
- Seller sees the decision in realtime without refreshing.
- Seller ID is stored privately in Cloud Storage and can be saved from the admin console.
- All dashboard pages contain a working Firebase logout flow.
- There is one login form; the account role determines the destination.
- No admin login toggle and no browser-side admin access code.

## Architecture

The old `/api/*` calls were removed from the frontend. The website now uses Firebase Authentication, Firestore and Storage directly through small browser ES modules. The Node/Admin SDK remains only for privileged admin provisioning and server-side utilities.

## Files changed / added

- `assets/js/main.js` — presentation/site behavior only.
- `assets/js/firebase/*` — Firebase initialization, auth, roles, seller tiers, profiles, admin operations, and document storage.
- `assets/js/pages/*` — login, signup, buyer dashboard, seller dashboard, admin dashboard.
- `login.html` — one sign-in form + password reset.
- `signup.html` — buyer/seller registration with seller-only tiers.
- `dashboard-*.html` — live Firebase data and role guards.
- `backend/firestore.rules` — atomic registration validation, owner rules, admin rules.
- `backend/storage.rules` — private seller-ID storage and type/size validation.
- `backend/tests/firestore.rules.test.mjs` — rule tests for buyer/seller/admin behavior.
- `stewardship.html` — corrected tier values to dollar-denominated TASARA values.
- Firebase setup and data-model documentation.

## Checks completed in this environment

- All JavaScript files pass `node --check` syntax validation.
- Backend static checks pass.
- Local HTML/CSS/JS reference audit reports no missing local references.
- Legacy `/api`, localStorage token, old field-name and Naira references were removed from application code.
- ZIP archive integrity is checked before delivery.

The Firebase Emulator Suite rules test could not be executed here because npm dependency installation did not complete in the available environment. Run `npm install` and then `npm run test:rules` from `backend/` on the development machine before deploying the rules.

## EXPERIMENT — Vercel Blob document store (2026-10-10)

**Why.** Firebase Storage is unusable on this account (free plan, billing card
rejected by Firebase), so seller government-ID uploads fail while registration
still works. This repository is an experiment: the document upload is routed to
**Vercel Blob** instead of Firebase Storage. The live site (`brythema/tasara` @
`main`, deployed to tasara.africa) is deliberately untouched.

**What changed.**

- `api/tdoc-upload.js` — Vercel function: raw-body POST (`?path=seller-government-id/<uid>/<file>`),
  stores the file in the **private** "tasara-docs" Blob store (`put`,
  `addRandomSuffix: false`) and returns the blob URL. The path input is
  regex-validated to our own shape only.
- `api/tdoc-read.js` — Vercel function: the token-authenticated read proxy.
  The store is private, so a browser can never fetch a blob URL directly; the
  admin dashboard loads documents through this endpoint, which fetches with
  the project's `BLOB_READ_WRITE_TOKEN` and streams the bytes back. Only
  seller-document URLs are accepted.
- `api/tdoc-delete.js` — Vercel function: removes a blob by URL (`del`); a
  missing blob is not an error, and only seller-document URLs are accepted.
- `assets/js/firebase/seller-documents.js` — same four public functions, now
  backed by the endpoints. Firestore's `governmentIdPath` holds the blob URL;
  `governmentIdName/Type` are unchanged, so seller signup and every admin flow
  keep working without knowing the backend.
- `assets/js/firebase/admin.js` — `deleteAccount` removes the document from
  the Blob store before the register record (same order as before).
- `assets/js/pages/dashboard-admin.js` — "View ID" button + inline image
  preview in the seller record (the owner requirement: admin sees the image
  next to the signup details they already have).
- Document size cap: **4 MB** (live site keeps 10 MB). Vercel function request
  bodies are capped near 4.5 MB, so the cap is set under it.

**Required environment.** The Vercel project carries the store's env vars
(`BLOB_READ_WRITE_TOKEN` secret, `BLOB_STORE_ID`), created when the
"tasara-docs" store (team hemabryt, region CPT1, private) was connected to
the project from the dashboard. They are server-side only and never in this
repository. Hobby free quota for the store: 1 GB storage / 10 GB transfer.

**Security model (read before trusting this).**

- The "tasara-docs" store is **private**: raw blob URLs are not readable by
  the open web (the smoke test asserts this). The only read path is
  `api/tdoc-read.js`, which authenticates server-side with the store token.
- The Firestore rules stay strict: `sellers/{uid}` is readable only by the
  seller themselves or an admin (`match /{document=**} allow read, write: if
  false` deny-all catch-all). So the blob URL is never written where ordinary
  users can read it — only owner + admin + the seller themselves.
- The upload and read endpoints are same-origin and path-regex-locked to
  `seller-government-id/<uid>/government-id-<ts>.(jpg|jpeg|png|webp|pdf)`.
- **Caveat (accepted for the experiment):** the read proxy is gated by the
  admin UI, not by a server-side claim check; anyone who can hit the
  endpoint with a valid document URL can read that one document. Document
  URLs are only held in Firestore where the strict rules apply, so this is
  acceptable for the experiment. For a permanent system, add server-side
  Firebase-claim verification to the read proxy.

**Shared Firestore database.** This experiment uses the *same* Firebase
project (`tasara-2c9f4e`) for auth, Firestore and admin claims — only the
document *storage* changed. Consequence: a seller registered on
`tasara-exp` appears in the live admin dashboard too, and the live dashboard's
"Save ID" will fail for them (their document is in the Blob store, not
Storage) — the same failure mode as today's broken Storage uploads. Clean up
test accounts through the experiment admin dashboard when done.

**Deployment.** New Vercel project `tasara-experiment` under team `hemabryt`
(Hobby plan, no card), deployed from this folder via the CLI; the Blob store
connection adds its env vars to both preview and production.

