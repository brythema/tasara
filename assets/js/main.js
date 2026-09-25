/* ============================================================
   TASARA — shared site behavior
   Presentation only: navigation, reveal effects, FAQ, transitions,
   and the shared logout control. Firebase page logic lives separately.
   ============================================================ */

(function () {
  let isTransitioning = false;

  function triggerTransition(targetUrl) {
    if (isTransitioning || !targetUrl) return;
    isTransitioning = true;
    const content = document.querySelector('.page-content');
    if (content) {
      content.style.opacity = '0';
      content.style.transition = 'opacity 0.3s ease';
    }
    window.setTimeout(() => { window.location.href = targetUrl; }, 320);
  }

  document.addEventListener('click', function (event) {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
      event.preventDefault();
      triggerTransition(href);
    }
  }, true);

  window.tasaraNavigate = triggerTransition;
})();

document.addEventListener('DOMContentLoaded', function () {
  const page = document.body.getAttribute('data-page');

  const topbar = document.querySelector('.topbar');
  if (topbar) {
    const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  const burger = document.getElementById('burger');
  const menu = document.getElementById('mobileMenu');
  if (burger && menu) {
    burger.addEventListener('click', function () {
      const open = menu.classList.toggle('open');
      document.body.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.textContent = open ? '✕' : '☰';
      if (open) menu.querySelector('a')?.focus();
    });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      menu.classList.remove('open');
      document.body.classList.remove('menu-open');
      burger.setAttribute('aria-expanded', 'false');
      burger.textContent = '☰';
    }));
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menu.classList.contains('open')) {
        menu.classList.remove('open');
        document.body.classList.remove('menu-open');
        burger.setAttribute('aria-expanded', 'false');
        burger.textContent = '☰';
        burger.focus();
      }
    });
  }

  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length) {
    if (!('IntersectionObserver' in window)) reveals.forEach(el => el.classList.add('in-view'));
    else {
      const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      }), { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
      reveals.forEach(el => observer.observe(el));
    }
  }

  document.querySelectorAll('.stat-num[data-count]').forEach(el => {
    const target = Number.parseInt(el.dataset.count, 10);
    if (!Number.isFinite(target)) return;
    const prefix = el.textContent.trim().startsWith('$') ? '$' : '';
    const suffix = el.textContent.includes('+') ? '+' : '';
    let started = false;
    const animate = () => {
      if (started) return;
      started = true;
      let current = 0;
      const step = Math.max(1, Math.ceil(target / 50));
      const timer = window.setInterval(() => {
        current = Math.min(target, current + step);
        el.textContent = prefix + current.toLocaleString() + suffix;
        if (current >= target) window.clearInterval(timer);
      }, 30);
    };
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) { animate(); observer.disconnect(); }
      }, { threshold: 0.5 });
      observer.observe(el);
    } else animate();
  });

  document.querySelectorAll('.faq-question').forEach(button => {
    button.addEventListener('click', function () {
      const item = button.closest('.faq-item');
      const list = button.closest('.faq-list');
      if (!item || !list) return;
      const open = item.classList.contains('open');
      list.querySelectorAll('.faq-item').forEach(i => {
        i.classList.remove('open');
        i.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
      });
      if (!open) {
        item.classList.add('open');
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });

  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) {
    logoutLink.addEventListener('click', async function (event) {
      event.preventDefault();
      logoutLink.style.pointerEvents = 'none';
      try {
        const { getFirebaseServices } = await import('./firebase/firebase-client.js');
        const { logout } = await import('./firebase/auth.js');
        await logout(getFirebaseServices());
      } catch (error) {
        console.error(error);
      } finally {
        window.location.href = 'login.html';
      }
    });
  }

  // Keep the shared module quiet on Firebase pages; page modules own the workflows.
  void page;
});

