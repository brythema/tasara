# TASARA
# Buyer/Seller Account & Admin Management Platform

A clean, modern web-based account platform for the Tasara Nigerian business community.

## Architecture

- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **Backend:** Supabase (Auth, PostgreSQL, Storage, Edge Functions)
- **Email:** Resend (via Supabase Edge Functions)
- **Deployment:** Vercel
- **Source:** GitHub

## Project Structure

```
tasara/
├── index.html              # Homepage
├── login.html              # Login (user + admin toggle)
├── signup.html             # Registration (buyer/seller)
├── dashboard.html          # Buyer/Seller dashboard
├── admin.html              # Admin dashboard
├── setup.html              # First-admin setup page
├── css/
│   ├── design-system.css   # Design tokens, components
│   └── pages.css           # Page-specific styles
├── js/
│   ├── config.js           # App configuration
│   ├── supabase.js         # Supabase client + data helpers
│   ├── auth.js             # Authentication logic
│   ├── dashboard.js        # Dashboard shell + routing
│   ├── profile.js          # Profile edit & seller change workflow
│   ├── admin.js            # Admin dashboard logic
│   └── products.js         # Product management
├── supabase/
│   ├── schema.sql          # Database schema (run in Supabase SQL Editor)
│   └── functions/
│       └── send-email/     # Edge function for Resend emails
├── .env.example            # Environment variables template
└── vercel.json             # Vercel deployment config
```

## Quick Start

### 1. Set up Supabase

1. Create a project at https://supabase.com
2. Run `supabase/schema.sql` in the SQL Editor
3. Create two storage buckets:
   - `government-ids` (private)
   - `product-images` (public)
4. Copy the project URL and anon key

### 2. Set up Resend

1. Create an account at https://resend.com
2. Get your API key
3. The edge function uses `onboarding@resend.dev` by default — for production, verify a domain

### 3. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:
- `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- `RESEND_API_KEY`
- `ADMIN_EMAIL`
- `TELEGRAM_COMMUNITY_URL`

Update `js/config.js` with your Supabase credentials (or use a build step to inject them).

### 4. Deploy

**Vercel (recommended):**
```bash
vercel deploy --prod
```

Or connect your GitHub repo to Vercel for automatic deployments.

### 5. Create First Admin

1. Navigate to `/setup.html` on your deployed site
2. Fill in the admin details and create the account
3. Use `/login.html` with admin credentials to access the admin dashboard

## Key Workflows

### Buyer Flow
Homepage → Sign Up → Email Verify → Dashboard → Profile → Edit (immediate) → Admin notified

### Seller Flow
Homepage → Sign Up → Select Tier + Upload ID → Email Verify → Dashboard (Pending Approval)
→ Admin Approves → Dashboard (Approved) → Edit Business (pending review) → Admin Reviews

### Seller Edit Workflow (Critical)
Seller edits → Save → `seller_change_requests` created → Seller status → `pending-review`
→ Admin reviews diff (old → new) → Approve (changes go live) or Reject (original stays)

## Design

- Premium dark theme with gold accents
- Glassmorphic cards and components
- Responsive: sidebar on desktop, hamburger menu on mobile
- Tier badges: Bronze, Silver, Gold, Platinum

## Security

- Supabase Auth for all authentication
- RLS policies on every table
- Government IDs stored in private bucket
- Admin operations require admin role verification
- Seller approval cannot be self-modified
