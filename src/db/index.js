'use strict';

/**
 * Kaito — database connection + schema migrations.
 *
 * Everything SQL lives under src/db/. Command files only ever call the small
 * functions the modules in here export (e.g. `warnings.add(...)`), never raw
 * SQL — that's what makes swapping SQLite for Postgres later a contained job.
 *
 * WAL mode is on: better read concurrency and much safer against corruption
 * if the process is killed mid-write (which hosting platforms do routinely).
 */

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const config = require('../lib/config');
const logger = require('../lib/logger');

// Make sure the folder exists — better-sqlite3 will not create it for us.
fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Schema. Written as plain CREATE TABLE IF NOT EXISTS so it is safe to run on
 * every boot; for anything more involved later, add a numbered migration here.
 */
function migrate() {
  db.exec(`
    -- Moderation warnings issued to a member.
    CREATE TABLE IF NOT EXISTS warnings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT    NOT NULL,
      user_id     TEXT    NOT NULL,
      moderator_id TEXT   NOT NULL,
      reason      TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings (guild_id, user_id);

    -- Reminders, persisted so they survive a restart.
    CREATE TABLE IF NOT EXISTS reminders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT,
      channel_id  TEXT    NOT NULL,
      user_id     TEXT    NOT NULL,
      message     TEXT    NOT NULL,
      remind_at   INTEGER NOT NULL,
      created_at  INTEGER NOT NULL,
      delivered   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders (delivered, remind_at);

    -- Polls and their votes (one row per voter per poll = one vote each).
    CREATE TABLE IF NOT EXISTS polls (
      id          TEXT    PRIMARY KEY,
      guild_id    TEXT,
      channel_id  TEXT    NOT NULL,
      message_id  TEXT,
      creator_id  TEXT    NOT NULL,
      question    TEXT    NOT NULL,
      options     TEXT    NOT NULL,   -- JSON array of option labels
      closed      INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      poll_id      TEXT    NOT NULL,
      user_id      TEXT    NOT NULL,
      option_index INTEGER NOT NULL,
      voted_at     INTEGER NOT NULL,
      PRIMARY KEY (poll_id, user_id),
      FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE
    );

    -- /trivia: one row per player per guild.
    CREATE TABLE IF NOT EXISTS trivia_scores (
      guild_id    TEXT    NOT NULL,
      user_id     TEXT    NOT NULL,
      correct     INTEGER NOT NULL DEFAULT 0,
      answered    INTEGER NOT NULL DEFAULT 0,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );

    -- /cursedfood: the picture of the day per UTC day, plus whether the
    -- scheduled daily post for that day has already gone out (so a redeploy
    -- mid-day can't post it twice).
    CREATE TABLE IF NOT EXISTS cursed_food_days (
      day               TEXT    PRIMARY KEY,   -- YYYY-MM-DD, UTC
      pick              TEXT    NOT NULL,      -- JSON: the chosen post
      created_at        INTEGER NOT NULL,
      posted_channel_id TEXT
    );

    -- Per-guild settings (ragebait channel + intensity, log channel override...).
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id            TEXT PRIMARY KEY,
      ragebait_channel_id TEXT,
      ragebait_enabled    INTEGER NOT NULL DEFAULT 0,
      ragebait_intensity  TEXT    NOT NULL DEFAULT 'unhinged',
      log_channel_id      TEXT,
      updated_at          INTEGER NOT NULL
    );
  `);
}

migrate();
logger.info(`Database ready at ${config.databasePath}`);

/** Close cleanly on shutdown so WAL contents are flushed into the main file. */
function close() {
  try {
    db.close();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Failed to close database:', error);
  }
}

module.exports = { db, close };
