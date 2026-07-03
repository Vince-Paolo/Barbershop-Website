/* ==========================================================================
   FADED & CO — Gallery: category filtering + lightbox
   Exposed as window.initGallery() so main.js can call it after the page's
   includes (navbar/footer) have loaded.
   ========================================================================== */

window.initGallery = function initGallery() {
  const grid = document.getElementById('galleryGrid');
  if (!grid) return; // not on the gallery page

  const filterButtons = document.querySelectorAll('.service-filter button');
  const allItems = Array.from(grid.querySelectorAll('.gallery-page-item'));

  const lightbox = document.getElementById('lightbox');
  const lightboxFrame = document.getElementById('lightboxFrame');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const closeBtn = document.getElementById('lightboxClose');
  const prevBtn = document.getElementById('lightboxPrev');
  const nextBtn = document.getElementById('lightboxNext');

  let visibleItems = allItems;
  let currentIndex = 0;

  // ---- Filtering ----
  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter');

      allItems.forEach((item) => {
        const match = filter === 'all' || item.getAttribute('data-category') === filter;
        item.style.display = match ? '' : 'none';
      });
      visibleItems = allItems.filter((item) => item.style.display !== 'none');
    });
  });

  // ---- Lightbox ----
  function openLightbox(item) {
    visibleItems = allItems.filter((el) => el.style.display !== 'none');
    currentIndex = visibleItems.indexOf(item);
    renderLightbox();
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function renderLightbox() {
    const item = visibleItems[currentIndex];
    if (!item) return;
    const bg = window.getComputedStyle(item).backgroundImage;
    lightboxFrame.style.backgroundImage = bg !== 'none' ? bg : '';
    lightboxFrame.style.backgroundSize = 'cover';
    lightboxFrame.style.backgroundPosition = 'center';
    lightboxFrame.innerHTML = bg === 'none' ? '<div class="ph-fill">Photo</div>' : '';
    lightboxCaption.textContent = item.getAttribute('data-caption') || '';
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
  }

  function showNext() {
    currentIndex = (currentIndex + 1) % visibleItems.length;
    renderLightbox();
  }
  function showPrev() {
    currentIndex = (currentIndex - 1 + visibleItems.length) % visibleItems.length;
    renderLightbox();
  }

  allItems.forEach((item) => {
    item.addEventListener('click', () => openLightbox(item));
  });

  closeBtn.addEventListener('click', closeLightbox);
  nextBtn.addEventListener('click', showNext);
  prevBtn.addEventListener('click', showPrev);

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') showNext();
    if (e.key === 'ArrowLeft') showPrev();
  });
};
