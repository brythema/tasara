# TASARA Firebase Setup

## 1. Create the Firebase project

In Firebase Console:

- Create/select the TASARA project.
- Register the TASARA web app and copy its Firebase web configuration.
- Enable Authentication → Sign-in method → Email/Password.
- Create a Cloud Firestore database.
- Enable Cloud Storage.

## 2. Connect the website

Open:

`assets/js/firebase/firebase-config.js`

Replace the placeholder values with the Firebase web-app configuration from Project settings → Your apps.

The static website uses Firebase's modular browser SDK through Firebase's official CDN. Firebase documents this browser-module pattern for no-build-tool sites; for a production build system, npm + bundling is the longer-term optimization path.

## 3. Deploy Firebase rules and indexes

From the `backend/` directory:

```bash
npm install
firebase login
firebase use YOUR_FIREBASE_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## 4. Provision the first administrator

Create/download a Firebase Admin SDK service-account credential and set `GOOGLE_APPLICATION_CREDENTIALS` locally. Never commit that JSON file.

```bash
npm run provision:admin -- admin@example.com "StrongPassword" "TASARA Administrator"
```

The script creates/updates the admin user, sets the `admin` custom claim, and creates `users/{uid}` with `role: admin`.

Firebase documents custom claims as the mechanism for role-based access control, with claims set from a privileged server environment and enforced in Security Rules.

After provisioning, the administrator should sign out and back in so the refreshed token contains the claim.

## 5. Frontend behavior

The website has one sign-in form. After authentication, the `users/{uid}.role` value routes the account:

- `buyer` → `dashboard-buyer.html`
- `seller` → `dashboard-seller.html`
- `admin` → `dashboard-admin.html`

No admin toggle and no browser-side admin access code are used.

## 6. Realtime approval flow

The admin dashboard listens to seller records. The seller dashboard listens to its own seller record. Firestore `onSnapshot()` is used so a new seller appears to the admin and an admin decision reaches the seller without a manual refresh. Firebase documents `onSnapshot()` for realtime document/query updates.

## 7. Government-ID storage

The only uploaded file in this phase is the seller government ID. It is stored in Cloud Storage with size/type validation and path-based authorization. Firebase documents Storage Security Rules as the place to restrict file access and validate size/content type.

Current Storage path:

`seller-government-id/{uid}/{fileName}`

## 8. Important Firebase note

Current Firebase documentation states that Cloud Storage for Firebase requires the Blaze plan for new projects. Check the current billing requirements in the Firebase console before enabling Storage.

Official Firebase references used for the architecture:
- https://firebase.google.com/docs/web/setup
- https://firebase.google.com/docs/auth/admin/custom-claims
- https://firebase.google.com/docs/firestore/query-data/listen
- https://firebase.google.com/docs/storage/security
- https://firebase.google.com/docs/storage/web/start
