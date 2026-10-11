import { getFirebaseServices } from '../firebase/firebase-client.js';
import { observeAuth, getCurrentProfile } from '../firebase/auth.js';
import { ROLES } from '../firebase/constants.js';
import { BUYER_TELEGRAM_URL } from '../firebase/firebase-config.js';
import { saveMyDetails } from '../firebase/profile-edits.js';

function redirect(profile) {
  if (!profile) return window.location.replace('login.html');
  if (profile.role === ROLES.BUYER) return;
  if (profile.role === ROLES.SELLER) return window.location.replace('dashboard-seller.html');
  if (profile.role === ROLES.ADMIN) return window.location.replace('dashboard-admin.html');
  window.location.replace('login.html');
}

function setRow(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || '—';
}

// Module scripts evaluate after the document is parsed, but a dependency's
// top-level await can let DOMContentLoaded fire first — so never rely on it.
const onReady = fn => (document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', fn)
  : fn());

onReady(async () => {
  try {
    const services = getFirebaseServices();

    /* Edit-form refs declared before the observer so its async callback can
       prefill them without depending on ordering. */
    const editName = document.getElementById('editName');
    const editPhone = document.getElementById('editPhone');
    const editAddress = document.getElementById('editAddress');
    const editBtn = document.getElementById('editDetailsBtn');
    const editNote = document.getElementById('editDetailsNote');
    const editCard = document.getElementById('editDetailsCard');
    const editToggle = document.getElementById('editDetailsToggle');

    /* The editor is collapsed behind the toggle button, so it never clutters
       the dashboard until the buyer asks for it. */
    editToggle?.addEventListener('click', () => {
      const opening = editCard.hidden;
      editCard.hidden = !opening;
      editToggle.textContent = opening ? 'Close editor' : 'Edit details';
      if (opening) editName?.focus();
      else editToggle.focus();
    });

    observeAuth(services, async user => {
      if (!user) return window.location.replace('login.html');
      const profile = await getCurrentProfile(services);
      if (!profile) return window.location.replace('login.html');
      if (profile.role !== ROLES.BUYER) return redirect(profile);
      setRow('userName', (profile.name || 'there').split(' ')[0]);
      setRow('rowName', profile.name);
      setRow('rowEmail', profile.email);
      setRow('rowPhone', profile.phone);
      setRow('rowAddress', profile.address);
      if (editName) editName.value = profile.name || '';
      if (editPhone) editPhone.value = profile.phone || '';
      if (editAddress) editAddress.value = profile.address || '';
    });

    editBtn?.addEventListener('click', async () => {
      const user = services.auth.currentUser;
      if (!user) return;
      const note = msg => { if (editNote) editNote.textContent = msg; };
      try {
        editBtn.disabled = true;
        editBtn.textContent = 'Saving…';
        await saveMyDetails({
          ...services,
          uid: user.uid,
          role: ROLES.BUYER,
          changes: {
            name: editName.value,
            phone: editPhone.value,
            address: editAddress.value
          }
        });
        setRow('rowName', editName.value);
        setRow('rowPhone', editPhone.value);
        setRow('rowAddress', editAddress.value);
        note('Details saved.');
      } catch (error) {
        note(error.message || 'Could not save your details.');
      } finally {
        editBtn.disabled = false;
        editBtn.textContent = 'Save details';
      }
    });

    document.getElementById('joinBtn')?.addEventListener('click', () => {
      const btn = document.getElementById('joinBtn');
      btn.classList.add('tilted');
      window.open(BUYER_TELEGRAM_URL, '_blank', 'noopener');
    });
  } catch (error) {
    console.error(error);
    document.getElementById('dashboardError')?.classList.add('show');
  }
});
