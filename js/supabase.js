// ============================================================
// TASARA — Supabase Client
// ============================================================

// Pinned exact version — never use a floating tag in production,
// a CDN-major bump must be a deliberate, tested change.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import { CONFIG } from './config.js';

let _supabase = null;

export function getSupabase() {
  if (!_supabase) {
    if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL === 'YOUR_SUPABASE_URL') {
      throw new Error('Supabase URL not configured. Edit js/config.js with your credentials.');
    }
    if (!CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
      throw new Error('Supabase anon key not configured. Edit js/config.js with your credentials.');
    }
    _supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        // PKCE is the recommended flow for SPAs/static sites.
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _supabase;
}

// Reads the session from storage WITHOUT validating it against the server.
// Only trust it for UI decisions — never for authorization.
export async function getSession() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

// Validates the JWT against the Auth server. Use this whenever the
// user identity matters (page guards, profile loads).
export async function getCurrentUser() {
  const { data, error } = await getSupabase().auth.getUser();
  if (error) throw error;
  return data.user;
}

// Fetch the user's profile from profiles table
export async function getProfile(userId) {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

// Fetch the user's seller profile
export async function getSellerProfile(userId) {
  const { data, error } = await getSupabase()
    .from('seller_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw error;
  }
  return data;
}

// Fetch all seller profiles with joined profile data (admin)
export async function getAllSellerProfiles() {
  const { data, error } = await getSupabase()
    .from('seller_profiles')
    .select('*, profiles:user_id(full_name, email, phone, address, created_at)');
  if (error) throw error;
  return data || [];
}

// Fetch all buyer profiles (admin)
export async function getAllBuyerProfiles() {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('role', 'buyer');
  if (error) throw error;
  return data || [];
}

// Fetch products for a seller
export async function getProducts(sellerId) {
  const { data, error } = await getSupabase()
    .from('products')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Fetch pending change requests for a seller
export async function getPendingChangeRequests(sellerId) {
  const { data, error } = await getSupabase()
    .from('seller_change_requests')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Fetch all pending change requests with seller info (admin)
export async function getAllPendingChangeRequests() {
  const { data, error } = await getSupabase()
    .from('seller_change_requests')
    .select(`
      *,
      seller_profiles!seller_change_requests_profile_fkey (
        tier,
        user_id,
        profiles!seller_profiles_user_id_fkey(full_name, email)
      )
    `)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Fetch notifications for a user
export async function getNotifications(userId) {
  const { data, error } = await getSupabase()
    .from('notifications')
    .select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Mark notification as read
export async function markNotificationRead(notificationId) {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);
  if (error) throw error;
}

// Mark all notifications as read
export async function markAllNotificationsRead(userId) {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read: true })
    .eq('recipient_id', userId);
  if (error) throw error;
}

// Notify all admins via the security definer RPC.
// This is the ONLY supported way for clients to create admin notifications.
export async function notifyAdmins(type, title, message) {
  const { error } = await getSupabase()
    .rpc('notify_admins', { p_type: type, p_title: title, p_message: message });
  if (error) throw error;
}

// Notify a single user via the security definer RPC (admin only).
export async function notifyUser(recipientId, type, title, message) {
  const { error } = await getSupabase()
    .rpc('notify_user', {
      p_recipient: recipientId,
      p_type: type,
      p_title: title,
      p_message: message,
    });
  if (error) throw error;
}

// Upload file to Supabase Storage. Upsert defaults to OFF so an
// existing object can never be silently overwritten.
export async function uploadFile(bucket, filePath, file, { upsert = false } = {}) {
  const { data, error } = await getSupabase().storage
    .from(bucket)
    .upload(filePath, file, { upsert });
  if (error) throw error;
  return data;
}

// Get signed URL for private file (1 hour expiry)
export async function getSignedUrl(bucket, path) {
  const { data, error } = await getSupabase().storage
    .from(bucket)
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// Get public URL for a storage file (synchronous API — no error channel)
export function getPublicUrl(bucket, path) {
  const { data } = getSupabase().storage
    .from(bucket)
    .getPublicUrl(path);
  return data?.publicUrl || '';
}
