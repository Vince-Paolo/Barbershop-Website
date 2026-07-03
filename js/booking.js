/* ==========================================================================
   FADED & CO — Enhanced Booking
   Multi-step form · Live sidebar · Time slots · Barber preview
   Phone formatter · Notes counter · Start-over confirm
   ========================================================================== */

window.initBooking = function initBooking() {
  const form = document.getElementById('bookingForm');
  if (!form) return;

  /* ── Data ──────────────────────────────────────────────────────────────── */
  const SERVICES = {
    'classic-haircut':  { label: 'Classic Haircut',          price: 200, duration: 30 },
    'skin-fade':        { label: 'Skin Fade',                price: 280, duration: 40 },
    'buzz-cut':         { label: 'Buzz Cut',                 price: 150, duration: 15 },
    'beard-trim':       { label: 'Beard Trim',               price: 150, duration: 20 },
    'hot-towel-shave':  { label: 'Hot Towel Shave',          price: 220, duration: 25 },
    'hair-coloring':    { label: 'Hair Coloring',            price: 450, duration: 60 },
    'kids-haircut':     { label: 'Kids Haircut',             price: 150, duration: 20 },
    'hair-wash':        { label: 'Hair Wash',                price: 100, duration: 15 },
    'premium-package':  { label: 'Premium Grooming Package', price: 550, duration: 75 },
  };

  const BARBERS = {
    '':               null,
    'marco-reyes':    { name: 'Marco Reyes',      role: 'Master Barber',           specialty: 'Classic cuts & tapers',      photo: 'assets/images/team/marco-reyes.jpg' },
    'jay-santos':     { name: 'Jay Santos',       role: 'Fade Specialist',         specialty: 'Skin fades & blends',        photo: 'assets/images/team/jay-santos.jpg' },
    'eli-cruz':       { name: 'Eli Cruz',         role: 'Beard & Shave Specialist',specialty: 'Hot towel shaves & beards',  photo: 'assets/images/team/eli-cruz.jpg' },
    'paolo-dela-cruz':{ name: 'Paolo Dela Cruz',  role: 'Junior Barber',           specialty: 'Kids & buzz cuts',           photo: 'assets/images/team/paolo-dela-cruz.jpg' },
  };

  // Time slots per day (24h)
  const HOURS = {
    0: { open: '10:00', close: '17:00' }, // Sun
    1: { open: '09:00', close: '20:00' }, // Mon
    2: { open: '09:00', close: '20:00' },
    3: { open: '09:00', close: '20:00' },
    4: { open: '09:00', close: '20:00' },
    5: { open: '09:00', close: '20:00' }, // Fri
    6: { open: '09:00', close: '19:00' }, // Sat
  };

  /* ── Elements ──────────────────────────────────────────────────────────── */
  const panels       = form.querySelectorAll('.booking-step-panel');
  const progressSteps= document.querySelectorAll('.booking-progress-step');
  const progressLines= document.querySelectorAll('.booking-progress-line');

  const barberSelect = form.elements['barber'];
  const serviceSelect= form.elements['service'];
  const dateInput    = form.elements['date'];
  const timeHidden   = form.elements['time'];
  const notesTA      = form.elements['notes'];
  const notesCount   = document.getElementById('notesCount');
  const timeGroup    = document.getElementById('timeGroup');
  const timeSlots    = document.getElementById('timeSlots');
  const serviceDetail= document.getElementById('serviceDetail');
  const barberPreview= document.getElementById('barberPreview');

  // Sidebar
  const sbService  = document.getElementById('sb-service-val');
  const sbBarber   = document.getElementById('sb-barber-val');
  const sbDate     = document.getElementById('sb-date-val');
  const sbTime     = document.getElementById('sb-time-val');
  const sbPrice    = document.getElementById('sb-price-val');
  const sbDuration = document.getElementById('sb-duration-val');

  // Modals
  const confirmModal   = document.getElementById('confirmModal');
  const confirmDesc    = document.getElementById('confirmDesc');
  const confirmClose   = document.getElementById('confirmClose');
  const startOverModal = document.getElementById('startOverModal');
  const startOverBtn   = document.getElementById('startOver');
  const startOverCancel= document.getElementById('startOverCancel');
  const startOverConfirm=document.getElementById('startOverConfirm');

  let currentStep = 1;

  /* ── Step navigation ───────────────────────────────────────────────────── */
  function goToStep(step) {
    panels.forEach((p) => p.classList.remove('active'));
    form.querySelector(`[data-panel="${step}"]`).classList.add('active');

    progressSteps.forEach((s, i) => {
      s.classList.toggle('active',  i + 1 === step);
      s.classList.toggle('done',    i + 1 < step);
    });
    progressLines.forEach((l, i) => l.classList.toggle('done', i + 1 < step));

    currentStep = step;
    if (step === 3) buildReview();
    window.scrollTo({ top: document.getElementById('bookingProgress').offsetTop - 100, behavior: 'smooth' });
  }

  document.getElementById('toStep2').addEventListener('click', () => {
    if (validateStep(1)) goToStep(2);
  });
  document.getElementById('toStep1').addEventListener('click', () => goToStep(1));
  document.getElementById('toStep3').addEventListener('click', () => {
    if (validateStep(2)) goToStep(3);
  });
  document.getElementById('toStep2Back').addEventListener('click', () => goToStep(2));

  /* ── Validators ────────────────────────────────────────────────────────── */
  const validators = {
    name:    (v) => v.trim().length >= 2         || 'Enter your full name.',
    phone:   (v) => /^[0-9+\-\s()]{7,}$/.test(v.trim()) || 'Enter a valid phone number.',
    email:   (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || 'Enter a valid email.',
    barber:  ()  => true,
    service: (v) => v.trim() !== ''              || 'Choose a service.',
    date:    (v) => v.trim() !== ''              || 'Choose a date.',
    time:    (v) => v.trim() !== ''              || 'Select a time slot.',
    notes:   ()  => true,
  };

  const STEP_FIELDS = { 1: ['name','phone','email'], 2: ['service','date','time'] };

  function showError(group, msg) {
    group.classList.add('invalid');
    const e = group.querySelector('.form-error');
    if (e) e.textContent = msg;
  }
  function clearError(group) {
    group.classList.remove('invalid');
    const e = group.querySelector('.form-error');
    if (e) e.textContent = '';
  }
  function validateField(field) {
    const group = form.querySelector(`[data-field="${field}"]`);
    const input = form.elements[field];
    if (!group || !input) return true;
    const r = validators[field](input.value);
    if (r === true) { clearError(group); return true; }
    showError(group, r); return false;
  }
  function validateStep(step) {
    return STEP_FIELDS[step].map(validateField).every(Boolean);
  }

  // Live validation
  Object.keys(validators).forEach((field) => {
    const input = form.elements[field];
    if (!input) return;
    input.addEventListener('blur', () => validateField(field));
    input.addEventListener('input', () => {
      const g = form.querySelector(`[data-field="${field}"]`);
      if (g?.classList.contains('invalid')) validateField(field);
    });
  });

  /* ── Phone auto-format ─────────────────────────────────────────────────── */
  const phoneInput = form.elements['phone'];
  phoneInput.addEventListener('input', () => {
    let v = phoneInput.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 7)      v = v.slice(0,4) + ' ' + v.slice(4,7) + ' ' + v.slice(7);
    else if (v.length > 4) v = v.slice(0,4) + ' ' + v.slice(4);
    phoneInput.value = v;
  });

  /* ── Notes counter ─────────────────────────────────────────────────────── */
  if (notesTA && notesCount) {
    notesTA.addEventListener('input', () => {
      notesCount.textContent = notesTA.value.length;
    });
  }

  /* ── Barber card preview ───────────────────────────────────────────────── */
  barberSelect.addEventListener('change', () => {
    const b = BARBERS[barberSelect.value];
    if (b) {
      document.getElementById('barberPreviewPhoto').style.backgroundImage = `url('${b.photo}')`;
      document.getElementById('barberPreviewName').textContent = b.name;
      document.getElementById('barberPreviewRole').textContent = b.role;
      document.getElementById('barberPreviewSpecialty').textContent = '✦ ' + b.specialty;
      barberPreview.style.display = 'flex';
    } else {
      barberPreview.style.display = 'none';
    }
    updateSidebar();
  });

  /* ── Service detail chip ───────────────────────────────────────────────── */
  serviceSelect.addEventListener('change', () => {
    const s = SERVICES[serviceSelect.value];
    if (s) {
      document.getElementById('serviceDetailPrice').textContent = `₱${s.price}`;
      document.getElementById('serviceDetailDuration').textContent = `${s.duration} mins`;
      serviceDetail.style.display = 'flex';
    } else {
      serviceDetail.style.display = 'none';
    }
    updateSidebar();
    if (dateInput.value) buildTimeSlots();
  });

  /* ── Date → generate time slots ────────────────────────────────────────── */
  const today = new Date().toISOString().split('T')[0];
  dateInput.setAttribute('min', today);

  dateInput.addEventListener('change', () => {
    buildTimeSlots();
    updateSidebar();
  });

  function buildTimeSlots() {
    const val = dateInput.value;
    if (!val) return;
    const d   = new Date(val + 'T00:00:00');
    const day = d.getDay();
    const h   = HOURS[day];

    // Clear previous selection
    timeHidden.value = '';
    updateSidebar();

    const [openH, openM]  = h.open.split(':').map(Number);
    const [closeH, closeM]= h.close.split(':').map(Number);
    const openMins  = openH  * 60 + openM;
    const closeMins = closeH * 60 + closeM;

    // Build 30-min slots
    const slots = [];
    for (let m = openMins; m < closeMins; m += 30) {
      const hh  = String(Math.floor(m / 60)).padStart(2,'0');
      const mm  = String(m % 60).padStart(2,'0');
      const ampm= m < 720 ? 'AM' : 'PM';
      const h12 = Math.floor(m/60) % 12 || 12;
      slots.push({ value: `${hh}:${mm}`, label: `${h12}:${mm} ${ampm}` });
    }

    timeSlots.innerHTML = slots.map(s =>
      `<button type="button" class="time-slot-btn" data-value="${s.value}">${s.label}</button>`
    ).join('');
    timeGroup.style.display = 'block';

    timeSlots.querySelectorAll('.time-slot-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        timeSlots.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        timeHidden.value = btn.getAttribute('data-value');
        clearError(form.querySelector('[data-field="time"]'));
        updateSidebar();
      });
    });
  }

  /* ── Pre-select from ?service= param ───────────────────────────────────── */
  const params = new URLSearchParams(window.location.search);
  const preselect = params.get('service');
  if (preselect && SERVICES[preselect]) {
    serviceSelect.value = preselect;
    serviceSelect.dispatchEvent(new Event('change'));
  }

  /* ── Sidebar live update ───────────────────────────────────────────────── */
  function updateSidebar() {
    const svc = SERVICES[serviceSelect.value];
    sbService.textContent  = svc ? svc.label   : '—';
    sbPrice.textContent    = svc ? `₱${svc.price}` : '₱—';
    sbDuration.textContent = svc ? `${svc.duration} mins` : '—';

    const b = BARBERS[barberSelect.value];
    sbBarber.textContent = b ? b.name : 'No preference';

    if (dateInput.value) {
      const d = new Date(dateInput.value + 'T00:00:00');
      sbDate.textContent = d.toLocaleDateString('en-PH', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    } else {
      sbDate.textContent = '—';
    }

    sbTime.textContent = timeHidden.value
      ? formatTime(timeHidden.value)
      : '—';
  }

  function formatTime(val) {
    const [h, m] = val.split(':').map(Number);
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`;
  }

  // Also update sidebar from step-1 fields
  ['name','email'].forEach(f => {
    form.elements[f]?.addEventListener('input', updateSidebar);
  });

  /* ── Review panel ──────────────────────────────────────────────────────── */
  function buildReview() {
    const svc = SERVICES[serviceSelect.value];
    const b   = BARBERS[barberSelect.value];
    const d   = dateInput.value
      ? new Date(dateInput.value + 'T00:00:00').toLocaleDateString('en-PH',
          { weekday:'long', year:'numeric', month:'long', day:'numeric' })
      : '—';
    const t = timeHidden.value ? formatTime(timeHidden.value) : '—';

    document.getElementById('bookingReview').innerHTML = `
      <div class="review-row"><span class="review-label">Name</span><span class="review-val">${esc(form.elements['name'].value)}</span></div>
      <div class="review-row"><span class="review-label">Phone</span><span class="review-val">${esc(form.elements['phone'].value)}</span></div>
      <div class="review-row"><span class="review-label">Email</span><span class="review-val">${esc(form.elements['email'].value)}</span></div>
      <div class="review-divider"></div>
      <div class="review-row"><span class="review-label">Service</span><span class="review-val">${svc ? svc.label : '—'}</span></div>
      <div class="review-row"><span class="review-label">Price</span><span class="review-val" style="color:var(--color-secondary);font-weight:600;">${svc ? '₱' + svc.price : '—'}</span></div>
      <div class="review-row"><span class="review-label">Duration</span><span class="review-val">${svc ? svc.duration + ' mins' : '—'}</span></div>
      <div class="review-divider"></div>
      <div class="review-row"><span class="review-label">Barber</span><span class="review-val">${b ? b.name : 'No preference'}</span></div>
      <div class="review-row"><span class="review-label">Date</span><span class="review-val">${d}</span></div>
      <div class="review-row"><span class="review-label">Time</span><span class="review-val">${t}</span></div>
      ${form.elements['notes'].value ? `<div class="review-divider"></div><div class="review-row"><span class="review-label">Notes</span><span class="review-val">${esc(form.elements['notes'].value)}</span></div>` : ''}
    `;
  }

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Submit ────────────────────────────────────────────────────────────── */
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const svc  = SERVICES[serviceSelect.value];
    const name = form.elements['name'].value;
    const d    = new Date(dateInput.value + 'T00:00:00')
      .toLocaleDateString('en-PH', { weekday:'long', month:'long', day:'numeric' });
    const t = formatTime(timeHidden.value);
    confirmDesc.textContent =
      `${name}, you're booked for ${svc ? svc.label : 'your service'} on ${d} at ${t}. We'll send you an SMS confirmation shortly.`;
    confirmModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  });

  confirmClose.addEventListener('click', () => {
    confirmModal.classList.remove('open');
    document.body.style.overflow = '';
    resetAll();
  });
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) { confirmModal.classList.remove('open'); document.body.style.overflow = ''; }
  });

  /* ── Start Over ────────────────────────────────────────────────────────── */
  startOverBtn.addEventListener('click', () => {
    startOverModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
  startOverCancel.addEventListener('click', () => {
    startOverModal.classList.remove('open');
    document.body.style.overflow = '';
  });
  startOverConfirm.addEventListener('click', () => {
    startOverModal.classList.remove('open');
    document.body.style.overflow = '';
    resetAll();
  });

  function resetAll() {
    form.reset();
    form.querySelectorAll('.form-group').forEach(g => g.classList.remove('invalid'));
    form.querySelectorAll('.form-error').forEach(e => e.textContent = '');
    barberPreview.style.display = 'none';
    serviceDetail.style.display = 'none';
    timeGroup.style.display = 'none';
    timeSlots.innerHTML = '';
    timeHidden.value = '';
    if (notesCount) notesCount.textContent = '0';
    updateSidebar();
    goToStep(1);
  }
};
