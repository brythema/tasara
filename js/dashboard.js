// ============================================================
// TASARA — Dashboard Module (Buyer & Seller)
// ============================================================

import { getSupabase, getProfile, getSellerProfile, getProducts, getPendingChangeRequests, getNotifications } from './supabase.js';
import { getSessionUser, signOut as authSignOut } from './auth.js';
import { toast, setLoading, formatDate, formatDateTime, getInitials, tierBadge, statusBadge } from './ui.js';
import { CONFIG } from './config.js';

let currentUser = null;
let userProfile = null;
let sellerProfile = null;

// Initialize dashboard — called on each dashboard page load
export async function initDashboard() {
  try {
    // getSessionUser() validates the JWT via auth.getUser() — do not
    // gate pages on the unvalidated cached session.
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      window.location.href = '/login.html';
      return;
    }

    currentUser = sessionUser.user;
    userProfile = sessionUser.profile;

    if (!userProfile) {
      console.error('Profile not found for user:', currentUser.id);
      await signOutRedirect();
      return;
    }

    // Check if account is deactivated
    if (userProfile.account_status === 'deactivated') {
      toast('Your account has been deactivated. Contact support.', 'warning');
      await signOutRedirect();
      return;
    }

    // Load seller profile if applicable
    if (userProfile.role === 'seller') {
      sellerProfile = await getSellerProfile(currentUser.id);
    }

    // Load notifications for this user
    const notifications = await getNotifications(currentUser.id);
    window.tasaraNotifications = notifications;
    window.tasaraUnreadCount = notifications.filter(n => !n.read).length;

    // Show the dashboard layout
    const layout = document.getElementById('dashboard-layout');
    if (layout) layout.style.display = 'grid';

    renderSidebar();
    renderTopNav();
    renderMobileSidebar();

    // Route to correct page content based on hash
    const hash = window.location.hash.replace('#', '');
    const page = hash || 'dashboard';
    routeDashboardPage(page);

  } catch (err) {
    console.error('Dashboard init error:', err);
    window.location.href = '/login.html';
  }
}

async function signOutRedirect() {
  try { await authSignOut(); } catch { /* session may already be gone */ }
  window.location.href = '/login.html';
}

function renderSidebar() {
  const sidebar = document.getElementById('sidebar-nav');
  const sidebarUser = document.getElementById('sidebar-user');
  if (!sidebar || !sidebarUser) return;

  const initials = getInitials(userProfile.full_name);
  sidebarUser.innerHTML = `
    <div class="avatar avatar-sm">${initials}</div>
    <div class="sidebar-user-info">
      <div class="sidebar-user-name">${escHtml(userProfile.full_name)}</div>
      <div class="sidebar-user-role">${escHtml(userProfile.role.toUpperCase())}</div>
    </div>
  `;

  let links = '';

  if (userProfile.role === 'admin') {
    links = `
      <button class="sidebar-link" data-page="dashboard">
        <span class="link-icon">📊</span> Dashboard
      </button>
      <button class="sidebar-link" data-page="users">
        <span class="link-icon">👥</span> Users
      </button>
      <button class="sidebar-link" data-page="applications">
        <span class="link-icon">📋</span> Seller Applications
      </button>
      <button class="sidebar-link" data-page="pending-changes">
        <span class="link-icon">🔄</span> Pending Changes
      </button>
      <button class="sidebar-link" data-page="products">
        <span class="link-icon">📦</span> Products
      </button>
      <button class="sidebar-link" data-page="notifications">
        <span class="link-icon">🔔</span> Notifications
      </button>
      <button class="sidebar-link" data-page="settings">
        <span class="link-icon">⚙️</span> Settings
      </button>
    `;
  } else if (userProfile.role === 'seller') {
    links = `
      <button class="sidebar-link" data-page="dashboard">
        <span class="link-icon">📊</span> Dashboard
      </button>
      <button class="sidebar-link" data-page="profile">
        <span class="link-icon">👤</span> Profile
      </button>
      <button class="sidebar-link" data-page="business">
        <span class="link-icon">🏪</span> My Business
      </button>
      <button class="sidebar-link" data-page="products">
        <span class="link-icon">📦</span> My Products
      </button>
      <button class="sidebar-link" data-page="pending-changes">
        <span class="link-icon">🔄</span> Pending Changes
      </button>
      <button class="sidebar-link" data-page="notifications">
        <span class="link-icon">🔔</span> Notifications
      </button>
      <button class="sidebar-link" data-page="settings">
        <span class="link-icon">⚙️</span> Settings
      </button>
    `;
  } else {
    // Buyer
    links = `
      <button class="sidebar-link" data-page="dashboard">
        <span class="link-icon">📊</span> Dashboard
      </button>
      <button class="sidebar-link" data-page="profile">
        <span class="link-icon">👤</span> Profile
      </button>
      <button class="sidebar-link" data-page="notifications">
        <span class="link-icon">🔔</span> Notifications
      </button>
      <button class="sidebar-link" data-page="settings">
        <span class="link-icon">⚙️</span> Settings
      </button>
    `;
  }

  sidebar.innerHTML = links;

  // Attach click handlers
  sidebar.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      const page = link.dataset.page;
      routeDashboardPage(page);
      toggleMobileMenu(false);
    });
  });
}

