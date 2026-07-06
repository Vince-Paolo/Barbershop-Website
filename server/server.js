'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const db = require('./db');
const { SERVICES, BARBERS } = require('./data');
const { PORT, ADMIN_PASSWORD, APP_URL, BUFFER_MINUTES } = require('./config');
const { getAvailability, isBarberFree, isPastDateTime } = require('./availability');
const { generateManageToken } = require('./tokens');
const {
  sendEmail,
  bookingConfirmationEmail,
  bookingCancellationEmail,
  bookingRescheduledEmail,
} = require('./email');
const { startReminderJob } = require('./reminders');
const { getAnalytics } = require('./analytics');

const ROOT = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1e6) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks += chunk;
    });
    req.on('end', () => {
      if (!chunks) return resolve({});
      try {
        resolve(JSON.parse(chunks));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function isAdmin(req) {
  return (req.headers['x-admin-password'] || '') === ADMIN_PASSWORD;
}

function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    sendJSON(res, 401, { error: 'Unauthorized' });
    return false;
  }
  return true;
}

function manageUrlFor(token) {
  return `${APP_URL}/manage.html?token=${token}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/* ── Validation ──────────────────────────────────────────────────────────── */

function validateBookingInput(body) {
  const errors = {};
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const email = String(body.email || '').trim();
  const service = String(body.service || '').trim();
  const barber = String(body.barber || '').trim(); // '' = no preference
  const date = String(body.date || '').trim();
  const time = String(body.time || '').trim();
  const notes = String(body.notes || '').trim();

  if (name.length < 2) errors.name = 'Enter your full name.';
  if (!/^[0-9+\-\s()]{7,}$/.test(phone)) errors.phone = 'Enter a valid phone number.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email.';
  if (!SERVICES[service]) errors.service = 'Choose a valid service.';
  if (barber && !BARBERS[barber]) errors.barber = 'Choose a valid barber.';
  if (!DATE_RE.test(date)) errors.date = 'Choose a valid date.';
  if (!TIME_RE.test(time)) errors.time = 'Select a time slot.';
  if (DATE_RE.test(date) && TIME_RE.test(time) && isPastDateTime(date, time)) {
    errors.time = 'That time has already passed.';
  }

  return { errors, value: { name, phone, email, service, barber, date, time, notes } };
}

function validateWaitlistInput(body) {
  const errors = {};
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const email = String(body.email || '').trim();
  const service = String(body.service || '').trim();
  const barber = String(body.barber || '').trim(); // '' = no preference
  const date = String(body.date || '').trim();
  const notes = String(body.notes || '').trim();

  if (name.length < 2) errors.name = 'Enter your full name.';
  if (!/^[0-9+\-\s()]{7,}$/.test(phone)) errors.phone = 'Enter a valid phone number.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email.';
  if (!SERVICES[service]) errors.service = 'Choose a valid service.';
  if (barber && !BARBERS[barber]) errors.barber = 'Choose a valid barber.';
  if (!DATE_RE.test(date)) errors.date = 'Choose a valid date.';

  return { errors, value: { name, phone, email, service, barber: barber || null, date, notes } };
}

/**
 * When a slot frees up (a booking is cancelled or deleted), flag any waiting
 * waitlist entries for that date/service (matching barber, or no-preference)
 * as "notified" so staff know to reach out. There's no email/SMS provider
 * wired in for the waitlist yet — this just surfaces the match in the admin
 * dashboard (unlike bookings, which do get real emails via server/email.js).
 */
function notifyWaitlistForOpening(date, service, barber) {
  const rows = db
    .prepare(
      `SELECT * FROM waitlist
       WHERE status = 'waiting' AND date = ? AND service = ?
         AND (barber IS NULL OR barber = ?)`
    )
    .all(date, service, barber);
  for (const row of rows) {
    db.prepare(`UPDATE waitlist SET status = 'notified', notified_at = datetime('now') WHERE id = ?`).run(row.id);
  }
  return rows.length;
}

/* ── Route handlers ──────────────────────────────────────────────────────── */

async function handleApi(req, res, pathname, query) {
  // GET /api/services
  if (pathname === '/api/services' && req.method === 'GET') {
    return sendJSON(res, 200, SERVICES);
  }

  // GET /api/barbers
  if (pathname === '/api/barbers' && req.method === 'GET') {
    return sendJSON(res, 200, BARBERS);
  }

  // GET /api/availability?date=&service=&barber=&excludeBookingId=
  if (pathname === '/api/availability' && req.method === 'GET') {
    const date = query.get('date');
    const service = query.get('service');
    const barber = query.get('barber') || '';
    const excludeBookingId = query.get('excludeBookingId')
      ? Number(query.get('excludeBookingId'))
      : undefined;

    if (!DATE_RE.test(date || '')) return sendJSON(res, 400, { error: 'Invalid or missing date.' });
    if (!SERVICES[service]) return sendJSON(res, 400, { error: 'Invalid or missing service.' });
    if (barber && !BARBERS[barber]) return sendJSON(res, 400, { error: 'Invalid barber.' });

    const duration = SERVICES[service].duration;
    const slots = getAvailability({
      date,
      durationMinutes: duration,
      barber: barber || null,
      excludeBookingId,
    });
    return sendJSON(res, 200, {
      date,
      service,
      barber: barber || null,
      bufferMinutes: BUFFER_MINUTES,
      slots: slots.map((s) => ({ time: s.time, availableBarbers: s.availableBarbers })),
    });
  }

  // POST /api/bookings
  if (pathname === '/api/bookings' && req.method === 'POST') {
    const body = await readBody(req);
    const { errors, value } = validateBookingInput(body);
    if (Object.keys(errors).length) return sendJSON(res, 422, { errors });

    const svc = SERVICES[value.service];
    const duration = svc.duration;

    // Re-check availability at write time to avoid race conditions / stale slots.
    let assignedBarber = value.barber;
    if (assignedBarber) {
      if (!isBarberFree(assignedBarber, value.date, value.time, duration)) {
        return sendJSON(res, 409, {
          error: 'That slot was just booked with this barber. Please pick another time.',
        });
      }
    } else {
      const free = Object.keys(BARBERS).find((b) => isBarberFree(b, value.date, value.time, duration));
      if (!free) {
        return sendJSON(res, 409, { error: 'That slot was just taken. Please pick another time.' });
      }
      assignedBarber = free;
    }

    const manageToken = generateManageToken();
    const stmt = db.prepare(`
      INSERT INTO bookings (name, phone, email, service, barber, date, time, duration, price, notes, status, manage_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
    `);
    const info = stmt.run(
      value.name,
      value.phone,
      value.email,
      value.service,
      assignedBarber,
      value.date,
      value.time,
      duration,
      svc.price,
      value.notes || null,
      manageToken
    );

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(info.lastInsertRowid);

    sendEmail({
      to: booking.email,
      subject: `You're booked at Faded & Co. — ${svc.label}`,
      html: bookingConfirmationEmail({
        booking,
        service: svc,
        barber: BARBERS[assignedBarber],
        manageUrl: manageUrlFor(manageToken),
      }),
    }).catch((err) => console.error('[email] confirmation send failed:', err));

    return sendJSON(res, 201, { booking });
  }

  // GET /api/bookings?date=&status=   (admin)
  if (pathname === '/api/bookings' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const date = query.get('date');
    const status = query.get('status');

    let sql = 'SELECT * FROM bookings WHERE 1=1';
    const params = [];
    if (date) { sql += ' AND date = ?'; params.push(date); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY date ASC, time ASC';

    const rows = db.prepare(sql).all(...params);
    return sendJSON(res, 200, { bookings: rows });
  }

  // PATCH /api/bookings/:id   (admin) — e.g. { status: "cancelled" | "no_show" | "confirmed" }
  const bookingMatch = pathname.match(/^\/api\/bookings\/(\d+)$/);
  if (bookingMatch && req.method === 'PATCH') {
    if (!requireAdmin(req, res)) return;
    const id = Number(bookingMatch[1]);
    const body = await readBody(req);
    const status = String(body.status || '').trim();
    if (!['confirmed', 'cancelled', 'no_show'].includes(status)) {
      return sendJSON(res, 400, { error: 'Invalid status.' });
    }
    const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (!existing) return sendJSON(res, 404, { error: 'Booking not found.' });

    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);
    const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (status !== 'confirmed' && existing.status === 'confirmed') {
      notifyWaitlistForOpening(existing.date, existing.service, existing.barber);
    }
    return sendJSON(res, 200, { booking: updated });
  }

  // DELETE /api/bookings/:id   (admin)
  if (bookingMatch && req.method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    const id = Number(bookingMatch[1]);
    const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (!existing) return sendJSON(res, 404, { error: 'Booking not found.' });
    db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
    if (existing.status === 'confirmed') {
      notifyWaitlistForOpening(existing.date, existing.service, existing.barber);
    }
    return sendJSON(res, 200, { ok: true });
  }

  /* ── Customer self-service (manage-token based, no admin auth) ─────────── */

  // GET /api/manage/:token
  const manageMatch = pathname.match(/^\/api\/manage\/([A-Za-z0-9_-]+)$/);
  if (manageMatch && req.method === 'GET') {
    const booking = db.prepare('SELECT * FROM bookings WHERE manage_token = ?').get(manageMatch[1]);
    if (!booking) return sendJSON(res, 404, { error: 'Booking not found.' });
    return sendJSON(res, 200, {
      booking,
      service: SERVICES[booking.service] || null,
      barber: BARBERS[booking.barber] || null,
    });
  }

  // POST /api/manage/:token/cancel
  const manageCancelMatch = pathname.match(/^\/api\/manage\/([A-Za-z0-9_-]+)\/cancel$/);
  if (manageCancelMatch && req.method === 'POST') {
    const booking = db.prepare('SELECT * FROM bookings WHERE manage_token = ?').get(manageCancelMatch[1]);
    if (!booking) return sendJSON(res, 404, { error: 'Booking not found.' });
    if (booking.status === 'cancelled') return sendJSON(res, 200, { booking });

    db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(booking.id);
    const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
    notifyWaitlistForOpening(booking.date, booking.service, booking.barber);

    sendEmail({
      to: booking.email,
      subject: 'Your Faded & Co. booking was cancelled',
      html: bookingCancellationEmail({ booking, service: SERVICES[booking.service] }),
    }).catch((err) => console.error('[email] cancellation send failed:', err));

    return sendJSON(res, 200, { booking: updated });
  }

  // POST /api/manage/:token/reschedule — { date, time }
  const manageRescheduleMatch = pathname.match(/^\/api\/manage\/([A-Za-z0-9_-]+)\/reschedule$/);
  if (manageRescheduleMatch && req.method === 'POST') {
    const booking = db.prepare('SELECT * FROM bookings WHERE manage_token = ?').get(manageRescheduleMatch[1]);
    if (!booking) return sendJSON(res, 404, { error: 'Booking not found.' });
    if (booking.status === 'cancelled') {
      return sendJSON(res, 400, { error: 'This booking was cancelled — please make a new one.' });
    }

    const body = await readBody(req);
    const date = String(body.date || '').trim();
    const time = String(body.time || '').trim();
    if (!DATE_RE.test(date)) return sendJSON(res, 400, { error: 'Invalid date.' });
    if (!TIME_RE.test(time)) return sendJSON(res, 400, { error: 'Invalid time.' });
    if (isPastDateTime(date, time)) return sendJSON(res, 400, { error: 'That time has already passed.' });

    if (!isBarberFree(booking.barber, date, time, booking.duration, booking.id)) {
      return sendJSON(res, 409, { error: 'That slot is no longer available. Please pick another time.' });
    }

    db.prepare('UPDATE bookings SET date = ?, time = ?, reminder_sent = 0 WHERE id = ?')
      .run(date, time, booking.id);
    const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
    if (date !== booking.date) {
      notifyWaitlistForOpening(booking.date, booking.service, booking.barber);
    }

    sendEmail({
      to: booking.email,
      subject: 'Your Faded & Co. booking was rescheduled',
      html: bookingRescheduledEmail({
        booking: updated,
        service: SERVICES[booking.service],
        barber: BARBERS[booking.barber],
        manageUrl: manageUrlFor(booking.manage_token),
      }),
    }).catch((err) => console.error('[email] reschedule send failed:', err));

    return sendJSON(res, 200, { booking: updated });
  }

  /* ── Time off (admin) — one-off by `date`, or recurring by `weekday` ────── */

  // GET /api/timeoff?date=
  if (pathname === '/api/timeoff' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const date = query.get('date');
    let sql = 'SELECT * FROM time_off WHERE 1=1';
    const params = [];
    if (date) { sql += ' AND date = ?'; params.push(date); }
    sql += ' ORDER BY date ASC, weekday ASC, start_time ASC';
    const rows = db.prepare(sql).all(...params);
    return sendJSON(res, 200, { timeOff: rows });
  }

  // POST /api/timeoff — { barber, start_time, end_time, reason, date } XOR { ..., weekday }
  if (pathname === '/api/timeoff' && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const barber = String(body.barber || '*').trim();
    const start_time = String(body.start_time || '').trim();
    const end_time = String(body.end_time || '').trim();
    const reason = String(body.reason || '').trim();
    const hasDate = body.date !== undefined && body.date !== null && body.date !== '';
    const hasWeekday = body.weekday !== undefined && body.weekday !== null && body.weekday !== '';

    if (barber !== '*' && !BARBERS[barber]) return sendJSON(res, 400, { error: 'Invalid barber.' });
    if (!TIME_RE.test(start_time) || !TIME_RE.test(end_time) || start_time >= end_time) {
      return sendJSON(res, 400, { error: 'Invalid time range.' });
    }
    if (hasDate === hasWeekday) {
      return sendJSON(res, 400, { error: 'Provide either a one-off date or a recurring weekday, not both.' });
    }

    let date = null;
    let weekday = null;
    if (hasDate) {
      date = String(body.date).trim();
      if (!DATE_RE.test(date)) return sendJSON(res, 400, { error: 'Invalid date.' });
    } else {
      weekday = Number(body.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        return sendJSON(res, 400, { error: 'Invalid weekday.' });
      }
    }

    const stmt = db.prepare(
      `INSERT INTO time_off (barber, date, weekday, start_time, end_time, reason) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(barber, date, weekday, start_time, end_time, reason || null);
    const row = db.prepare('SELECT * FROM time_off WHERE id = ?').get(info.lastInsertRowid);
    return sendJSON(res, 201, { timeOff: row });
  }

  // DELETE /api/timeoff/:id   (admin)
  const timeOffMatch = pathname.match(/^\/api\/timeoff\/(\d+)$/);
  if (timeOffMatch && req.method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    const id = Number(timeOffMatch[1]);
    const existing = db.prepare('SELECT * FROM time_off WHERE id = ?').get(id);
    if (!existing) return sendJSON(res, 404, { error: 'Time off entry not found.' });
    db.prepare('DELETE FROM time_off WHERE id = ?').run(id);
    return sendJSON(res, 200, { ok: true });
  }

  // POST /api/admin/login — { password }
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const body = await readBody(req);
    const password = String(body.password || '');
    if (password !== ADMIN_PASSWORD) return sendJSON(res, 401, { error: 'Incorrect password.' });
    return sendJSON(res, 200, { ok: true });
  }

  // GET /api/analytics?from=&to=   (admin)
  if (pathname === '/api/analytics' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const from = query.get('from') || '';
    const to = query.get('to') || '';
    if (from && !DATE_RE.test(from)) return sendJSON(res, 400, { error: 'Invalid "from" date.' });
    if (to && !DATE_RE.test(to)) return sendJSON(res, 400, { error: 'Invalid "to" date.' });
    return sendJSON(res, 200, getAnalytics({ from: from || null, to: to || null }));
  }

  // GET /api/waitlist?date=&status=   (admin)
  if (pathname === '/api/waitlist' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const date = query.get('date');
    const status = query.get('status');
    let sql = 'SELECT * FROM waitlist WHERE 1=1';
    const params = [];
    if (date) { sql += ' AND date = ?'; params.push(date); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY date ASC, created_at ASC';
    const rows = db.prepare(sql).all(...params);
    return sendJSON(res, 200, { waitlist: rows });
  }

  // POST /api/waitlist — { name, phone, email, service, barber, date, notes }
  if (pathname === '/api/waitlist' && req.method === 'POST') {
    const body = await readBody(req);
    const { errors, value } = validateWaitlistInput(body);
    if (Object.keys(errors).length) return sendJSON(res, 422, { errors });

    const stmt = db.prepare(`
      INSERT INTO waitlist (name, phone, email, service, barber, date, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting')
    `);
    const info = stmt.run(value.name, value.phone, value.email, value.service, value.barber, value.date, value.notes || null);
    const entry = db.prepare('SELECT * FROM waitlist WHERE id = ?').get(info.lastInsertRowid);
    return sendJSON(res, 201, { waitlist: entry });
  }

  // PATCH /api/waitlist/:id   (admin) — e.g. { status: "booked" }
  const waitlistMatch = pathname.match(/^\/api\/waitlist\/(\d+)$/);
  if (waitlistMatch && req.method === 'PATCH') {
    if (!requireAdmin(req, res)) return;
    const id = Number(waitlistMatch[1]);
    const body = await readBody(req);
    const status = String(body.status || '').trim();
    if (!['waiting', 'notified', 'booked', 'cancelled'].includes(status)) {
      return sendJSON(res, 400, { error: 'Invalid status.' });
    }
    const existing = db.prepare('SELECT * FROM waitlist WHERE id = ?').get(id);
    if (!existing) return sendJSON(res, 404, { error: 'Waitlist entry not found.' });
    db.prepare('UPDATE waitlist SET status = ? WHERE id = ?').run(status, id);
    const updated = db.prepare('SELECT * FROM waitlist WHERE id = ?').get(id);
    return sendJSON(res, 200, { waitlist: updated });
  }

  // DELETE /api/waitlist/:id   (admin)
  if (waitlistMatch && req.method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    const id = Number(waitlistMatch[1]);
    const existing = db.prepare('SELECT * FROM waitlist WHERE id = ?').get(id);
    if (!existing) return sendJSON(res, 404, { error: 'Waitlist entry not found.' });
    db.prepare('DELETE FROM waitlist WHERE id = ?').run(id);
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 404, { error: 'Not found.' });
}

/* ── Static file serving ─────────────────────────────────────────────────── */

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.normalize(path.join(root, decoded));
  if (!target.startsWith(root)) return null; // path traversal guard
  return target;
}

function serveStatic(req, res, pathname) {
  let filePath = safeJoin(ROOT, pathname === '/' ? '/index.html' : pathname);
  if (!filePath) {
    res.writeHead(400);
    return res.end('Bad request');
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

/* ── Server ──────────────────────────────────────────────────────────────── */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, url.searchParams);
    } else {
      serveStatic(req, res, pathname);
    }
  } catch (err) {
    sendJSON(res, 400, { error: err.message || 'Bad request' });
  }
});

server.listen(PORT, () => {
  console.log(`Faded & Co server running at http://localhost:${PORT}`);
  console.log(`Admin panel:            http://localhost:${PORT}/admin.html`);
  console.log(`Admin password:         ${ADMIN_PASSWORD} (set ADMIN_PASSWORD env var to change)`);
  console.log(`Buffer between bookings: ${BUFFER_MINUTES} min (set BUFFER_MINUTES to change)`);
  console.log(process.env.RESEND_API_KEY
    ? 'Emails:                 sending via Resend'
    : 'Emails:                 dev mode — logged to this console (set RESEND_API_KEY to send for real)');
  startReminderJob();
});
