'use strict';

const db = require('./db');
const { SERVICES, BARBERS } = require('./data');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** ISO-ish week key, e.g. "2026-W27", using Monday as the start of the week. */
function weekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  // Shift to the Monday of this week.
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return {
    key: `${d.getFullYear()}-W${String(week).padStart(2, '0')}`,
    weekStart: d.toISOString().split('T')[0],
  };
}

/**
 * Build the full analytics payload.
 *
 * `from`/`to` (inclusive, YYYY-MM-DD) scope the appointment/revenue/service/hour
 * stats to a window. Customer-growth and returning-customer stats look at each
 * customer's *entire* booking history regardless of the window, since "is this
 * a new or returning customer" is inherently a whole-history question — the
 * window only controls which weeks/customers are being reported on.
 */
function getAnalytics({ from, to } = {}) {
  let sql = `SELECT * FROM bookings WHERE status = 'confirmed'`;
  const params = [];
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to) { sql += ' AND date <= ?'; params.push(to); }
  const rows = db.prepare(sql).all(...params);

  const cancelledCountRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM bookings WHERE status = 'cancelled'` +
        (from ? ' AND date >= ?' : '') + (to ? ' AND date <= ?' : '')
    )
    .get(...params);

  const noShowCountRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM bookings WHERE status = 'no_show'` +
        (from ? ' AND date >= ?' : '') + (to ? ' AND date <= ?' : '')
    )
    .get(...params);

  const outcomesTotal = rows.length + cancelledCountRow.n + noShowCountRow.n;

  const summary = {
    totalBookings: rows.length,
    totalRevenue: rows.reduce((sum, r) => sum + r.price, 0),
    avgTicket: rows.length ? Math.round(rows.reduce((s, r) => s + r.price, 0) / rows.length) : 0,
    cancelledCount: cancelledCountRow.n,
    cancellationRate: outcomesTotal ? Math.round((cancelledCountRow.n / outcomesTotal) * 100) : 0,
    noShowCount: noShowCountRow.n,
    noShowRate: outcomesTotal ? Math.round((noShowCountRow.n / outcomesTotal) * 100) : 0,
  };

  // Busiest hours (bucketed by the slot's start hour) — "Peak Hours".
  const hourCounts = {};
  for (const r of rows) {
    const hour = Math.floor(toMinutes(r.time) / 60);
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  }
  const busiestHours = Object.entries(hourCounts)
    .map(([hour, count]) => ({ hour: Number(hour), count }))
    .sort((a, b) => a.hour - b.hour);

  // Busiest days of week.
  const dayCounts = {};
  for (const r of rows) {
    const dow = new Date(r.date + 'T00:00:00').getDay();
    dayCounts[dow] = (dayCounts[dow] || 0) + 1;
  }
  const busiestDays = DAY_NAMES.map((name, dow) => ({ day: name, count: dayCounts[dow] || 0 }));

  // Most-booked services (count + revenue) — "Popular Services".
  const serviceStats = {};
  for (const r of rows) {
    if (!serviceStats[r.service]) serviceStats[r.service] = { count: 0, revenue: 0 };
    serviceStats[r.service].count += 1;
    serviceStats[r.service].revenue += r.price;
  }
  const topServices = Object.entries(serviceStats)
    .map(([slug, s]) => ({
      slug,
      label: SERVICES[slug] ? SERVICES[slug].label : slug,
      count: s.count,
      revenue: s.revenue,
    }))
    .sort((a, b) => b.count - a.count);

  // Bookings + revenue per barber.
  const barberStats = {};
  for (const r of rows) {
    if (!barberStats[r.barber]) barberStats[r.barber] = { count: 0, revenue: 0 };
    barberStats[r.barber].count += 1;
    barberStats[r.barber].revenue += r.price;
  }
  const byBarber = Object.entries(barberStats)
    .map(([slug, s]) => ({
      slug,
      name: BARBERS[slug] ? BARBERS[slug].name : slug,
      count: s.count,
      revenue: s.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Appointments + revenue by week (shared time axis for both charts).
  const weekStats = {};
  for (const r of rows) {
    const { key, weekStart } = weekKey(r.date);
    if (!weekStats[key]) weekStats[key] = { weekStart, count: 0, revenue: 0 };
    weekStats[key].count += 1;
    weekStats[key].revenue += r.price;
  }
  const revenueByWeek = Object.entries(weekStats)
    .map(([key, s]) => ({ week: key, weekStart: s.weekStart, count: s.count, revenue: s.revenue }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  /* ── Customer growth & returning customers ──────────────────────────────
     A "customer" here means someone with at least one *confirmed* booking
     (a no-show or cancellation alone doesn't count as an acquired customer).
     Uses each customer's entire history, any date, so "new" vs "returning"
     reflects reality even when a narrow date filter is applied elsewhere. */

  const allRows = db
    .prepare(`SELECT email, date FROM bookings WHERE status = 'confirmed' ORDER BY date ASC`)
    .all();

  const firstBookingDateByEmail = {};
  const lifetimeCountByEmail = {};
  for (const r of allRows) {
    if (!firstBookingDateByEmail[r.email]) firstBookingDateByEmail[r.email] = r.date;
    lifetimeCountByEmail[r.email] = (lifetimeCountByEmail[r.email] || 0) + 1;
  }

  // New customers per week (bucketed by each email's first-ever booking date),
  // restricted to the requested window so the chart matches the rest of the dashboard.
  const growthWeekStats = {};
  for (const [email, firstDate] of Object.entries(firstBookingDateByEmail)) {
    if (from && firstDate < from) continue;
    if (to && firstDate > to) continue;
    const { key, weekStart } = weekKey(firstDate);
    if (!growthWeekStats[key]) growthWeekStats[key] = { weekStart, newCustomers: 0 };
    growthWeekStats[key].newCustomers += 1;
  }
  const sortedGrowthWeeks = Object.entries(growthWeekStats)
    .map(([key, s]) => ({ week: key, weekStart: s.weekStart, newCustomers: s.newCustomers }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  // Running cumulative total, seeded with however many customers already
  // existed before the window started.
  let cumulativeBefore = 0;
  if (from) {
    cumulativeBefore = Object.values(firstBookingDateByEmail).filter((d) => d < from).length;
  }
  let running = cumulativeBefore;
  const customerGrowthByWeek = sortedGrowthWeeks.map((w) => {
    running += w.newCustomers;
    return { ...w, cumulativeCustomers: running };
  });

  // Returning vs. new, among customers active in the window.
  const emailsInWindow = new Set(rows.map((r) => r.email));
  let returningCustomers = 0;
  for (const email of emailsInWindow) {
    if ((lifetimeCountByEmail[email] || 0) > 1) returningCustomers += 1;
  }
  const totalCustomers = emailsInWindow.size;
  const newCustomersInWindow = totalCustomers - returningCustomers;
  const returningRate = totalCustomers ? Math.round((returningCustomers / totalCustomers) * 100) : 0;

  summary.totalCustomers = totalCustomers;
  summary.returningCustomers = returningCustomers;
  summary.newCustomers = newCustomersInWindow;
  summary.returningRate = returningRate;

  return {
    summary,
    busiestHours,
    busiestDays,
    topServices,
    byBarber,
    revenueByWeek,
    customerGrowthByWeek,
  };
}

module.exports = { getAnalytics };
