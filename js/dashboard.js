// ============================================================
// TASARA — Dashboard Module (Buyer & Seller)
// ============================================================

import { getSupabase, getSession, getProfile, getSellerProfile, getProducts, getPendingChangeRequests, getNotifications, markNotificationRead, markAllNotificationsRead } from './supabase.js';
import { getSession as getAuthSession, redirectToDashboard, signOut as authSignOut } from './auth.js';
import { toast, formatDate, formatDateTime, getInitials, tierBadge, statusBadge } from './ui.js';

let currentUser = null;
let userProfile = null;
let sellerProfile = null;

// Initialize dashboard — called on each dashboard page load
export async function initDashboard() {
  try {
    const session = await getAuthSession();
    if (!session) {
      window.location.href = '/login.html';
      return;
    }

    currentUser = session.user;
    userProfile = await getProfile(currentUser.id);

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

    // Load notifications
    const notifications = await getNotifications(currentUser.id);
    window.tasaraNotifications = notifications;
    window.tasaraUnreadCount = notifications.filter(n => !n.read).length;

    renderSidebar();
    renderTopNav();
    renderMobileSidebar();

    // Route to correct page content based on hash or default
    const hash = window.location.hash.replace('#', '');
    const page = hash || getFallbackPage();
    routeDashboardPage(page);

  } catch (err) {
    console.error('Dashboard init error:', err);
    window.location.href = '/login.html';
  }
}

function getFallbackPage() {
  if (!userProfile) return 'dashboard';
  if (userProfile.role === 'admin') return 'dashboard';
  if (userProfile.role === 'seller') return 'dashboard';
  return 'dashboard';
}

async function signOutRedirect() {
  await authSignOut();
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
      <div class="sidebar-user-role">${userProfile.role.toUpperCase()}</div>
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
  const mobileNav = document.getElementById('mobile-nav');
  const mobileUser = document.getElementById('mobile-sidebar-user');
  if (!mobileNav || !mobileUser) return;

  const initials = getInitials(userProfile.full_name);
  mobileUser.innerHTML = `
    <div class="avatar avatar-sm">${initials}</div>
    <div class="sidebar-user-info">
      <div class="sidebar-user-name">${escHtml(userProfile.full_name)}</div>
      <div class="sidebar-user-role">${userProfile.role.toUpperCase()}</div>
    </div>
  `;
}

function renderTopNav() {
  const topNav = document.getElementById('top-nav');
  if (!topNav) return;

  const initials = getInitials(userProfile.full_name);
  topNav.innerHTML = `
    <div class="nav-inner container">
      <div class="nav-logo">Tasara</div>
      <div class="nav-actions">
        <button class="btn btn-outline btn-sm" onclick="window.location.href='${CONFIG.TELEGRAM_COMMUNITY_URL}'" title="Join Community">
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
  // Show/hide mobile nav based on role
  const mobileNav = document.getElementById('mobile-nav');
  const layout = document.getElementById('dashboard-layout');

  // Hide all page sections
  document.querySelectorAll('.page-section').forEach(el => el.classList.add('hidden'));

  // Show the requested page
  const target = document.getElementById(`page-${page}`);
  if (target) {
    target.classList.remove('hidden');
    // Trigger page-specific init
    const initFn = window[`initPage_${page}`];
    if (initFn) initFn();
  }

  // Update active state in sidebar
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });
}

function escHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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

// Toggle mobile menu
window.toggleMobileMenu = function (open) {
  const overlay = document.getElementById('mobile-overlay');
  const nav = document.getElementById('mobile-nav');
  if (open === undefined) {
    const isOpen = nav?.classList.contains('open');
    if (isOpen) {
      overlay?.classList.remove('open');
      nav?.classList.remove('open');
    } else {
      overlay?.classList.add('open');
      nav?.classList.add('open');
    }
  } else if (open) {
    overlay?.classList.add('open');
    nav?.classList.add('open');
  } else {
    overlay?.classList.remove('open');
    nav?.classList.remove('open');
  }
};

// Notification reading
window.readNotification = async function (id) {
  await markNotificationRead(id);
  if (window.tasaraNotifications) {
    window.tasaraNotifications = window.tasaraNotifications.map(n =>
      n.id === id ? { ...n, read: true } : n
    );
  }
  // Re-render notifications if on that page
  const notifPage = document.getElementById('page-notifications');
  if (notifPage && !notifPage.classList.contains('hidden')) {
    window.initPage_notifications?.();
  }
};

window.markAllRead = async function () {
  if (!currentUser) return;
  await markAllNotificationsRead(currentUser.id);
  if (window.tasaraNotifications) {
    window.tasaraNotifications = window.tasaraNotifications.map(n => ({ ...n, read: true }));
    window.tasaraUnreadCount = 0;
  }
  toast('All notifications marked as read', 'success');
  window.initPage_notifications?.();
};

// Expose for use in page scripts
window.tasaraCurrentUser = () => currentUser;
window.tasaraUserProfile = () => userProfile;
window.tasaraSellerProfile = () => sellerProfile;
