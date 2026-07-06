'use strict';

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'booking.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    phone         TEXT NOT NULL,
    email         TEXT NOT NULL,
    service       TEXT NOT NULL,
    barber        TEXT NOT NULL,
    date          TEXT NOT NULL,      -- YYYY-MM-DD
    time          TEXT NOT NULL,      -- HH:MM (24h, start time)
    duration      INTEGER NOT NULL,   -- minutes
    price         INTEGER NOT NULL,
    notes         TEXT,
    status        TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | cancelled
    manage_token  TEXT,               -- lets a customer manage this booking without logging in
    reminder_sent INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
  CREATE INDEX IF NOT EXISTS idx_bookings_barber_date ON bookings(barber, date);

  CREATE TABLE IF NOT EXISTS time_off (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    barber      TEXT NOT NULL,     -- barber slug, or '*' for whole shop
    date        TEXT,              -- YYYY-MM-DD — set for a one-off block
    weekday     INTEGER,           -- 0(Sun)-6(Sat) — set for a weekly-recurring block
    start_time  TEXT NOT NULL,     -- HH:MM
    end_time    TEXT NOT NULL,     -- HH:MM
    reason      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_timeoff_date ON time_off(date);

  CREATE TABLE IF NOT EXISTS waitlist (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL,
    email       TEXT NOT NULL,
    service     TEXT NOT NULL,
    barber      TEXT,               -- slug, or NULL for no preference
    date        TEXT NOT NULL,      -- YYYY-MM-DD desired date
    notes       TEXT,
    status      TEXT NOT NULL DEFAULT 'waiting', -- waiting | notified | booked | cancelled
    notified_at TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_waitlist_date ON waitlist(date);
  CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);
`);

/* ── Lightweight migrations for DBs created before these columns existed ──── */

function columnExists(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((r) => r.name === col);
}

// bookings: manage_token / reminder_sent are purely additive — safe as ALTER TABLE.
if (!columnExists('bookings', 'manage_token')) {
  db.exec(`ALTER TABLE bookings ADD COLUMN manage_token TEXT;`);
}
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_manage_token ON bookings(manage_token);`);

if (!columnExists('bookings', 'reminder_sent')) {
  db.exec(`ALTER TABLE bookings ADD COLUMN reminder_sent INTEGER NOT NULL DEFAULT 0;`);
}

// time_off: `date` used to be NOT NULL; SQLite can't drop that constraint with
// ALTER TABLE, so rebuild the table in place if we detect the old shape.
if (!columnExists('time_off', 'weekday')) {
  db.exec(`
    ALTER TABLE time_off RENAME TO time_off_old;

    CREATE TABLE time_off (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      barber      TEXT NOT NULL,
      date        TEXT,
      weekday     INTEGER,
      start_time  TEXT NOT NULL,
      end_time    TEXT NOT NULL,
      reason      TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO time_off (id, barber, date, start_time, end_time, reason, created_at)
      SELECT id, barber, date, start_time, end_time, reason, created_at FROM time_off_old;

    DROP TABLE time_off_old;

    CREATE INDEX IF NOT EXISTS idx_timeoff_date ON time_off(date);
    CREATE INDEX IF NOT EXISTS idx_timeoff_weekday ON time_off(weekday);
  `);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_timeoff_weekday ON time_off(weekday);`);

module.exports = db;
