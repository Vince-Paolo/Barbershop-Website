'use strict';

const { RESEND_API_KEY, FROM_EMAIL } = require('./config');

/**
 * Sends an email via Resend's HTTP API. If RESEND_API_KEY is not set, the
 * email is logged to the console instead — so booking/cancel/reminder flows
 * all work locally without signing up for anything.
 */
async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.log('\n────────────────────────────────────────────');
    console.log('[email:dev-mode] RESEND_API_KEY not set — logging instead of sending.');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('----------------------------------------------');
    console.log(html.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim());
    console.log('────────────────────────────────────────────\n');
    return { ok: true, dev: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend request failed (${res.status}):`, body);
      return { ok: false, error: body };
    }
    return { ok: true };
  } catch (err) {
    console.error('[email] Failed to send:', err.message);
    return { ok: false, error: err.message };
  }
}

/* ── Templates ───────────────────────────────────────────────────────────── */

const BRAND_HEADER = `
  <div style="background:#1A1A1A;padding:24px 32px;">
    <span style="font-family:Georgia,serif;font-weight:900;font-size:20px;color:#fff;letter-spacing:.5px;">
      FADED <span style="color:#D4AF37;">&amp;</span> CO.
    </span>
  </div>
`;

function wrapEmail(bodyHtml) {
  return `
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #eee;">
      ${BRAND_HEADER}
      <div style="padding:32px;color:#333;line-height:1.6;font-size:15px;">
        ${bodyHtml}
      </div>
      <div style="padding:20px 32px;background:#F5F5F5;color:#888;font-size:12px;">
        Faded &amp; Co. · 123 Mabini St, Calamba, Laguna
      </div>
    </div>
  `;
}

function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDateLong(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function bookingConfirmationEmail({ booking, service, barber, manageUrl }) {
  return wrapEmail(`
    <h2 style="margin:0 0 16px;font-family:Georgia,serif;">You're booked, ${booking.name.split(' ')[0]}!</h2>
    <p>Here's your appointment at Faded &amp; Co.:</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr><td style="padding:6px 0;color:#888;">Service</td><td style="padding:6px 0;text-align:right;">${service.label}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Date</td><td style="padding:6px 0;text-align:right;">${formatDateLong(booking.date)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Time</td><td style="padding:6px 0;text-align:right;">${formatTime12h(booking.time)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Barber</td><td style="padding:6px 0;text-align:right;">${barber ? barber.name : 'No preference'}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Price</td><td style="padding:6px 0;text-align:right;">₱${service.price}</td></tr>
    </table>
    <p style="margin:28px 0;text-align:center;">
      <a href="${manageUrl}" style="background:#D4AF37;color:#1A1A1A;text-decoration:none;font-weight:bold;padding:14px 28px;display:inline-block;">
        Manage This Booking
      </a>
    </p>
    <p style="color:#888;font-size:13px;">Need to cancel or reschedule? Use the button above — no account needed.</p>
  `);
}

function bookingCancellationEmail({ booking, service }) {
  return wrapEmail(`
    <h2 style="margin:0 0 16px;font-family:Georgia,serif;">Booking cancelled</h2>
    <p>Your appointment for <strong>${service ? service.label : 'your service'}</strong> on
      ${formatDateLong(booking.date)} at ${formatTime12h(booking.time)} has been cancelled.</p>
    <p style="color:#888;font-size:13px;">Changed your mind? You're welcome to book a new slot any time.</p>
  `);
}

function bookingReminderEmail({ booking, service, barber, manageUrl }) {
  return wrapEmail(`
    <h2 style="margin:0 0 16px;font-family:Georgia,serif;">See you tomorrow, ${booking.name.split(' ')[0]}!</h2>
    <p>Quick reminder about your upcoming appointment:</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr><td style="padding:6px 0;color:#888;">Service</td><td style="padding:6px 0;text-align:right;">${service.label}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Date</td><td style="padding:6px 0;text-align:right;">${formatDateLong(booking.date)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Time</td><td style="padding:6px 0;text-align:right;">${formatTime12h(booking.time)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Barber</td><td style="padding:6px 0;text-align:right;">${barber ? barber.name : 'No preference'}</td></tr>
    </table>
    <p style="margin:28px 0;text-align:center;">
      <a href="${manageUrl}" style="background:#D4AF37;color:#1A1A1A;text-decoration:none;font-weight:bold;padding:14px 28px;display:inline-block;">
        Manage This Booking
      </a>
    </p>
  `);
}

function bookingRescheduledEmail({ booking, service, barber, manageUrl }) {
  return wrapEmail(`
    <h2 style="margin:0 0 16px;font-family:Georgia,serif;">Booking updated</h2>
    <p>Your appointment has been moved to:</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr><td style="padding:6px 0;color:#888;">Service</td><td style="padding:6px 0;text-align:right;">${service.label}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Date</td><td style="padding:6px 0;text-align:right;">${formatDateLong(booking.date)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Time</td><td style="padding:6px 0;text-align:right;">${formatTime12h(booking.time)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;">Barber</td><td style="padding:6px 0;text-align:right;">${barber ? barber.name : 'No preference'}</td></tr>
    </table>
    <p style="margin:28px 0;text-align:center;">
      <a href="${manageUrl}" style="background:#D4AF37;color:#1A1A1A;text-decoration:none;font-weight:bold;padding:14px 28px;display:inline-block;">
        Manage This Booking
      </a>
    </p>
  `);
}

module.exports = {
  sendEmail,
  bookingConfirmationEmail,
  bookingCancellationEmail,
  bookingReminderEmail,
  bookingRescheduledEmail,
  formatTime12h,
  formatDateLong,
};
