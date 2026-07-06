'use strict';

module.exports = {
  PORT: process.env.PORT || 3000,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',

  // Minutes of cleanup/buffer time required after an appointment before the
  // same barber's next appointment can start. Admin-configurable later —
  // for now it's one shop-wide value via env var.
  BUFFER_MINUTES: parseInt(process.env.BUFFER_MINUTES, 10) || 10,

  // Used to build links in emails (manage-booking page, etc).
  APP_URL: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,

  // How long before an appointment to send the reminder email.
  REMINDER_HOURS_BEFORE: parseInt(process.env.REMINDER_HOURS_BEFORE, 10) || 24,

  // Resend (https://resend.com) — leave RESEND_API_KEY unset to log emails
  // to the console instead of sending them (handy for local development).
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  FROM_EMAIL: process.env.FROM_EMAIL || 'Faded & Co. <onboarding@resend.dev>',
};
