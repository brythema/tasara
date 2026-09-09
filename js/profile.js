// ============================================================
// TASARA — Profile Module
// ============================================================

import { getSupabase, getSellerProfile, notifyAdmins } from './supabase.js';
import { toast } from './ui.js';

// Fields a seller may request to change. Anything else in a submitted
// payload is ignored — the server-side approve RPC enforces the same
// whitelist independently, this just keeps the client honest.
const SELLER_EDITABLE_FIELDS = [
  'business_name',
  'business_location',
  'description',
  'opening_time',
  'closing_time',
];

// Side effects (logging, notifications, email) must never mask the
// success or failure of the core operation they accompany.
async function fireAndForget(fn, label) {
  try {
    await fn();
  } catch (e) {
    console.warn(`${label} failed (non-critical):`, e);
  }
}

// Update buyer profile (immediate, no approval needed)
export async function updateBuyerProfile(userId, updates) {
  // Restrict updatable fields to the profile columns users own.
  const safeUpdates = {
    full_name: updates.full_name,
    phone: updates.phone,
    address: updates.address,
  };

  const { error } = await getSupabase()
    .from('profiles')
    .update(safeUpdates)
    .eq('id', userId);
  if (error) throw error;

  // Log activity
  await fireAndForget(async () => {
    const { error: logError } = await getSupabase().from('activity_logs').insert([{
      actor_id: userId,
      action: 'profile_updated',
      target_id: userId,
      description: `Profile updated by ${safeUpdates.full_name || 'the user'}`,
    }]);
    if (logError) throw logError;
  }, 'Activity log');

  // Create admin notification via security definer RPC
  await fireAndForget(async () => {
    await notifyAdmins(
      'buyer_profile_updated',
      'Buyer Profile Updated',
      `${safeUpdates.full_name || 'A buyer'} updated their account information.`
    );
  }, 'Admin notification');

  // Send admin email via edge function
  await fireAndForget(async () => {
    const { error: emailError } = await getSupabase().functions.invoke('send-email', {
      body: {
        subject: 'Buyer Profile Updated — Tasara',
        template: 'buyer_profile_updated',
        data: { name: safeUpdates.full_name },
      },
    });
    if (emailError) throw emailError;
  }, 'Email');

  toast('Profile updated successfully!', 'success');
}

// Submit seller profile change request (enters pending review)
export async function submitSellerChangeRequest(userId, changes) {
  // Keep only whitelisted, non-empty keys
  const cleanChanges = {};
  for (const key of SELLER_EDITABLE_FIELDS) {
    if (changes[key] !== undefined && changes[key] !== null) {
      cleanChanges[key] = changes[key];
    }
  }
  if (Object.keys(cleanChanges).length === 0) {
    throw new Error('No changes to submit.');
  }

  // Get current seller profile to capture old values
  const sellerProfile = await getSellerProfile(userId);
  if (!sellerProfile) throw new Error('Seller profile not found');

  // Create change request with old and new values.
  // The DB pins status='pending' via the INSERT policy's with-check.
  const { data, error } = await getSupabase().from('seller_change_requests').insert([{
    seller_id: userId,
    changes: cleanChanges,
    old_values: extractOldValues(sellerProfile, cleanChanges),
    new_values: { ...cleanChanges },
    status: 'pending',
  }]).select().single();

  if (error) throw error;

  // Update seller status to pending review
  const { error: statusError } = await getSupabase()
    .from('seller_profiles')
    .update({ approval_status: 'pending-review' })
    .eq('user_id', userId);
  if (statusError) throw statusError;

  // Log activity
  await fireAndForget(async () => {
    const { error: logError } = await getSupabase().from('activity_logs').insert([{
      actor_id: userId,
      action: 'seller_change_submitted',
      target_id: userId,
      description: `Seller submitted ${Object.keys(cleanChanges).length} change(s) for review`,
    }]);
    if (logError) throw logError;
  }, 'Activity log');

  // Create admin notification via RPC
  await fireAndForget(async () => {
    await notifyAdmins(
      'seller_change_pending',
      'Seller Change Pending',
      `A seller submitted ${Object.keys(cleanChanges).length} change(s) for review.`
    );
  }, 'Admin notification');

  // Send admin email
  await fireAndForget(async () => {
    const { error: emailError } = await getSupabase().functions.invoke('send-email', {
      body: {
        subject: 'Seller Change Pending — Tasara',
        template: 'seller_change_pending',
        data: { name: sellerProfile.business_name || undefined },
      },
    });
    if (emailError) throw emailError;
  }, 'Email');

  toast('Changes submitted for admin review', 'info');
  return data;
}

function extractOldValues(sellerProfile, changes) {
  const old = {};
  for (const key of Object.keys(changes)) {
    if (sellerProfile[key] !== undefined) old[key] = sellerProfile[key];
  }
  return old;
}

// Apply approved changes to seller profile.
// The write happens entirely inside the approve_seller_change() RPC,
// which whitelists columns — the client never writes seller_profiles
// from request data.
export async function applySellerChanges(changeRequestId) {
  const { error } = await getSupabase()
    .rpc('approve_seller_change', { p_request_id: changeRequestId });
  if (error) throw error;
}

// Reject a seller change request
export async function rejectSellerChange(changeRequestId) {
  const { error } = await getSupabase()
    .rpc('reject_seller_change', { p_request_id: changeRequestId });
  if (error) throw error;
}
