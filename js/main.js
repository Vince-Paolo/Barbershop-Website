/* ==========================================================================
   FADED & CO — Main JS
   Components are now inlined in each HTML page (no fetch/include needed).
   Handles: active nav link, footer year, back-to-top, newsletter, loader.
   ========================================================================== */

function setActiveNavLink() {
  const current = document.body.getAttribute('data-page');
  if (!current) return;
  document.querySelectorAll('.nav-links a[data-page]').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('data-page') === current);
  });
}

function setFooterYear() {
  const yearEl = document.getElementById('footerYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

function initNewsletterForm() {
  const form = document.getElementById('newsletterForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = form.querySelector('input[type="email"]');
    if (input) { input.value = ''; input.placeholder = "Thanks — you're in!"; }
  });
}

function initBackToTop() {
  const btn = document.createElement('button');
  btn.className = 'back-to-top';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = '&uarr;';
  document.body.appendChild(btn);
  window.addEventListener('scroll', () => btn.classList.toggle('visible', window.scrollY > 600));
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function hideLoader() {
  const loader = document.getElementById('loaderScreen');
  if (!loader) return;
  window.addEventListener('load', () => setTimeout(() => loader.classList.add('hidden'), 300));
}

function initTestimonialSlider() {
  const card    = document.getElementById('testimonialCard');
  const quoteEl = document.getElementById('testimonialQuote');
  const authorEl= document.getElementById('testimonialAuthor');
  const prevBtn = document.getElementById('testimonialPrev');
  const nextBtn = document.getElementById('testimonialNext');
  if (!quoteEl || !prevBtn) return;

  const testimonials = [
    { quote: "Best fade I've had in this city, no contest. Marco doesn't miss.", author: '— Diego M., regular since 2023' },
    { quote: 'Hot towel shave talked me into becoming a regular. Worth every minute.', author: '— Rafael T., new client' },
    { quote: "Booked online in two minutes, walked out looking like I had a stylist on retainer.", author: '— Anton G., regular since 2024' },
  ];
  let index = 0;
  let animating = false;

  function go(direction) {
    if (animating) return;
    animating = true;

    // 1. Slide current card out
    const outClass = direction === 'next' ? 'slide-out-left' : 'slide-out-right';
    card.classList.add(outClass);

    setTimeout(() => {
      // 2. Update content while card is invisible
      index = direction === 'next'
        ? (index + 1) % testimonials.length
        : (index - 1 + testimonials.length) % testimonials.length;

      quoteEl.textContent  = testimonials[index].quote;
      authorEl.textContent = testimonials[index].author;

      // 3. Position new content on the entry side (still invisible)
      card.classList.remove(outClass);
      const inClass = direction === 'next' ? 'slide-in-left' : 'slide-in-right';
      card.classList.add(inClass);

      // Force reflow so the browser registers the starting position
      void card.offsetWidth;

      // 4. Slide in
      card.classList.remove(inClass);

      setTimeout(() => { animating = false; }, 370);
    }, 360);
  }

  prevBtn.addEventListener('click', () => go('prev'));
  nextBtn.addEventListener('click', () => go('next'));
}

function initServiceFilter() {
  const buttons = document.querySelectorAll('.service-filter button');
  const cards = document.querySelectorAll('.service-grid .service-card');
  if (!buttons.length || !cards.length) return;
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter');
      cards.forEach((card) => {
        card.style.display = filter === 'all' || card.getAttribute('data-category') === filter ? '' : 'none';
      });
    });
  });
}

function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  const confirmModal = document.getElementById('confirmModal');
  const confirmClose = document.getElementById('confirmClose');
  const validators = {
    name:    (v) => v.trim().length >= 2 || 'Enter your full name.',
    email:   (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || 'Enter a valid email address.',
    subject: (v) => v.trim().length >= 3 || 'Add a short subject.',
    message: (v) => v.trim().length >= 10 || 'Message should be at least 10 characters.',
  };
  const showError = (group, msg) => { group.classList.add('invalid'); const e = group.querySelector('.form-error'); if (e) e.textContent = msg; };
  const clearError = (group) => { group.classList.remove('invalid'); const e = group.querySelector('.form-error'); if (e) e.textContent = ''; };
  const validateField = (field) => {
    const group = form.querySelector(`[data-field="${field}"]`);
    const input = form.elements[field];
    if (!group || !input) return true;
    const result = validators[field](input.value);
    if (result === true) { clearError(group); return true; }
    showError(group, result); return false;
  };
  Object.keys(validators).forEach((field) => {
    const input = form.elements[field];
    if (!input) return;
    input.addEventListener('blur', () => validateField(field));
    input.addEventListener('input', () => { const g = form.querySelector(`[data-field="${field}"]`); if (g?.classList.contains('invalid')) validateField(field); });
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const allValid = Object.keys(validators).map(validateField).every(Boolean);
    if (!allValid) { form.querySelector('.form-group.invalid input, .form-group.invalid textarea')?.focus(); return; }
    confirmModal?.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
  form.addEventListener('reset', () => form.querySelectorAll('.form-group').forEach(clearError));
  confirmClose?.addEventListener('click', () => { confirmModal.classList.remove('open'); document.body.style.overflow = ''; form.reset(); form.querySelectorAll('.form-group').forEach(clearError); });
  confirmModal?.addEventListener('click', (e) => { if (e.target === confirmModal) { confirmModal.classList.remove('open'); document.body.style.overflow = ''; } });
}

document.addEventListener('DOMContentLoaded', () => {
  hideLoader();
  setActiveNavLink();
  setFooterYear();
  initNewsletterForm();
  initTestimonialSlider();
  initServiceFilter();
  initContactForm();
  initBackToTop();

  // These are exposed by their own script files loaded before main.js
  if (window.initNavbar)     window.initNavbar();
  if (window.initScrollReveal) window.initScrollReveal();
  if (window.initCounters)   window.initCounters();
  if (window.initGallery)    window.initGallery();
  if (window.initBooking)    window.initBooking();
});
