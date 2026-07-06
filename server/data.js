'use strict';

/* Single source of truth for services/barbers/hours.
   The front-end (js/booking.js) fetches these from /api/services and
   /api/barbers so the client never has its own copy that can drift. */

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
  'marco-reyes':     { name: 'Marco Reyes',     role: 'Master Barber',            specialty: 'Classic cuts & tapers',     photo: 'assets/images/team/marco-reyes.jpg' },
  'jay-santos':      { name: 'Jay Santos',      role: 'Fade Specialist',          specialty: 'Skin fades & blends',       photo: 'assets/images/team/jay-santos.jpg' },
  'eli-cruz':        { name: 'Eli Cruz',        role: 'Beard & Shave Specialist', specialty: 'Hot towel shaves & beards', photo: 'assets/images/team/eli-cruz.jpg' },
  'paolo-dela-cruz': { name: 'Paolo Dela Cruz', role: 'Junior Barber',            specialty: 'Kids & buzz cuts',          photo: 'assets/images/team/paolo-dela-cruz.jpg' },
};

// Business hours per weekday (0=Sun..6=Sat), 24h "HH:MM"
const HOURS = {
  0: { open: '10:00', close: '17:00' },
  1: { open: '09:00', close: '20:00' },
  2: { open: '09:00', close: '20:00' },
  3: { open: '09:00', close: '20:00' },
  4: { open: '09:00', close: '20:00' },
  5: { open: '09:00', close: '20:00' },
  6: { open: '09:00', close: '19:00' },
};

const SLOT_STEP_MINUTES = 30; // granularity of bookable start times

module.exports = { SERVICES, BARBERS, HOURS, SLOT_STEP_MINUTES };
