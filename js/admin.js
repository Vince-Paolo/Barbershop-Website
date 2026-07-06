/* ==========================================================================
   FADED & CO — Admin Dashboard
   ========================================================================== */
(function () {
  const loginScreen = document.getElementById('loginScreen');
  const dashboard   = document.getElementById('dashboard');
  const loginForm   = document.getElementById('loginForm');
  const loginError  = document.getElementById('loginError');
  const logoutBtn   = document.getElementById('logoutBtn');

  const filterDate   = document.getElementById('filterDate');
  const filterStatus = document.getElementById('filterStatus');
  const refreshBtn   = document.getElementById('refreshBookings');
  const clearBtn     = document.getElementById('clearFilters');
  const bookingsWrap = document.getElementById('bookingsTableWrap');

  const timeoffForm  = document.getElementById('timeoffForm');
  const toBarberSel  = document.getElementById('toBarber');
  const toRecurrence = document.getElementById('toRecurrence');
  const toDateGroup  = document.getElementById('toDateGroup');
  const toWeekdayGroup = document.getElementById('toWeekdayGroup');
  const toDateInput  = document.getElementById('toDate');
  const toWeekdaySel = document.getElementById('toWeekday');
  const timeoffWrap  = document.getElementById('timeoffTableWrap');

  const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const analyticsForm  = document.getElementById('analyticsForm');
  const analyticsFrom  = document.getElementById('analyticsFrom');
  const analyticsTo    = document.getElementById('analyticsTo');
  const analyticsClear = document.getElementById('analyticsClear');
  const analyticsWrap  = document.getElementById('analyticsWrap');

  const wlFilterDate    = document.getElementById('wlFilterDate');
  const wlFilterStatus  = document.getElementById('wlFilterStatus');
  const wlRefresh       = document.getElementById('wlRefresh');
  const wlClearFilters  = document.getElementById('wlClearFilters');
  const waitlistWrap    = document.getElementById('waitlistTableWrap');

  const adminBar        = document.getElementById('adminBar');
  const adminNav        = document.getElementById('adminNav');
  const adminBarActions = document.getElementById('adminBarActions');
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const adminClose      = document.getElementById('adminClose');
  const adminBackdrop   = document.getElementById('adminBackdrop');
  const waitlistBadge   = document.getElementById('waitlistBadge');
  const navLinks        = document.querySelectorAll('.admin-nav-link');

  function closeMobileMenu() {
    if (!adminBarActions || !mobileMenuToggle || !adminBackdrop) return;
    adminBarActions.classList.remove('open');
    mobileMenuToggle.classList.remove('open');
    adminBackdrop.classList.remove('visible');
    mobileMenuToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  function setupScrollSpy() {
    const targets = Array.from(navLinks)
      .map((link) => document.getElementById(link.dataset.target))
      .filter(Boolean);
    if (!targets.length || !('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((l) => l.classList.toggle('active', l.dataset.target === entry.target.id));
      });
    }, { rootMargin: '-40% 0px -50% 0px' });
    targets.forEach((t) => obs.observe(t));
  }

  let adminPassword = sessionStorage.getItem('fadedco_admin_pw') || '';

  function authHeaders() {
    return { 'x-admin-password': adminPassword };
  }

  function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatTime(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  function formatDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  function skeleton(rows = 3) {
    return `<div class="skeleton-rows">${
      Array.from({ length: rows }).map(() => '<div class="skeleton-row"></div>').join('')
    }</div>`;
  }

  function emptyState(message) {
    return `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
          <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
        </svg>
        <p>${esc(message)}</p>
      </div>`;
  }

  /* ── Auth ────────────────────────────────────────────────────────────── */

  async function tryEnterDashboard() {
    if (!adminPassword) return showLogin();
    try {
      const res = await fetch('/api/bookings', { headers: authHeaders() });
      if (res.status === 401) {
        adminPassword = '';
        sessionStorage.removeItem('fadedco_admin_pw');
        return showLogin();
      }
      showDashboard();
    } catch (err) {
      loginError.textContent = 'Could not reach the admin backend. Please run the site from the server.';
      showLogin();
    }
  }

  function showLogin() {
    loginScreen.style.display = 'flex';
    dashboard.style.display = 'none';
    logoutBtn.style.display = 'none';
    adminNav.style.display = 'none';
    adminBar.classList.remove('is-authenticated');
    closeMobileMenu();
  }

  function showDashboard() {
    loginScreen.style.display = 'none';
    dashboard.style.display = 'block';
    logoutBtn.style.display = 'inline-block';
    adminNav.style.display = 'flex';
    adminBar.classList.add('is-authenticated');
    closeMobileMenu();
    setupScrollSpy();
    if (window.initScrollReveal) window.initScrollReveal();
    loadBarbersIntoSelect();
    loadBookings();
    loadTimeOff();
    loadAnalytics();
    loadWaitlist();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = document.getElementById('adminPassword').value;
    loginError.textContent = '';
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) {
        const data = await res.json();
        loginError.textContent = data.error || 'Incorrect password.';
        return;
      }
      adminPassword = pw;
      sessionStorage.setItem('fadedco_admin_pw', pw);
      showDashboard();
    } catch (err) {
      loginError.textContent = 'Could not reach the server.';
    }
  });

  logoutBtn.addEventListener('click', () => {
    adminPassword = '';
    sessionStorage.removeItem('fadedco_admin_pw');
    showLogin();
  });

  function openMobileMenu() {
    if (!adminBarActions || !mobileMenuToggle || !adminBackdrop) return;
    adminBarActions.classList.add('open');
    mobileMenuToggle.classList.add('open');
    adminBackdrop.classList.add('visible');
    mobileMenuToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => {
      if (!adminBar.classList.contains('is-authenticated')) return;
      if (adminBarActions.classList.contains('open')) closeMobileMenu();
      else openMobileMenu();
    });
  }

  if (adminClose) {
    adminClose.addEventListener('click', closeMobileMenu);
  }

  if (adminBackdrop) {
    adminBackdrop.addEventListener('click', closeMobileMenu);
  }

  navLinks.forEach((link) => link.addEventListener('click', closeMobileMenu));

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeMobileMenu();
  });

  /* ── Bookings ────────────────────────────────────────────────────────── */

  async function loadBookings() {
    bookingsWrap.innerHTML = skeleton(4);
    const qs = new URLSearchParams();
    if (filterDate.value) qs.set('date', filterDate.value);
    if (filterStatus.value) qs.set('status', filterStatus.value);

    const res = await fetch(`/api/bookings?${qs.toString()}`, { headers: authHeaders() });
    if (res.status === 401) return showLogin();
    const data = await res.json();
    renderBookings(data.bookings || []);
  }

  function renderBookings(bookings) {
    if (bookings.length === 0) {
      bookingsWrap.innerHTML = emptyState('No bookings match these filters.');
      return;
    }
    bookingsWrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Date</th><th>Time</th><th>Customer</th><th>Contact</th>
            <th>Service</th><th>Barber</th><th>Status</th><th>Notes</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${bookings.map((b) => `
            <tr data-id="${b.id}">
              <td data-label="Date">${formatDate(b.date)}</td>
              <td data-label="Time">${formatTime(b.time)}</td>
              <td data-label="Customer">${esc(b.name)}</td>
              <td data-label="Contact">${esc(b.phone)}<br><span class="cell-muted">${esc(b.email)}</span></td>
              <td data-label="Service">${esc(b.service)}<br><span class="cell-muted">₱${b.price} · ${b.duration}min</span></td>
              <td data-label="Barber">${esc(b.barber)}</td>
              <td data-label="Status"><span class="status-pill ${b.status}">${b.status.replace('_', '-')}</span></td>
              <td data-label="Notes" style="max-width:180px;">${esc(b.notes || '')}</td>
              <td data-label="">
                <div class="row-actions">
                  ${b.status === 'confirmed'
                    ? `<button data-action="no_show" data-id="${b.id}">No-Show</button><button data-action="cancel" data-id="${b.id}">Cancel</button>`
                    : `<button data-action="restore" data-id="${b.id}">Restore</button>`}
                  <button data-action="delete" data-id="${b.id}" class="danger">Delete</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    bookingsWrap.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        btn.disabled = true;
        try {
          if (action === 'cancel') {
            await fetch(`/api/bookings/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', ...authHeaders() },
              body: JSON.stringify({ status: 'cancelled' }),
            });
          } else if (action === 'no_show') {
            await fetch(`/api/bookings/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', ...authHeaders() },
              body: JSON.stringify({ status: 'no_show' }),
            });
          } else if (action === 'restore') {
            await fetch(`/api/bookings/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', ...authHeaders() },
              body: JSON.stringify({ status: 'confirmed' }),
            });
          } else if (action === 'delete') {
            if (!confirm('Permanently delete this booking?')) { btn.disabled = false; return; }
            await fetch(`/api/bookings/${id}`, { method: 'DELETE', headers: authHeaders() });
          }
          loadBookings();
        } catch (err) {
          alert('Something went wrong. Please try again.');
          btn.disabled = false;
        }
      });
    });
  }

  refreshBtn.addEventListener('click', loadBookings);
  filterDate.addEventListener('change', loadBookings);
  filterStatus.addEventListener('change', loadBookings);
  clearBtn.addEventListener('click', () => {
    filterDate.value = '';
    filterStatus.value = '';
    loadBookings();
  });

  /* ── Time off ────────────────────────────────────────────────────────── */

  async function loadBarbersIntoSelect() {
    if (toBarberSel.dataset.loaded) return;
    const res = await fetch('/api/barbers');
    const barbers = await res.json();
    Object.entries(barbers).forEach(([slug, b]) => {
      const opt = document.createElement('option');
      opt.value = slug;
      opt.textContent = b.name;
      toBarberSel.appendChild(opt);
    });
    toBarberSel.dataset.loaded = '1';
  }

  async function loadTimeOff() {
    timeoffWrap.innerHTML = skeleton(2);
    const res = await fetch('/api/timeoff', { headers: authHeaders() });
    if (res.status === 401) return showLogin();
    const data = await res.json();
    renderTimeOff(data.timeOff || []);
  }

  function renderTimeOff(rows) {
    if (rows.length === 0) {
      timeoffWrap.innerHTML = emptyState('No blocked time yet.');
      return;
    }
    timeoffWrap.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>When</th><th>Time</th><th>Who</th><th>Reason</th><th></th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td data-label="When">${r.date ? formatDate(r.date) : `<span class="pill-recurring">Every ${WEEKDAY_NAMES[r.weekday]}</span>`}</td>
              <td data-label="Time">${formatTime(r.start_time)} – ${formatTime(r.end_time)}</td>
              <td data-label="Who">${r.barber === '*' ? 'Whole shop' : esc(r.barber)}</td>
              <td data-label="Reason">${esc(r.reason || '')}</td>
              <td data-label=""><button data-id="${r.id}" class="danger" data-action="delete-timeoff">Remove</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    timeoffWrap.querySelectorAll('button[data-action="delete-timeoff"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await fetch(`/api/timeoff/${btn.getAttribute('data-id')}`, { method: 'DELETE', headers: authHeaders() });
        loadTimeOff();
      });
    });
  }

  toRecurrence.addEventListener('change', () => {
    const weekly = toRecurrence.value === 'weekly';
    toDateGroup.style.display = weekly ? 'none' : 'block';
    toWeekdayGroup.style.display = weekly ? 'block' : 'none';
    toDateInput.required = !weekly;
  });

  timeoffForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const weekly = toRecurrence.value === 'weekly';
    const body = {
      barber: toBarberSel.value,
      start_time: document.getElementById('toStart').value,
      end_time: document.getElementById('toEnd').value,
      reason: document.getElementById('toReason').value,
    };
    if (weekly) {
      body.weekday = Number(toWeekdaySel.value);
    } else {
      body.date = toDateInput.value;
    }
    const res = await fetch('/api/timeoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (res.status === 401) return showLogin();
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Could not block that time.');
      return;
    }
    timeoffForm.reset();
    toDateGroup.style.display = 'block';
    toWeekdayGroup.style.display = 'none';
    toDateInput.required = true;
    loadTimeOff();
  });

  /* ── Analytics ───────────────────────────────────────────────────────── */

  function barRow(label, count, max) {
    const pct = max > 0 ? Math.round((count / max) * 100) : 0;
    return `
      <div class="stat-bar-row">
        <span class="stat-bar-label">${esc(label)}</span>
        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%;"></div></div>
        <span class="stat-bar-value">${count}</span>
      </div>`;
  }

  async function loadAnalytics() {
    analyticsWrap.innerHTML = skeleton(4);
    const qs = new URLSearchParams();
    if (analyticsFrom.value) qs.set('from', analyticsFrom.value);
    if (analyticsTo.value) qs.set('to', analyticsTo.value);

    const res = await fetch(`/api/analytics?${qs.toString()}`, { headers: authHeaders() });
    if (res.status === 401) return showLogin();
    const data = await res.json();
    if (!res.ok) {
      analyticsWrap.innerHTML = `<p class="empty-note">${esc(data.error || 'Could not load analytics.')}</p>`;
      return;
    }
    renderAnalytics(data);
  }

  // Chart.js instances, keyed by canvas id — destroyed and rebuilt on every render
  // (filters changing, panel reopening) so canvases don't silently pile up.
  const chartInstances = {};
  function renderChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
    chartInstances[canvasId] = new Chart(canvas.getContext('2d'), config);
  }

  const CHART_FONT = "'Poppins', sans-serif";
  const CHART_GOLD = '#D4AF37';
  const CHART_PRIMARY = '#1A1A1A';
  const CHART_PALETTE = ['#D4AF37', '#1A1A1A', '#8a6d1a', '#c0392b', '#4a4a4a', '#b08d2a', '#6b6b6b', '#9c7a1e'];

  Chart.defaults.font.family = CHART_FONT;
  Chart.defaults.color = '#6b6b6b';

  function renderAnalytics(data) {
    const { summary, busiestHours, busiestDays, topServices, byBarber, revenueByWeek, customerGrowthByWeek } = data;

    if (summary.totalBookings === 0 && summary.cancelledCount === 0 && summary.noShowCount === 0) {
      analyticsWrap.innerHTML = emptyState('No bookings in this range yet.');
      return;
    }

    const maxDay = Math.max(1, ...busiestDays.map((d) => d.count));
    const maxBarber = Math.max(1, ...byBarber.map((b) => b.revenue));

    analyticsWrap.innerHTML = `
      <div class="stat-cards">
        <div class="stat-card">
          <span class="stat-card-value">${summary.totalBookings}</span>
          <span class="stat-card-label">Confirmed bookings</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-value">₱${summary.totalRevenue.toLocaleString()}</span>
          <span class="stat-card-label">Revenue</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-value">₱${summary.avgTicket.toLocaleString()}</span>
          <span class="stat-card-label">Avg. ticket</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-value">${summary.cancellationRate}%</span>
          <span class="stat-card-label">Cancellation rate (${summary.cancelledCount})</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-value">${summary.noShowRate}%</span>
          <span class="stat-card-label">No-show rate (${summary.noShowCount})</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-value">${summary.totalCustomers}</span>
          <span class="stat-card-label">Customers this range</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-value">${summary.newCustomers}</span>
          <span class="stat-card-label">New customers</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-value">${summary.returningRate}%</span>
          <span class="stat-card-label">Returning customers (${summary.returningCustomers})</span>
        </div>
      </div>

      <div class="chart-grid">
        <div class="chart-card chart-card-wide">
          <h3 class="stat-block-title">Appointments &amp; Revenue</h3>
          ${revenueByWeek.length ? '<div class="chart-canvas-wrap"><canvas id="chartAppointmentsRevenue"></canvas></div>' : '<p class="empty-note">No data yet.</p>'}
        </div>
        <div class="chart-card">
          <h3 class="stat-block-title">Popular Services</h3>
          ${topServices.length ? '<div class="chart-canvas-wrap"><canvas id="chartServices"></canvas></div>' : '<p class="empty-note">No data yet.</p>'}
        </div>
        <div class="chart-card">
          <h3 class="stat-block-title">Peak Hours</h3>
          ${busiestHours.some((h) => h.count > 0) ? '<div class="chart-canvas-wrap"><canvas id="chartPeakHours"></canvas></div>' : '<p class="empty-note">No data yet.</p>'}
        </div>
        <div class="chart-card chart-card-wide">
          <h3 class="stat-block-title">Customer Growth</h3>
          ${customerGrowthByWeek.length ? '<div class="chart-canvas-wrap"><canvas id="chartCustomerGrowth"></canvas></div>' : '<p class="empty-note">No new customers in this range yet.</p>'}
        </div>
        <div class="chart-card">
          <h3 class="stat-block-title">Booking Outcomes</h3>
          <div class="chart-canvas-wrap chart-canvas-wrap-small"><canvas id="chartOutcomes"></canvas></div>
        </div>
        <div class="chart-card">
          <h3 class="stat-block-title">New vs Returning</h3>
          ${summary.totalCustomers ? '<div class="chart-canvas-wrap chart-canvas-wrap-small"><canvas id="chartNewVsReturning"></canvas></div>' : '<p class="empty-note">No data yet.</p>'}
        </div>
      </div>

      <div class="stat-grid" style="margin-top:8px;">
        <div class="stat-block">
          <h3 class="stat-block-title">Busiest Days</h3>
          ${busiestDays.map((d) => barRow(d.day, d.count, maxDay)).join('')}
        </div>
        <div class="stat-block">
          <h3 class="stat-block-title">Revenue by Barber</h3>
          ${byBarber.length
            ? byBarber.map((b) => barRow(`${b.name} · ${b.count} bookings`, b.revenue, maxBarber)).join('')
            : '<p class="empty-note">No data yet.</p>'}
        </div>
      </div>
    `;

    // Appointments & Revenue — grouped bars (appointments) + line (revenue, right axis)
    if (revenueByWeek.length) {
      renderChart('chartAppointmentsRevenue', {
        type: 'bar',
        data: {
          labels: revenueByWeek.map((w) => `Wk of ${formatDate(w.weekStart)}`),
          datasets: [
            {
              type: 'bar',
              label: 'Appointments',
              data: revenueByWeek.map((w) => w.count),
              backgroundColor: 'rgba(26,26,26,.75)',
              borderRadius: 4,
              yAxisID: 'y',
              order: 2,
            },
            {
              type: 'line',
              label: 'Revenue (₱)',
              data: revenueByWeek.map((w) => w.revenue),
              borderColor: CHART_GOLD,
              backgroundColor: CHART_GOLD,
              tension: 0.35,
              pointRadius: 3,
              yAxisID: 'y1',
              order: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Appointments' }, grid: { color: '#f0f0f0' } },
            y1: { beginAtZero: true, position: 'right', title: { display: true, text: 'Revenue (₱)' }, grid: { display: false } },
          },
          plugins: { legend: { position: 'bottom' } },
        },
      });
    }

    // Popular Services — doughnut
    if (topServices.length) {
      renderChart('chartServices', {
        type: 'doughnut',
        data: {
          labels: topServices.map((s) => s.label),
          datasets: [{ data: topServices.map((s) => s.count), backgroundColor: CHART_PALETTE }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
        },
      });
    }

    // Peak Hours — bar
    if (busiestHours.some((h) => h.count > 0)) {
      renderChart('chartPeakHours', {
        type: 'bar',
        data: {
          labels: busiestHours.map((h) => formatHourLabel(h.hour)),
          datasets: [{ label: 'Appointments', data: busiestHours.map((h) => h.count), backgroundColor: CHART_GOLD, borderRadius: 4 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        },
      });
    }

    // Customer Growth — cumulative line + new-per-week bars
    if (customerGrowthByWeek.length) {
      renderChart('chartCustomerGrowth', {
        data: {
          labels: customerGrowthByWeek.map((w) => `Wk of ${formatDate(w.weekStart)}`),
          datasets: [
            {
              type: 'bar',
              label: 'New customers',
              data: customerGrowthByWeek.map((w) => w.newCustomers),
              backgroundColor: 'rgba(212,175,55,.55)',
              borderRadius: 4,
              yAxisID: 'y',
            },
            {
              type: 'line',
              label: 'Total customers (cumulative)',
              data: customerGrowthByWeek.map((w) => w.cumulativeCustomers),
              borderColor: CHART_PRIMARY,
              backgroundColor: CHART_PRIMARY,
              tension: 0.3,
              pointRadius: 3,
              yAxisID: 'y1',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: { beginAtZero: true, position: 'left', title: { display: true, text: 'New / week' }, grid: { color: '#f0f0f0' } },
            y1: { beginAtZero: true, position: 'right', title: { display: true, text: 'Cumulative' }, grid: { display: false } },
          },
          plugins: { legend: { position: 'bottom' } },
        },
      });
    }

    // Booking Outcomes — Completed / Cancelled / No-show
    renderChart('chartOutcomes', {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'Cancelled', 'No-show'],
        datasets: [{
          data: [summary.totalBookings, summary.cancelledCount, summary.noShowCount],
          backgroundColor: ['#2e7d32', '#b3261e', '#e67e22'],
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
      },
    });

    // New vs Returning customers
    if (summary.totalCustomers) {
      renderChart('chartNewVsReturning', {
        type: 'doughnut',
        data: {
          labels: ['New', 'Returning'],
          datasets: [{
            data: [summary.newCustomers, summary.returningCustomers],
            backgroundColor: [CHART_GOLD, CHART_PRIMARY],
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
        },
      });
    }
  }

  function formatHourLabel(hour) {
    const ampm = hour < 12 ? 'AM' : 'PM';
    return `${hour % 12 || 12}:00 ${ampm}`;
  }

  analyticsForm.addEventListener('submit', (e) => { e.preventDefault(); loadAnalytics(); });
  analyticsClear.addEventListener('click', () => {
    analyticsFrom.value = '';
    analyticsTo.value = '';
    loadAnalytics();
  });

  /* ── Waitlist ────────────────────────────────────────────────────────── */

  const WAITLIST_ACTIONS = {
    waiting:   [['notified', 'Mark Notified'], ['booked', 'Mark Booked'], ['cancelled', 'Cancel']],
    notified:  [['booked', 'Mark Booked'], ['waiting', 'Back to Waiting'], ['cancelled', 'Cancel']],
    booked:    [['waiting', 'Reopen'], ['cancelled', 'Cancel']],
    cancelled: [['waiting', 'Reopen']],
  };

  async function loadWaitlist() {
    waitlistWrap.innerHTML = skeleton(3);
    const qs = new URLSearchParams();
    if (wlFilterDate.value) qs.set('date', wlFilterDate.value);
    if (wlFilterStatus.value) qs.set('status', wlFilterStatus.value);

    const res = await fetch(`/api/waitlist?${qs.toString()}`, { headers: authHeaders() });
    if (res.status === 401) return showLogin();
    const data = await res.json();
    renderWaitlist(data.waitlist || []);
  }

  function renderWaitlist(rows) {
    const notifiedCount = rows.filter((r) => r.status === 'notified').length;
    if (notifiedCount > 0) {
      waitlistBadge.textContent = notifiedCount;
      waitlistBadge.style.display = 'inline-block';
    } else {
      waitlistBadge.style.display = 'none';
    }

    if (rows.length === 0) {
      waitlistWrap.innerHTML = emptyState('No one on the waitlist right now.');
      return;
    }
    // Notified entries first — those are the ones staff need to act on.
    const order = { notified: 0, waiting: 1, booked: 2, cancelled: 3 };
    const sorted = [...rows].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

    waitlistWrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Date</th><th>Customer</th><th>Contact</th>
            <th>Service</th><th>Barber</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map((r) => `
            <tr data-id="${r.id}" class="${r.status === 'notified' ? 'row-highlight' : ''}">
              <td data-label="Date">${formatDate(r.date)}</td>
              <td data-label="Customer">${esc(r.name)}${r.notes ? `<br><span class="cell-muted">${esc(r.notes)}</span>` : ''}</td>
              <td data-label="Contact">${esc(r.phone)}<br><span class="cell-muted">${esc(r.email)}</span></td>
              <td data-label="Service">${esc(r.service)}</td>
              <td data-label="Barber">${r.barber ? esc(r.barber) : '<span class="cell-muted">No preference</span>'}</td>
              <td data-label="Status"><span class="status-pill ${r.status}">${r.status}</span></td>
              <td data-label="">
                <div class="row-actions">
                  ${(WAITLIST_ACTIONS[r.status] || []).map(([status, label]) =>
                    `<button data-action="wl-status" data-status="${status}" data-id="${r.id}"${status === 'cancelled' ? ' class="danger"' : ''}>${label}</button>`
                  ).join('')}
                  <button data-action="wl-delete" data-id="${r.id}" class="danger">Delete</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    waitlistWrap.querySelectorAll('button[data-action="wl-status"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await fetch(`/api/waitlist/${btn.getAttribute('data-id')}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ status: btn.getAttribute('data-status') }),
          });
          loadWaitlist();
        } catch (err) {
          alert('Something went wrong. Please try again.');
          btn.disabled = false;
        }
      });
    });

    waitlistWrap.querySelectorAll('button[data-action="wl-delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this waitlist entry?')) return;
        btn.disabled = true;
        await fetch(`/api/waitlist/${btn.getAttribute('data-id')}`, { method: 'DELETE', headers: authHeaders() });
        loadWaitlist();
      });
    });
  }

  wlRefresh.addEventListener('click', loadWaitlist);
  wlFilterDate.addEventListener('change', loadWaitlist);
  wlFilterStatus.addEventListener('change', loadWaitlist);
  wlClearFilters.addEventListener('click', () => {
    wlFilterDate.value = '';
    wlFilterStatus.value = '';
    loadWaitlist();
  });

  if (window.initScrollReveal) window.initScrollReveal();
  tryEnterDashboard();
})();
