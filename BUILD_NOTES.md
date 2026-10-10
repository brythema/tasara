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

## MIGRATION — Vercel Blob document store to production (2026-10-10)

The 2026-10-10 Blob experiment (repo `tasara-experiment`, tasara-experiment.vercel.app)
was validated end-to-end and promoted into this repository the same day. The
document store history is preserved commit-for-commit: the seven experiment
commits were cherry-picked onto `main`, then hardened.

**What runs now.**

- `api/tdoc-upload.js`, `api/tdoc-read.js`, `api/tdoc-delete.js` — Vercel
  functions over the **private** "tasara-docs" Blob store (team hemabryt,
  region CPT1). Firestore's `governmentIdPath` holds the private blob URL
  (the access capability; it embeds the unguessable UID). Upload cap 4 MB
  (Vercel function bodies cap near 4.5 MB).
- `assets/js/firebase/seller-documents.js` — same public API as the Firebase
  Storage version, now backed by the endpoints, with ID-token plumbing.
- `assets/js/firebase/admin.js` + `assets/js/pages/dashboard-admin.js` —
  "View ID" button + inline image preview + record editor (profile-edits);
  document actions present the admin's ID token.
- `assets/js/firebase/profile-edits.js` — `saveMyDetails` / `saveRecordDetails`;
  Edit-details cards on the seller & buyer dashboards; admin "Edit details"
  panel (tier included; email is never editable in the UI).
- Seller re-approval: an APPROVED seller's self-write re-enters `pending`
  (deployed to the shared `tasara-2c9f4e` rules on 2026-10-10; pending and
  rejected sellers keep the legacy no-status write so older flows still work).

**Security model (production).**

- All three tdoc endpoints verify a Firebase ID token server-side via
  firebase-admin (`api/_lib/auth.js`): upload requires the document owner's
  token; delete requires owner-or-admin; read requires the **admin custom
  claim** (the experiment's "UI-gated" caveat is closed). Tokens ride a
  Bearer header, or a `?token=` query parameter for `<img>`/download flows.
- The "tasara-docs" store is private: raw blob URLs are not readable by the
  open web. Paths/URLs are regex-locked to
  `seller-government-id/<uid>/government-id-<ts>.(jpg|jpeg|png|webp|pdf)`.
- The read proxy sends `Cache-Control: no-store`; government documents never
  linger in caches. The read token is a 1-hour admin ID token in a URL query —
  the same pattern Firebase Storage download URLs use for their file tokens.

**Required environment on the Vercel project `tasara` (preview + production).**
`BLOB_STORE_ID`, `BLOB_READ_WRITE_TOKEN` (the tasara-docs store credentials),
and `FIREBASE_SERVICE_ACCOUNT` (service-account JSON string, used only for ID
token verification). All server-side; never in this repository. The service
account key also stays at the gitignored `backend/service-account-tasara.json`.

**Verification.** `node scripts/verify-migration.mjs` from the repo root
checks the deployed UI assets and runs the full authenticated document loop
(`backend/scripts/smoke-doc-store.mjs`): minted throwaway sessions prove the
401/403 gates, private-store reads, byte-exact proxy read, and deletion, then
clean up after themselves. The rules unit suite still needs Java (absent on
this machine); the re-approval test cases are committed for the next
environment. Old test accounts from the experiment were removed from the
shared database after the migration.
