// ============================================================
// TASARA — Authentication Module
// ============================================================

import { getSupabase, getSession, getCurrentUser, getProfile } from './supabase.js';

const AUTH_EVENTS = {
  SIGN_IN: 'auth:sign-in',
  SIGN_OUT: 'auth:sign-out',
  SESSION_CHANGE: 'auth:session-change',
};

// Subscribe to auth state changes
export function initAuthListeners() {
  const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
    dispatchAuthEvent(AUTH_EVENTS.SESSION_CHANGE, { event, session });
  });
  return data.subscription;
}

function dispatchAuthEvent(type, detail) {
  document.dispatchEvent(new CustomEvent(type, { detail }));
}

export async function signIn(email, password) {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, metadata) {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: {
      data: metadata,
      emailRedirectTo: window.location.origin + '/dashboard.html',
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
  dispatchAuthEvent(AUTH_EVENTS.SIGN_OUT, {});
}

export async function resetPassword(email) {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/reset-password.html',
  });
  if (error) throw error;
}

// Get current user and their profile — safely handles null user
export async function getSessionUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  return { user, profile };
}

// Check if current user is admin
export async function isAdmin() {
  const { profile } = await getSessionUser() || {};
  return profile?.role === 'admin';
}

// Check if current user is seller
export async function isSeller() {
  const { profile } = await getSessionUser() || {};
  return profile?.role === 'seller';
}

// Check if current user is buyer
export async function isBuyer() {
  const { profile } = await getSessionUser() || {};
  return profile?.role === 'buyer';
}

// Redirect based on role after login
export function redirectToDashboard(profile) {
  if (!profile) return;
  switch (profile.role) {
    case 'admin':
      window.location.href = '/admin.html';
      break;
    case 'seller':
    case 'buyer':
      window.location.href = '/dashboard.html';
      break;
    default:
      window.location.href = '/dashboard.html';
  }
}
