'use strict';

/**
 * /meme — a random meme image.
 *
 * Uses the shared Reddit service, so it goes through authenticated Reddit when
 * credentials are configured and the public meme-api proxy when they aren't.
 */

const { SlashCommandBuilder } = require('discord.js');

const reddit = require('../../services/reddit');
const { MEME_SUBREDDITS } = require('../../lib/content');
const { brandEmbed, fail } = require('../../lib/embeds');
const { randomItem, shuffle } = require('../../lib/random');
const logger = require('../../lib/logger');

/** Subreddit names are letters, digits and underscores — reject anything else. */
const SUBREDDIT_PATTERN = /^[A-Za-z0-9_]{2,24}$/;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Fetch a random meme.')
    .addStringOption((option) =>
      option
        .setName('subreddit')
        .setDescription('Pull from a specific subreddit instead of the defaults')
        .setMaxLength(24),
    ),

  async execute(interaction) {
    const requested = interaction.options.getString('subreddit');

    if (requested && !SUBREDDIT_PATTERN.test(requested)) {
      await fail(interaction, "That doesn't look like a subreddit name.");
      return;
    }

    // Fetching can take longer than Discord's 3-second reply window.
    await interaction.deferReply();

    // With a specific subreddit there's one candidate; otherwise try the
    // defaults in random order until one has something.
    const candidates = requested ? [requested] : shuffle(MEME_SUBREDDITS);

    for (const subreddit of candidates) {
      try {
        const posts = await reddit.fetchImagePosts(subreddit, { limit: 50 });
        if (posts.length === 0) continue;

        const post = randomItem(posts);
        const embed = brandEmbed()
          .setTitle(post.title.slice(0, 256))
          .setImage(post.imageUrl)
          .setFooter({
            text: [`r/${post.subreddit}`, post.ups ? `⬆ ${post.ups}` : null]
              .filter(Boolean)
              .join(' • '),
          });

        if (post.postUrl) embed.setURL(post.postUrl);

        await interaction.editReply({ embeds: [embed] });
        return;
      } catch (error) {
        logger.warn(`/meme failed on r/${subreddit}: ${error.message}`);
      }
    }

    await fail(
      interaction,
      requested
        ? `Couldn't find a usable image in r/${requested}.`
        : "The meme supply is down right now — try again in a bit.",
    );
  },
};
