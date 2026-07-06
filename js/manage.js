/* ==========================================================================
   FADED & CO — Manage Booking
   ========================================================================== */
(function () {
  const token = new URLSearchParams(window.location.search).get('token');

  const stateLoading  = document.getElementById('stateLoading');
  const stateNotFound = document.getElementById('stateNotFound');
  const stateCancelled= document.getElementById('stateCancelled');
  const stateActive   = document.getElementById('stateActive');
  const cancelledSummary = document.getElementById('cancelledSummary');

  const customerFirstName = document.getElementById('customerFirstName');
  const bookingSummary = document.getElementById('bookingSummary');

  const showRescheduleBtn = document.getElementById('showRescheduleBtn');
  const showCancelBtn     = document.getElementById('showCancelBtn');
  const reschedulePanel   = document.getElementById('reschedulePanel');
  const cancelPanel       = document.getElementById('cancelPanel');

  const newDate  = document.getElementById('newDate');
  const newTimeGroup = document.getElementById('newTimeGroup');
  const newTimeSlots = document.getElementById('newTimeSlots');
  const rescheduleError = document.getElementById('rescheduleError');
  const confirmRescheduleBtn = document.getElementById('confirmRescheduleBtn');
  const cancelRescheduleBtn  = document.getElementById('cancelRescheduleBtn');

  const confirmCancelBtn  = document.getElementById('confirmCancelBtn');
  const dismissCancelBtn  = document.getElementById('dismissCancelBtn');

  let current = null; // { booking, service, barber }
  let selectedTime = '';

  function showOnly(el) {
    [stateLoading, stateNotFound, stateCancelled, stateActive].forEach((s) => {
      s.style.display = s === el ? 'block' : 'none';
    });
  }

  function formatTime(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  function formatDateLong(dateStr) {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }
  function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function row(label, value) {
    return `<div class="manage-summary-row">
      <span class="manage-summary-label">${label}</span>
      <span class="manage-summary-value">${value}</span>
    </div>`;
  }

  function renderSummary() {
    const { booking, service, barber } = current;
    customerFirstName.textContent = booking.name.split(' ')[0];
    bookingSummary.innerHTML = [
      row('Service', service ? esc(service.label) : esc(booking.service)),
      row('Date', formatDateLong(booking.date)),
      row('Time', formatTime(booking.time)),
      row('Barber', barber ? esc(barber.name) : 'No preference'),
      row('Price', service ? `₱${service.price}` : '—'),
      row('Status', `<span class="status-pill ${booking.status}">${booking.status}</span>`),
    ].join('');
  }

  async function load() {
    if (!token) { showOnly(stateNotFound); return; }
    try {
      const res = await fetch(`/api/manage/${encodeURIComponent(token)}`);
      if (!res.ok) { showOnly(stateNotFound); return; }
      current = await res.json();
      if (current.booking.status === 'cancelled') {
        cancelledSummary.textContent =
          `${current.service ? current.service.label : 'Your appointment'} on ` +
          `${formatDateLong(current.booking.date)} at ${formatTime(current.booking.time)}.`;
        showOnly(stateCancelled);
        return;
      }
      renderSummary();
      const today = new Date().toISOString().split('T')[0];
      newDate.setAttribute('min', today);
      showOnly(stateActive);
    } catch (err) {
      showOnly(stateNotFound);
    }
  }

  /* ── Reschedule ──────────────────────────────────────────────────────── */

  showRescheduleBtn.addEventListener('click', () => {
    cancelPanel.style.display = 'none';
    reschedulePanel.style.display = reschedulePanel.style.display === 'block' ? 'none' : 'block';
  });
  cancelRescheduleBtn.addEventListener('click', () => {
    reschedulePanel.style.display = 'none';
  });

  newDate.addEventListener('change', async () => {
    selectedTime = '';
    confirmRescheduleBtn.disabled = true;
    rescheduleError.textContent = '';
    const date = newDate.value;
    if (!date) { newTimeGroup.style.display = 'none'; return; }

    newTimeGroup.style.display = 'block';
    newTimeSlots.innerHTML = `<p class="time-slots-loading">Checking real-time availability…</p>`;

    const qs = new URLSearchParams({
      date,
      service: current.booking.service,
      excludeBookingId: String(current.booking.id),
    });
    if (current.booking.barber) qs.set('barber', current.booking.barber);

    try {
      const res = await fetch(`/api/availability?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load availability.');

      if (!data.slots.length) {
        newTimeSlots.innerHTML = `<p class="time-slots-empty">No open slots that day — try another date.</p>`;
        return;
      }
      newTimeSlots.innerHTML = data.slots.map((s) =>
        `<button type="button" class="time-slot-btn" data-value="${s.time}">${formatTime(s.time)}</button>`
      ).join('');
      newTimeSlots.querySelectorAll('.time-slot-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          newTimeSlots.querySelectorAll('.time-slot-btn').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedTime = btn.getAttribute('data-value');
          confirmRescheduleBtn.disabled = false;
        });
      });
    } catch (err) {
      newTimeSlots.innerHTML = `<p class="time-slots-empty">Couldn't load available times. Please try again.</p>`;
    }
  });

  confirmRescheduleBtn.addEventListener('click', async () => {
    if (!newDate.value || !selectedTime) return;
    confirmRescheduleBtn.disabled = true;
    confirmRescheduleBtn.textContent = 'Saving…';
    rescheduleError.textContent = '';

    try {
      const res = await fetch(`/api/manage/${encodeURIComponent(token)}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate.value, time: selectedTime }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not reschedule. Please try again.');

      current.booking = data.booking;
      renderSummary();
      reschedulePanel.style.display = 'none';
      newDate.value = '';
      newTimeGroup.style.display = 'none';
      newTimeSlots.innerHTML = '';
    } catch (err) {
      rescheduleError.textContent = err.message;
    } finally {
      confirmRescheduleBtn.disabled = false;
      confirmRescheduleBtn.textContent = 'Confirm New Time';
    }
  });

  /* ── Cancel ──────────────────────────────────────────────────────────── */

  showCancelBtn.addEventListener('click', () => {
    reschedulePanel.style.display = 'none';
    cancelPanel.style.display = cancelPanel.style.display === 'block' ? 'none' : 'block';
  });
  dismissCancelBtn.addEventListener('click', () => {
    cancelPanel.style.display = 'none';
  });

  confirmCancelBtn.addEventListener('click', async () => {
    confirmCancelBtn.disabled = true;
    confirmCancelBtn.textContent = 'Cancelling…';
    try {
      const res = await fetch(`/api/manage/${encodeURIComponent(token)}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not cancel. Please try again.');
      current.booking = data.booking;
      cancelledSummary.textContent =
        `${current.service ? current.service.label : 'Your appointment'} on ` +
        `${formatDateLong(current.booking.date)} at ${formatTime(current.booking.time)}.`;
      showOnly(stateCancelled);
    } catch (err) {
      alert(err.message);
    } finally {
      confirmCancelBtn.disabled = false;
      confirmCancelBtn.textContent = 'Yes, Cancel It';
    }
  });

  load();
})();
