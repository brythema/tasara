// ============================================================
// TASARA — App Configuration
// ============================================================

const CONFIG = {
  // Supabase — replace with your project credentials
  SUPABASE_URL: 'YOUR_SUPABASE_URL',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',

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

  // Product image accepted types
  PRODUCT_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png'],
  PRODUCT_IMAGE_MAX_SIZE_MB: 5,
};
