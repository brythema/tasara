import { getFirebaseServices } from '../firebase/firebase-client.js';
import { getCurrentProfile, getUserFriendlyAuthError, observeAuth, resetPassword, signIn } from '../firebase/auth.js';
import { ROLES } from '../firebase/constants.js';

const REDIRECTS = Object.freeze({
  [ROLES.BUYER]: 'dashboard-buyer.html',
  [ROLES.SELLER]: 'dashboard-seller.html',
  [ROLES.ADMIN]: 'dashboard-admin.html'
});

function showError(box, message) {
  box.textContent = message;
  box.classList.add('show');
}

function clearError(box) {
  box.classList.remove('show');
  box.textContent = '';
}

function redirectForRole(profile) {
  const target = REDIRECTS[profile?.role];
  if (target) window.location.replace(target);
}

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('loginForm');
  const errorBox = document.getElementById('loginError');
  const submit = document.getElementById('loginSubmit');
  const resetLink = document.getElementById('resetPasswordLink');
  const configNote = document.getElementById('firebaseNote');

  try {
    const services = getFirebaseServices();
    observeAuth(services, async user => {
      if (!user) return;
      try {
        const profile = await getCurrentProfile(services);
        if (profile) redirectForRole(profile);
      } catch (error) {
        console.error(error);
      }
    });

    form?.addEventListener('submit', async event => {
      event.preventDefault();
      clearError(errorBox);
      submit.disabled = true;
      submit.textContent = 'Signing in…';
      try {
        const result = await signIn({
          ...services,
          email: document.getElementById('loginEmail').value,
          password: document.getElementById('loginPassword').value
        });
        redirectForRole(result.profile);
      } catch (error) {
        showError(errorBox, getUserFriendlyAuthError(error));
      } finally {
        submit.disabled = false;
        submit.textContent = 'Sign in';
      }
    });

    resetLink?.addEventListener('click', async event => {
      event.preventDefault();
      clearError(errorBox);
      const email = document.getElementById('loginEmail').value.trim();
      if (!email) {
        showError(errorBox, 'Enter your email address first, then choose Reset password.');
        document.getElementById('loginEmail')?.focus();
        return;
      }
      try {
        await resetPassword({ ...services, email });
        showError(errorBox, 'Password reset email sent. Check your inbox and follow the instructions.');
      } catch (error) {
        showError(errorBox, getUserFriendlyAuthError(error));
      }
    });
  } catch (error) {
    console.error(error);
    if (configNote) configNote.classList.add('show');
    if (form) form.addEventListener('submit', e => { e.preventDefault(); showError(errorBox, error.message); });
  }
});
