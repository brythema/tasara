// ============================================================
// TASARA — App Configuration (ES module)
// ============================================================

export const CONFIG = {
  // Supabase project credentials.
  // These are PUBLIC client credentials by design (RLS protects the data),
  // but migrate to a `sb_publishable_...` key before Supabase's legacy
  // anon-key deprecation (end of 2026): Dashboard → Settings → API Keys.
  SUPABASE_URL: 'https://ukyqjsmpqfdhfwhhujzo.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVreXFqc21wcWZkaGZ3aGh1anpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4ODAyMzEsImV4cCI6MjEwNDQ1NjIzMX0.OHMdwwVXIIunNUqmRHwQHOV6uI8GqxIRGQsCnYx4KHI',

  // Telegram community link — replace with real link
  TELEGRAM_COMMUNITY_URL: 'https://t.me/tasara_community',

  // Seller tiers
  TIERS: [
    { id: 'bronze',  name: 'Bronze',  icon: '🟤', color: '#b4783c' },
    { id: 'silver',  name: 'Silver',  icon: '⚪', color: '#94a3b8' },
    { id: 'gold',    name: 'Gold',    icon: '🟡', color: '#c8a44e' },
    { id: 'platinum', name: 'Platinum', icon: '⚫', color: '#c0c0d0' },
  ],

  // Government ID accepted formats
  ID_ACCEPTED_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
  ID_MAX_SIZE_MB: 10,

  // Product image accepted formats
  PRODUCT_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  PRODUCT_IMAGE_MAX_SIZE_MB: 5,
};
