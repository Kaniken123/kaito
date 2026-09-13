'use strict';

/**
 * /cursedfood — the cursed food picture of the day.
 *
 * Default: everyone gets the same picture for the whole UTC day (cached in the
 * database). `fresh:true` pulls a brand-new one and leaves the cache alone.
 *
 * All the fetching, filtering and caching lives in services/cursedFood.js; this
 * file is only the Discord surface.
 */

const { SlashCommandBuilder } = require('discord.js');

const cursedFood = require('../../services/cursedFood');
const { fail } = require('../../lib/embeds');
const logger = require('../../lib/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cursedfood')
    .setDescription('A cursed food picture, fresh from the worst kitchens on Reddit.')
    .addBooleanOption((option) =>
      option
        .setName('fresh')
        .setDescription("Skip today's cached picture and pull a brand-new one"),
    ),

  async execute(interaction) {
    const fresh = interaction.options.getBoolean('fresh') ?? false;

    // Reddit plus a possible fallback can exceed Discord's 3-second window, so
    // defer. A public deferral can't become ephemeral later — a failure here
    // edits that reply instead of posting a private one.
    await interaction.deferReply();

    try {
      const pick = await cursedFood.getPictureOfTheDay({ fresh });

      if (!pick) {
        await fail(interaction, "Couldn't reach the cursed kitchen right now, try again in a bit.");
        return;
      }

      await interaction.editReply({ embeds: [cursedFood.buildEmbed(pick, { daily: !fresh })] });
    } catch (error) {
      logger.error('/cursedfood failed:', error);
      await fail(interaction, "Couldn't reach the cursed kitchen right now, try again in a bit.");
    }
  },
};
