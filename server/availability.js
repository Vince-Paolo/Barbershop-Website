'use strict';

const db = require('./db');
const { BARBERS, HOURS, SLOT_STEP_MINUTES } = require('./data');
const { BUFFER_MINUTES } = require('./config');

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function isPastDateTime(date, hhmm) {
  const dt = new Date(`${date}T${hhmm}:00`);
  return dt.getTime() < Date.now();
}

function weekdayOf(date) {
  return new Date(`${date}T00:00:00`).getDay();
}

/** All candidate start times (HH:MM) for a given date, ignoring conflicts. */
function candidateSlots(date, durationMinutes) {
  const hours = HOURS[weekdayOf(date)];
  if (!hours) return [];

  const openMins = toMinutes(hours.open);
  const closeMins = toMinutes(hours.close);
  const slots = [];
  for (let m = openMins; m + durationMinutes <= closeMins; m += SLOT_STEP_MINUTES) {
    slots.push(toHHMM(m));
  }
  return slots;
}

/**
 * Busy ranges for a barber on a date, as [start, end) minute tuples.
 * - Confirmed bookings get `BUFFER_MINUTES` tacked onto their end, so the next
 *   appointment can't start the instant this one finishes.
 * - Time off (one-off by exact date, or recurring by weekday) is exact — no buffer.
 * `excludeBookingId` lets a booking being rescheduled ignore its own current slot.
 */
function busyRangesForBarber(barber, date, excludeBookingId) {
  const ranges = [];

  let sql = `SELECT id, time, duration FROM bookings WHERE date = ? AND status = 'confirmed' AND barber = ?`;
  const params = [date, barber];
  if (excludeBookingId) {
    sql += ' AND id != ?';
    params.push(excludeBookingId);
  }
  const bookingRows = db.prepare(sql).all(...params);
  for (const row of bookingRows) {
    const start = toMinutes(row.time);
    ranges.push([start, start + row.duration + BUFFER_MINUTES]);
  }

  const weekday = weekdayOf(date);
  const offRows = db
    .prepare(
      `SELECT start_time, end_time FROM time_off
       WHERE (barber = ? OR barber = '*')
         AND (date = ? OR (date IS NULL AND weekday = ?))`
    )
    .all(barber, date, weekday);
  for (const row of offRows) {
    ranges.push([toMinutes(row.start_time), toMinutes(row.end_time)]);
  }

  return ranges;
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

/** Is `barber` free for [start, start+duration) on `date`? */
function isBarberFree(barber, date, startHHMM, durationMinutes, excludeBookingId) {
  const start = toMinutes(startHHMM);
  const end = start + durationMinutes;
  const busy = busyRangesForBarber(barber, date, excludeBookingId);
  return !busy.some(([bStart, bEnd]) => overlaps(start, end, bStart, bEnd));
}

/**
 * Compute available slots for a date + service, optionally restricted to one barber.
 * `excludeBookingId`: when rescheduling, ignore that booking's own current slot
 * so it doesn't block itself out of the results.
 */
function getAvailability({ date, durationMinutes, barber, excludeBookingId }) {
  const barberSlugs = barber ? [barber] : Object.keys(BARBERS);
  const slots = candidateSlots(date, durationMinutes);

  const result = [];
  for (const time of slots) {
    if (isPastDateTime(date, time)) continue;
    const availableBarbers = barberSlugs.filter((b) =>
      isBarberFree(b, date, time, durationMinutes, excludeBookingId)
    );
    if (availableBarbers.length > 0) {
      result.push({ time, availableBarbers });
    }
  }
  return result;
}

module.exports = {
  toMinutes,
  toHHMM,
  isPastDateTime,
  weekdayOf,
  candidateSlots,
  isBarberFree,
  getAvailability,
};
