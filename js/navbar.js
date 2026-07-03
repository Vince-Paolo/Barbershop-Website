/* ==========================================================================
   FADED & CO — Navbar behavior
   Sticky background on scroll + mobile menu toggle with:
   - X close button inside the panel
   - Backdrop tap-to-close
   - Escape key to close
   ========================================================================== */

window.initNavbar = function initNavbar() {
  const navbar = document.getElementById('navbar');
  const toggle = document.getElementById('navToggle');
  const links  = document.getElementById('navLinks');
  if (!navbar) return;

  /* ---- Sticky scroll ---- */
  function onScroll() {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  }
  onScroll();
  window.addEventListener('scroll', onScroll);

  if (!toggle || !links) return;

  /* ---- Backdrop ---- */
  const backdrop = document.createElement('div');
  backdrop.className = 'nav-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.appendChild(backdrop);

  /* ---- Close button (X) inside panel ---- */
  const closeBtn = document.createElement('button');
  closeBtn.className = 'nav-close';
  closeBtn.setAttribute('aria-label', 'Close menu');
  closeBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`;
  links.appendChild(closeBtn);

  /* ---- Open / close helpers ---- */
  function openMenu() {
    links.classList.add('open');
    toggle.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    backdrop.classList.add('visible');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeMenu() {
    links.classList.remove('open');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    backdrop.classList.remove('visible');
    document.body.style.overflow = '';
    toggle.focus();
  }

  /* ---- Events ---- */
  toggle.addEventListener('click', () =>
    links.classList.contains('open') ? closeMenu() : openMenu()
  );

  closeBtn.addEventListener('click', closeMenu);
  backdrop.addEventListener('click', closeMenu);

  // Close when a nav link is tapped
  links.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeMenu));

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && links.classList.contains('open')) closeMenu();
  });
};
