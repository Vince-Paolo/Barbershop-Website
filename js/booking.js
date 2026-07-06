/* ==========================================================================
   FADED & CO — Enhanced Booking (backend-connected)
   Multi-step form · Live sidebar · Real-time time slots via /api/availability
   Phone formatter · Notes counter · Start-over confirm · Real submit via /api/bookings
   ========================================================================== */

window.initBooking = async function initBooking() {
  const form = document.getElementById('bookingForm');
  if (!form) return;

  /* ── Data (fetched from server so it never drifts from the backend) ─────── */
  let SERVICES = {};
  let BARBERS = {};

  try {
    const [servicesRes, barbersRes] = await Promise.all([
      fetch('/api/services'),
      fetch('/api/barbers'),
    ]);
    SERVICES = await servicesRes.json();
    BARBERS = await barbersRes.json();
  } catch (err) {
    console.error('Could not reach booking server. Is `node server/server.js` running?', err);
    const panel = form.querySelector('.booking-step-panel[data-panel="1"]');
    if (panel) {
      panel.insertAdjacentHTML(
        'afterbegin',
        `<p class="form-error" style="display:block;margin-bottom:1rem;">
           Can't connect to the booking server right now. Make sure it's running
           (<code>node server/server.js</code>) and refresh this page.
         </p>`
      );
    }
    return;
  }

  /* ── Elements ──────────────────────────────────────────────────────────── */
  const panels        = form.querySelectorAll('.booking-step-panel');
  const progressSteps = document.querySelectorAll('.booking-progress-step');
  const progressLines = document.querySelectorAll('.booking-progress-line');

  const barberSelect  = form.elements['barber'];
  const serviceSelect = form.elements['service'];
  const dateInput     = form.elements['date'];
  const timeHidden    = form.elements['time'];
  const notesTA       = form.elements['notes'];
  const notesCount    = document.getElementById('notesCount');
  const timeGroup     = document.getElementById('timeGroup');
  const timeSlots     = document.getElementById('timeSlots');
  const waitlistOffer     = document.getElementById('waitlistOffer');
  const waitlistOfferText = document.getElementById('waitlistOfferText');
  const waitlistJoinBtn   = document.getElementById('waitlistJoinBtn');
  const waitlistOfferNote = document.getElementById('waitlistOfferNote');
  const serviceDetail = document.getElementById('serviceDetail');
  const barberPreview = document.getElementById('barberPreview');

  // Sidebar
  const sbService  = document.getElementById('sb-service-val');
  const sbBarber   = document.getElementById('sb-barber-val');
  const sbDate     = document.getElementById('sb-date-val');
  const sbTime     = document.getElementById('sb-time-val');
  const sbPrice    = document.getElementById('sb-price-val');
  const sbDuration = document.getElementById('sb-duration-val');

  // Modals
  const confirmModal    = document.getElementById('confirmModal');
  const confirmDesc     = document.getElementById('confirmDesc');
  const confirmManageLink = document.getElementById('confirmManageLink');
  const confirmClose    = document.getElementById('confirmClose');
  const startOverModal  = document.getElementById('startOverModal');
  const startOverBtn    = document.getElementById('startOver');
  const startOverCancel = document.getElementById('startOverCancel');
  const startOverConfirm= document.getElementById('startOverConfirm');

  const submitBtn = form.querySelector('button[type="submit"]');

  let currentStep = 1;
  let availabilityToken = 0; // guards against out-of-order async responses

  /* ── Step navigation ───────────────────────────────────────────────────── */
  function goToStep(step) {
    panels.forEach((p) => p.classList.remove('active'));
    form.querySelector(`[data-panel="${step}"]`).classList.add('active');

    progressSteps.forEach((s, i) => {
      s.classList.toggle('active', i + 1 === step);
      s.classList.toggle('done', i + 1 < step);
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
    if (dateInput.value) buildTimeSlots();
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

  /* ── Date → fetch real-time slots from the server ──────────────────────── */
  const today = new Date().toISOString().split('T')[0];
  dateInput.setAttribute('min', today);

  dateInput.addEventListener('change', () => {
    buildTimeSlots();
    updateSidebar();
  });

  async function buildTimeSlots() {
    const date = dateInput.value;
    const service = serviceSelect.value;
    if (!date || !service) return;

    timeHidden.value = '';
    updateSidebar();
    hideWaitlistOffer();

    const myToken = ++availabilityToken;
    timeGroup.style.display = 'block';
    timeSlots.innerHTML = `<p class="time-slots-loading">Checking real-time availability…</p>`;

    const qs = new URLSearchParams({ date, service });
    if (barberSelect.value) qs.set('barber', barberSelect.value);

    let data;
    try {
      const res = await fetch(`/api/availability?${qs.toString()}`);
      data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load availability.');
    } catch (err) {
      if (myToken !== availabilityToken) return; // stale response, ignore
      timeSlots.innerHTML = `<p class="time-slots-empty">Couldn't load available times. Please try again.</p>`;
      return;
    }
    if (myToken !== availabilityToken) return; // a newer request has since been made

    const slots = data.slots || [];
    if (slots.length === 0) {
      timeSlots.innerHTML = `<p class="time-slots-empty">No open slots that day — try another date${barberSelect.value ? ' or barber' : ''}.</p>`;
      showWaitlistOffer();
      return;
    }

    timeSlots.innerHTML = slots.map((s) =>
      `<button type="button" class="time-slot-btn" data-value="${s.time}">${formatTime(s.time)}</button>`
    ).join('');

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

  /* ── Waitlist offer (shown when a date/service/barber has no open slots) ── */

  function hideWaitlistOffer() {
    waitlistOffer.style.display = 'none';
    waitlistOfferNote.style.display = 'none';
    waitlistOfferNote.textContent = '';
    waitlistJoinBtn.disabled = false;
    waitlistJoinBtn.textContent = 'Notify Me If a Slot Opens';
    waitlistJoinBtn.style.display = 'inline-block';
  }

  function showWaitlistOffer() {
    const b = BARBERS[barberSelect.value];
    waitlistOfferText.textContent = b
      ? `Fully booked with ${b.name} that day. Want us to reach out if a slot opens up?`
      : `Fully booked that day. Want us to reach out if a slot opens up?`;
    waitlistOffer.style.display = 'block';
  }

  waitlistJoinBtn.addEventListener('click', async () => {
    // Reuse step-1 contact info — make sure it's actually filled in first.
    if (!validateStep(1)) {
      goToStep(1);
      return;
    }
    if (!serviceSelect.value || !dateInput.value) return;

    waitlistJoinBtn.disabled = true;
    waitlistJoinBtn.textContent = 'Joining…';

    const payload = {
      name: form.elements['name'].value,
      phone: form.elements['phone'].value,
      email: form.elements['email'].value,
      service: serviceSelect.value,
      barber: barberSelect.value,
      date: dateInput.value,
      notes: form.elements['notes'].value,
    };

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]) || data.error || 'Could not join the waitlist.');

      waitlistJoinBtn.style.display = 'none';
      waitlistOfferNote.textContent = "You're on the waitlist — we'll reach out if that slot opens up.";
      waitlistOfferNote.style.display = 'block';
    } catch (err) {
      waitlistJoinBtn.disabled = false;
      waitlistJoinBtn.textContent = 'Notify Me If a Slot Opens';
      waitlistOfferNote.textContent = err.message;
      waitlistOfferNote.style.display = 'block';
    }
  });

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

  /* ── Submit (real POST to the backend) ─────────────────────────────────── */
  let submitting = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!validateStep(1) || !validateStep(2)) return;

    submitting = true;
    const originalBtnText = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Booking…'; }

    const payload = {
      name: form.elements['name'].value,
      phone: form.elements['phone'].value,
      email: form.elements['email'].value,
      service: serviceSelect.value,
      barber: barberSelect.value,
      date: dateInput.value,
      time: timeHidden.value,
      notes: form.elements['notes'].value,
    };

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.status === 409) {
        // Slot got taken between selection and submit — refresh slots and bounce back to step 2.
        goToStep(2);
        await buildTimeSlots();
        const timeGroupErr = form.querySelector('[data-field="time"]');
        if (timeGroupErr) showError(timeGroupErr, data.error || 'That slot was just booked. Please pick another time.');
        return;
      }
      if (res.status === 422) {
        goToStep(1);
        Object.entries(data.errors || {}).forEach(([field, msg]) => {
          const g = form.querySelector(`[data-field="${field}"]`);
          if (g) showError(g, msg);
        });
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      const svc = SERVICES[serviceSelect.value];
      const d = new Date(dateInput.value + 'T00:00:00')
        .toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
      const t = formatTime(timeHidden.value);
      const assignedBarber = BARBERS[data.booking.barber];
      confirmDesc.textContent =
        `${payload.name}, you're booked for ${svc ? svc.label : 'your service'} on ${d} at ${t}` +
        `${assignedBarber ? ` with ${assignedBarber.name}` : ''}. We've emailed your confirmation.`;
      if (data.booking.manage_token) {
        confirmManageLink.href = `manage.html?token=${data.booking.manage_token}`;
        confirmManageLink.style.display = 'inline-block';
      } else {
        confirmManageLink.style.display = 'none';
      }
      confirmModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    } catch (err) {
      const timeGroupErr = form.querySelector('[data-field="time"]');
      if (timeGroupErr) showError(timeGroupErr, err.message);
    } finally {
      submitting = false;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalBtnText; }
    }
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
    hideWaitlistOffer();
    if (notesCount) notesCount.textContent = '0';
    updateSidebar();
    goToStep(1);
  }
};
