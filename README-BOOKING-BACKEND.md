# Faded & Co. — Booking Backend

Real backend for the booking system: real-time slot availability, conflict-safe
booking creation, email notifications, customer self-service (cancel/reschedule),
configurable buffer time between appointments, recurring time-off, a waitlist for
full dates, and an analytics dashboard — all behind a single admin login.

## Requirements

- **Node.js 22.5+** (uses Node's built-in `node:sqlite` — no `npm install`, no
  native dependencies, nothing to compile).

Check your version:
```bash
node --version
```

## Run it

From the `barbershop/` folder:
```bash
node server/server.js
```

Then open:
- **Site:** http://localhost:3000
- **Booking page:** http://localhost:3000/booking.html
- **Admin dashboard:** http://localhost:3000/admin.html (password: `admin123`) —
  Analytics / Bookings / Waitlist / Schedule, all in one nav
- **Manage-my-booking page:** http://localhost:3000/manage.html?token=... (link is
  emailed to the customer after booking — also shown right in the confirmation
  modal on the booking page)

One process serves both the static site and the API — no more need for
`python3 -m http.server` or Live Server. A SQLite file is created automatically
at `data/booking.db` the first time you run it.

### Configuration (all optional — sensible defaults for local use)

```bash
PORT=3000                    # server port
ADMIN_PASSWORD=admin123      # shared admin password
BUFFER_MINUTES=10            # cleanup gap enforced after every appointment
REMINDER_HOURS_BEFORE=24     # how far ahead of an appointment to email a reminder
APP_URL=http://localhost:3000  # used to build links in emails — set this to your
                                # real domain once deployed, or emailed links will
                                # point at localhost
RESEND_API_KEY=              # leave unset to log emails to the console instead
                              # of sending them (great for local dev)
FROM_EMAIL="Faded & Co. <onboarding@resend.dev>"
```

Example:
```bash
PORT=4000 BUFFER_MINUTES=15 RESEND_API_KEY=re_xxx APP_URL=https://fadedco.example node server/server.js
```

## What's in here

