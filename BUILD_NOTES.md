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
