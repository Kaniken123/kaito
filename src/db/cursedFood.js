'use strict';

/**
 * Kaito — /cursedfood persistence.
 *
 * Two jobs, both keyed by UTC day:
 *   • the "picture of the day" cache, so repeated calls on the same day return
 *     the same image unless someone asks for a fresh one,
 *   • a record of whether the scheduled daily post has gone out, so a redeploy
 *     mid-day doesn't post a second time.
 */

const { db } = require('./index');

const selectDay = db.prepare('SELECT pick, posted_channel_id FROM cursed_food_days WHERE day = ?');

const insertDay = db.prepare(`
  INSERT INTO cursed_food_days (day, pick, created_at)
  VALUES (?, ?, ?)
  ON CONFLICT (day) DO UPDATE SET pick = excluded.pick
`);

const markPostedStmt = db.prepare(`
  INSERT INTO cursed_food_days (day, pick, created_at, posted_channel_id)
  VALUES (?, ?, ?, ?)
  ON CONFLICT (day) DO UPDATE SET posted_channel_id = excluded.posted_channel_id
`);

/** Today's date in UTC as YYYY-MM-DD — the cache key. */
function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** The cached pick for a day, or null. */
function getPick(day) {
  const row = selectDay.get(day);
  if (!row) return null;
  try {
    return JSON.parse(row.pick);
  } catch {
    return null; // corrupt row: treat as a cache miss rather than crashing
  }
}

/** Cache a day's pick (idempotent — the last write for a day wins). */
function setPick(day, pick) {
  insertDay.run(day, JSON.stringify(pick), Date.now());
}

/** Has the scheduled post for this day already been sent? */
function wasPosted(day) {
  return Boolean(selectDay.get(day)?.posted_channel_id);
}

/** Record that the scheduled post for this day went out to a channel. */
function markPosted(day, channelId, pick) {
  markPostedStmt.run(day, JSON.stringify(pick), Date.now(), channelId);
}

module.exports = { utcDay, getPick, setPick, wasPosted, markPosted };