- **`server/`**
  - `data.js` — single source of truth for services, barbers, and business hours.
  - `config.js` — all env-configurable settings in one place.
  - `db.js` — opens/creates the SQLite database and schema (with lightweight
    migrations so existing `data/booking.db` files pick up new columns/tables
    automatically).
  - `tokens.js` — generates the random token used in manage-booking links.
  - `availability.js` — slot generation + conflict checking: per-barber,
    duration-aware, buffer-aware, and aware of both one-off and recurring
    blocked time.
  - `email.js` — sends email via [Resend](https://resend.com)'s HTTP API, or
    logs the rendered email to the console if `RESEND_API_KEY` isn't set.
    Templates: booking confirmation, cancellation, reschedule, reminder.
  - `reminders.js` — a background job (checked every 5 minutes) that emails a
    reminder `REMINDER_HOURS_BEFORE` an appointment, exactly once per booking.
  - `analytics.js` — aggregates confirmed bookings into summary stats,
    busiest hours/days, top services, per-barber revenue, and revenue by week.
  - `server.js` — the HTTP server: serves the static site and the JSON API below.
- **`js/booking.js`** — fetches real-time slots from `/api/availability`, submits
  to `/api/bookings`, shows a "Manage This Booking" link in the confirmation
  modal, and offers a "Join the waitlist" option when a date/service/barber is
  fully booked.
- **`manage.html` / `js/manage.js` / `css/manage.css`** — the customer-facing
  self-service page: view a booking, reschedule it (reuses the same real-time
  availability picker as the booking page), or cancel it — no login needed,
  just the token from their email.
- **`admin.html` / `js/admin.js` / `css/admin.css`** — admin dashboard with four
  sections (a sticky nav + mobile menu on small screens):
  - **Analytics** — stat cards (bookings, revenue, avg. ticket, cancellation
    rate) and bar charts for busiest hours/days, top services, per-barber
    revenue, and revenue by week, filterable by date range.
  - **Bookings** — view/filter, cancel/restore/delete.
  - **Waitlist** — customers waiting for a full date to open up; entries flip
    to "Notified" automatically when a matching booking is freed.
  - **Schedule** — block time off either as a one-off date or a weekly-recurring
    rule (e.g. "every Sunday", "lunch every day").

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/services` | — | List services (label, price, duration) |
| GET | `/api/barbers` | — | List barbers |
| GET | `/api/availability?date=&service=&barber=&excludeBookingId=` | — | Real-time open slots (barber optional; `excludeBookingId` lets a booking being rescheduled ignore its own current slot) |
| POST | `/api/bookings` | — | Create a booking (re-validates the slot server-side, emails a confirmation with a manage link) |
| GET | `/api/bookings?date=&status=` | admin | List bookings |
| PATCH | `/api/bookings/:id` | admin | Update status (`confirmed`/`cancelled`/`no_show`) — cancelling notifies any matching waitlist entries |
| DELETE | `/api/bookings/:id` | admin | Permanently delete a booking — also notifies any matching waitlist entries |
| GET | `/api/manage/:token` | — | Look up a booking by its manage token |
| POST | `/api/manage/:token/cancel` | — | Customer self-cancel (emails a cancellation notice, notifies matching waitlist entries) |
| POST | `/api/manage/:token/reschedule` | — | Customer self-reschedule — body `{ date, time }` (re-validates availability, emails an update, notifies waitlist entries for the freed-up old slot) |
| GET | `/api/timeoff?date=` | admin | List blocked time (one-off and recurring) |
| POST | `/api/timeoff` | admin | Block time — `{ barber, start_time, end_time, reason, date }` for a one-off block, or `{ ..., weekday }` (0=Sun..6=Sat) for a weekly-recurring block. Provide exactly one of `date`/`weekday`. |
| DELETE | `/api/timeoff/:id` | admin | Remove a blocked-time entry |
| GET | `/api/analytics?from=&to=` | admin | Summary stats, busiest hours/days, top services, per-barber stats, revenue by week (`from`/`to` optional, `YYYY-MM-DD`) |
| GET | `/api/waitlist?date=&status=` | admin | List waitlist entries |
| POST | `/api/waitlist` | — | Join the waitlist for a full date/service (`barber` optional) |
| PATCH | `/api/waitlist/:id` | admin | Update status (`waiting`/`notified`/`booked`/`cancelled`) |
| DELETE | `/api/waitlist/:id` | admin | Remove a waitlist entry |
| POST | `/api/admin/login` | — | Verify admin password |

Admin endpoints require header `x-admin-password: <password>`.

## How availability works

For a given date, the server builds candidate start times from business hours
(30-min steps) that fit the service's full duration before closing. For each
candidate time it checks, per barber:
- existing **confirmed** bookings that would overlap — extended by
  `BUFFER_MINUTES` past their end, so back-to-back bookings always leave a
  cleanup gap;
- **one-off blocked time** for that exact date, and
- **recurring blocked time** for that weekday (e.g. a standing Sunday closure
  or daily lunch break) — no buffer added to these, since they're already an
  explicit range.

If no barber is requested, a slot is shown as available as long as **at least
one** barber is free; on booking, the first free barber is auto-assigned.
Booking creation and rescheduling both re-run this exact check right before
writing to the database, so two people can't win a race for the same slot —
the loser gets a `409` and the front end refreshes the slot list automatically.

## How the waitlist works

When `/api/availability` returns no open slots for a date/service (optionally
a specific barber), the booking page offers a "Join the waitlist" form instead.
That writes a `waiting` row to the `waitlist` table.

Whenever a **confirmed** booking is cancelled or deleted — by an admin, or by
the customer themselves via the manage page — the server looks for `waiting`
entries with the same date + service (and matching barber, or no barber
preference) and flips them to `notified`. Rescheduling a booking does the same
check against its *old* date, since that's the slot actually being freed.
There's no email/SMS provider wired in for the waitlist yet, so "notified"
just surfaces the match at the top of the Waitlist panel in the admin
dashboard — staff still need to reach out. From there an admin can mark an
entry `booked` (once they've rebooked the customer), `cancelled`, or delete it.

## Notifications (bookings)

Every booking gets a `manage_token` (a random 32-byte URL-safe string). Emails
are sent on:
- **Booking created** → confirmation + manage link
- **Customer or admin cancels** → cancellation notice
- **Customer reschedules** → updated confirmation
- **`REMINDER_HOURS_BEFORE` before the appointment** → reminder + manage link,
  sent by the background job in `server/reminders.js` (checked every 5 min,
  and once immediately on server start)

Without `RESEND_API_KEY` set, all of the above are logged to the console
instead of sent — so the whole flow works out of the box with zero signup.
To send real emails, [create a Resend account](https://resend.com), get an
API key, and set `RESEND_API_KEY` (and ideally a verified sending domain via
`FROM_EMAIL`).

## Analytics

`GET /api/analytics` (optionally scoped to a date range via `from`/`to`) returns:
- **summary** — total confirmed bookings, total revenue, average ticket,
  cancelled count & rate, no-show count & rate, and customer counts
  (total/new/returning in the range, plus the returning-customer rate)
- **busiestHours** / **busiestDays** — booking counts bucketed by hour of day
  and day of week ("Peak Hours")
- **topServices** — booking count + revenue per service, most-booked first
  ("Popular Services")
- **byBarber** — booking count + revenue per barber, highest revenue first
- **revenueByWeek** — appointment count + revenue per ISO-ish week (Monday
  start) — powers both the "Appointments" and "Revenue" views
- **customerGrowthByWeek** — new customers per week plus a running cumulative
  total ("Customer Growth")

The admin dashboard's Analytics panel renders all of this with
[Chart.js](https://www.chartjs.org) (loaded via CDN in `admin.html`): a
combo bar/line chart for appointments + revenue, a doughnut for popular
services, a bar chart for peak hours, a combo chart for customer growth, and
two small doughnuts for booking outcomes (completed/cancelled/no-show) and
new-vs-returning customers — plus stat cards up top and simple bar rows for
busiest days and revenue by barber. Everything respects the same date-range
filter.

**No-shows**: bookings can now be marked `no_show` from the Bookings panel
(alongside Cancel), for a confirmed appointment whose customer didn't turn
up. A booking's status is one of `confirmed` / `cancelled` / `no_show`.
No-show rate is computed as `no_show ÷ (confirmed + no_show)` — cancellations
are excluded from that denominator since they're a different failure mode
(cancelled ahead of time vs. simply not showing up), already covered by the
separate cancellation rate.

**Customer growth & returning customers** are both based on a customer's
*confirmed* booking history — someone who only ever no-showed or cancelled
isn't counted as an "acquired" customer for these two metrics, so the
"New customers" stat card and the Customer Growth chart always agree for
the same date range.

## Notes / next steps if you deploy this for real

- The admin password is a single shared secret meant for local/trusted use —
  fine for one person running this on their own machine, but for a public
  deployment you'll want real accounts/sessions and rate limiting on
  `POST /api/bookings`, `POST /api/waitlist`, and `POST /api/admin/login`.
- Set `APP_URL` to your real domain once deployed — it's used to build every
  link in every email.
- SQLite is great for one shop/one server. If you outgrow a single file (e.g.
  need multiple app servers), swap `server/db.js` for Postgres — the query
  shapes are simple and would translate directly.
- No SMS or waitlist emails yet — the code is structured so adding a
  Twilio-based `sendSMS()` alongside `sendEmail()` in `server/email.js` (and
  calling it at the same points, plus in `notifyWaitlistForOpening`) would be
  a small, contained addition.