function renderMobileSidebar() {
  const mobileNav = document.getElementById('mobile-nav-links');
  const mobileUser = document.getElementById('mobile-sidebar-user');
  if (!mobileNav || !mobileUser) return;

  const initials = getInitials(userProfile.full_name);
  mobileUser.innerHTML = `
    <div class="avatar avatar-sm">${initials}</div>
    <div class="sidebar-user-info">
      <div class="sidebar-user-name">${escHtml(userProfile.full_name)}</div>
      <div class="sidebar-user-role">${escHtml(userProfile.role.toUpperCase())}</div>
    </div>
  `;

  // Mirror sidebar links to mobile nav
  const sidebarLinks = document.getElementById('sidebar-nav');
  if (sidebarLinks) {
    mobileNav.innerHTML = sidebarLinks.innerHTML;
    mobileNav.querySelectorAll('.sidebar-link').forEach(link => {
      link.addEventListener('click', () => {
        routeDashboardPage(link.dataset.page);
        toggleMobileMenu(false);
      });
    });
  }
}

function renderTopNav() {
  const topNav = document.getElementById('top-nav');
  if (!topNav) return;

  const initials = getInitials(userProfile.full_name);
  topNav.innerHTML = `
    <div class="nav-inner container">
      <div class="nav-logo">Tasara</div>
      <div class="nav-actions">
        <button class="btn btn-outline btn-sm" onclick="window.location.href='${escHtml(CONFIG.TELEGRAM_COMMUNITY_URL)}'" title="Join Community">
          📱 Join Community
        </button>
        <div class="nav-user" onclick="toggleUserMenu()">
          <div class="avatar avatar-sm">${initials}</div>
          <span class="nav-user-name">${escHtml(userProfile.full_name.split(' ')[0])}</span>
        </div>
      </div>
    </div>
  `;
}

function routeDashboardPage(page) {
  // Only ever route to known page ids — never interpolate the hash
  // into selectors or function names unvalidated.
  const allowedPages = ['dashboard', 'profile', 'business', 'products', 'pending-changes', 'notifications', 'settings', 'users', 'applications'];
  if (!allowedPages.includes(page)) page = 'dashboard';

  // Hide all page sections
  document.querySelectorAll('.page-section').forEach(el => el.classList.add('hidden'));

  // Show the requested page
  const target = document.getElementById(`page-${page}`);
  if (target) {
    target.classList.remove('hidden');
    // Trigger page-specific init
    const initFn = window[`initPage_${page}`];
    if (typeof initFn === 'function') initFn();
  }

  // Update active state in sidebar
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Global sign out
window.signOut = async function () {
  await authSignOut();
  window.location.href = '/login.html';
};

// Toggle user dropdown menu
window.toggleUserMenu = function () {
  const choice = confirm('Sign out of Tasara?');
  if (choice) window.signOut();
};

// Expose for use in page scripts
window.tasaraCurrentUser = () => currentUser;
window.tasaraUserProfile = () => userProfile;
window.tasaraSellerProfile = () => sellerProfile;
