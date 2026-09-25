import { getFirebaseServices } from '../firebase/firebase-client.js';
import { observeAuth, getCurrentProfile } from '../firebase/auth.js';
import { ROLES } from '../firebase/constants.js';
import { BUYER_TELEGRAM_URL } from '../firebase/firebase-config.js';

function redirect(profile) {
  if (!profile) return window.location.replace('login.html');
  if (profile.role === ROLES.BUYER) return;
  if (profile.role === ROLES.SELLER) return window.location.replace('dashboard-seller.html');
  if (profile.role === ROLES.ADMIN) return window.location.replace('dashboard-admin.html');
  window.location.replace('login.html');
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const services = getFirebaseServices();
    observeAuth(services, async user => {
      if (!user) return window.location.replace('login.html');
      const profile = await getCurrentProfile(services);
      if (!profile) return window.location.replace('login.html');
      if (profile.role !== ROLES.BUYER) return redirect(profile);
      document.getElementById('userName').textContent = (profile.name || 'there').split(' ')[0];
      document.getElementById('rowName').textContent = profile.name || '—';
      document.getElementById('rowEmail').textContent = profile.email || '—';
      document.getElementById('rowPhone').textContent = profile.phone || '—';
      document.getElementById('rowAddress').textContent = profile.address || '—';
    });

    document.getElementById('joinBtn')?.addEventListener('click', () => {
      const btn = document.getElementById('joinBtn');
      btn.classList.add('tilted');
      setTimeout(() => window.open(BUYER_TELEGRAM_URL, '_blank', 'noopener'), 480);
    });
  } catch (error) {
    console.error(error);
    document.getElementById('dashboardError')?.classList.add('show');
  }
});
