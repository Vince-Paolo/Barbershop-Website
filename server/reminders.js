'use strict';

const db = require('./db');
const { SERVICES, BARBERS } = require('./data');
const { APP_URL, REMINDER_HOURS_BEFORE } = require('./config');
const { sendEmail, bookingReminderEmail } = require('./email');

/**
 * Finds confirmed, not-yet-reminded bookings whose appointment time falls
 * within the reminder window (REMINDER_HOURS_BEFORE, minus a bit of slack so
 * a booking made very last-minute doesn't get skipped), sends the reminder,
 * and marks it sent so it's never sent twice.
 */
async function checkReminders() {
  const rows = db
    .prepare(`SELECT * FROM bookings WHERE status = 'confirmed' AND reminder_sent = 0`)
    .all();

  const now = Date.now();
  const windowMs = REMINDER_HOURS_BEFORE * 60 * 60 * 1000;

  for (const booking of rows) {
    const apptTime = new Date(`${booking.date}T${booking.time}:00`).getTime();
    const msUntil = apptTime - now;

    // Past appointments: mark as sent (nothing to remind about) without emailing.
    if (msUntil <= 0) {
      db.prepare('UPDATE bookings SET reminder_sent = 1 WHERE id = ?').run(booking.id);
      continue;
    }

    if (msUntil <= windowMs) {
      const service = SERVICES[booking.service];
      const barber = BARBERS[booking.barber];
      const manageUrl = `${APP_URL}/manage.html?token=${booking.manage_token}`;

      try {
        await sendEmail({
          to: booking.email,
          subject: `Reminder: your appointment at Faded & Co. tomorrow`,
          html: bookingReminderEmail({ booking, service, barber, manageUrl }),
        });
      } finally {
        // Mark sent even on failure so we don't hammer a broken email provider forever.
        db.prepare('UPDATE bookings SET reminder_sent = 1 WHERE id = ?').run(booking.id);
      }
    }
  }
}

/** Starts the periodic reminder check. Returns the interval handle. */
function startReminderJob(intervalMs = 5 * 60 * 1000) {
  checkReminders().catch((err) => console.error('[reminders] initial check failed:', err));
  return setInterval(() => {
    checkReminders().catch((err) => console.error('[reminders] check failed:', err));
  }, intervalMs);
}

module.exports = { checkReminders, startReminderJob };
