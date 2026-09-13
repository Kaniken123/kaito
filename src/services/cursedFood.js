'use strict';

/**
 * Kaito — /cursedfood: the cursed food picture of the day.
 *
 * Owns three behaviours the command and the scheduler share:
 *   • pick one random image post across the configured subreddits,
 *   • cache one pick per UTC day (so "of the day" means something), which
 *     `fresh:true` bypasses,
 *   • optionally post a new one to a channel once a day, if
 *     CURSED_FOOD_CHANNEL_ID is set.
 */

const { EmbedBuilder } = require('discord.js');

const reddit = require('./reddit');
const store = require('../db/cursedFood');
const { CURSED_FOOD_SUBREDDITS } = require('../lib/content');
const { COLOURS } = require('../lib/embeds');
const { randomItem, shuffle } = require('../lib/random');
const config = require('../lib/config');
const logger = require('../lib/logger');

/** Hour (UTC) the scheduled daily post goes out. */
const DAILY_POST_HOUR_UTC = 12;

let dailyTimer = null;

/**
 * One random image post, trying subreddits in random order until one yields
 * something. Returns null if every source came up empty.
 */
async function pickRandom() {
  for (const subreddit of shuffle(CURSED_FOOD_SUBREDDITS)) {
    try {
      const posts = await reddit.fetchImagePosts(subreddit, { limit: 50 });
      if (posts.length > 0) return randomItem(posts);
      logger.debug(`cursedfood: nothing usable in r/${subreddit}, trying another`);
    } catch (error) {
      logger.warn(`cursedfood: r/${subreddit} failed: ${error.message}`);
    }
  }

  return null;
}

/**
 * The pick for today, from cache when there is one.
 * @param {{ fresh?: boolean }} [options] — `fresh` skips (and doesn't touch) the cache.
 */
async function getPictureOfTheDay({ fresh = false } = {}) {
  if (fresh) return pickRandom();

  const day = store.utcDay();
  const cached = store.getPick(day);
  if (cached) return { ...cached, cached: true };

  const pick = await pickRandom();
  if (pick) store.setPick(day, pick);
  return pick;
}

/** Render a pick as an embed. Shared so the scheduled post looks identical. */
function buildEmbed(pick, { daily = false } = {}) {
  const embed = new EmbedBuilder()
    .setColor(COLOURS.brand)
    .setTitle(pick.title.slice(0, 256))
    .setImage(pick.imageUrl)
    .setFooter({
      text: [
        `r/${pick.subreddit}`,
        pick.author ? `by u/${pick.author}` : null,
        pick.ups ? `⬆ ${pick.ups}` : null,
        pick.source === 'proxy' ? 'via meme-api' : null,
      ]
        .filter(Boolean)
        .join(' • '),
    });

  if (pick.postUrl) embed.setURL(pick.postUrl);
  if (daily) embed.setAuthor({ name: '🍽️ Cursed food of the day' });

  return embed;
}

// ── Scheduled daily post ────────────────────────────────────────────────────

/** Milliseconds until the next DAILY_POST_HOUR_UTC. */
function msUntilNextPost() {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DAILY_POST_HOUR_UTC),
  );
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Post today's picture if it hasn't gone out yet. The "already posted" flag
 * lives in the database, so restarts and redeploys can't double-post.
 */
async function postDaily(client) {
  const channelId = config.cursedFoodChannelId;
  if (!channelId) return;

  const day = store.utcDay();
  if (store.wasPosted(day)) return;

  // Only post once the hour has arrived; before then, wait for the timer.
  if (new Date().getUTCHours() < DAILY_POST_HOUR_UTC) return;

  const pick = await getPictureOfTheDay();
  if (!pick) {
    logger.warn('Daily cursed food post skipped: no image source available');
    return;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    logger.warn(`CURSED_FOOD_CHANNEL_ID ${channelId} is not a text channel Kaito can see`);
    return;
  }

  await channel.send({ embeds: [buildEmbed(pick, { daily: true })] });
  store.markPosted(day, channelId, pick);
  logger.info(`Posted the cursed food of the day to #${channel.name ?? channelId}`);
}

/**
 * Start the daily post loop. Called once from the ready event.
 * Runs a catch-up check immediately so a redeploy after the post hour still
 * posts today's image, then re-arms itself for the next one.
 */
function startDailyPost(client) {
  if (!config.cursedFoodChannelId) {
    logger.info('CURSED_FOOD_CHANNEL_ID not set — skipping the daily cursed food post');
    return;
  }

  const tick = async () => {
    try {
      await postDaily(client);
    } catch (error) {
      logger.error('Daily cursed food post failed:', error);
    } finally {
      dailyTimer = setTimeout(tick, msUntilNextPost());
      dailyTimer.unref(); // never hold the process open on shutdown
    }
  };

  logger.info(`Daily cursed food post armed for ${DAILY_POST_HOUR_UTC}:00 UTC`);
  tick();
}

/** Stop the loop (used by graceful shutdown). */
function stopDailyPost() {
  if (dailyTimer) clearTimeout(dailyTimer);
  dailyTimer = null;
}

module.exports = { getPictureOfTheDay, pickRandom, buildEmbed, startDailyPost, stopDailyPost };
