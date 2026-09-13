'use strict';

/**
 * Kaito — /trivia scores.
 *
 * One row per player per guild: how many questions they answered and how many
 * they got right. Deliberately simple — no per-question history.
 */

const { db } = require('./index');

const upsertScore = db.prepare(`
  INSERT INTO trivia_scores (guild_id, user_id, correct, answered, updated_at)
  VALUES (@guildId, @userId, @correct, 1, @now)
  ON CONFLICT (guild_id, user_id) DO UPDATE SET
    correct    = correct + @correct,
    answered   = answered + 1,
    updated_at = @now
`);

const selectScore = db.prepare(
  'SELECT correct, answered FROM trivia_scores WHERE guild_id = ? AND user_id = ?',
);

const selectTop = db.prepare(`
  SELECT user_id, correct, answered
  FROM trivia_scores
  WHERE guild_id = ?
  ORDER BY correct DESC, answered ASC
  LIMIT ?
`);

/** Record one answer. `correct` is a boolean. */
function recordAnswer(guildId, userId, correct) {
  upsertScore.run({ guildId, userId, correct: correct ? 1 : 0, now: Date.now() });
}

/** A player's score, or null if they've never played here. */
function scoreFor(guildId, userId) {
  return selectScore.get(guildId, userId) ?? null;
}

/** Highest scorers in a guild, best first. */
function topScores(guildId, limit = 10) {
  return selectTop.all(guildId, limit);
}

module.exports = { recordAnswer, scoreFor, topScores };
