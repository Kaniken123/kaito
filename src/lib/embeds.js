'use strict';

/**
 * Kaito — shared embed styling and a safe ephemeral-error reply.
 *
 * One palette in one place, so every command looks like the same bot.
 */

const { EmbedBuilder, MessageFlags } = require('discord.js');

const logger = require('./logger');

const COLOURS = {
  brand: 0x5865f2, // Discord blurple — neutral Kaito output
  good: 0x57f287, // success, correct answers
  bad: 0xed4245, // failure, wrong answers
  warn: 0xfee75c, // "maybe", in-progress
  muted: 0x4f545c, // finished / disabled state
};

/** An embed pre-set to Kaito's colour. */
function brandEmbed() {
  return new EmbedBuilder().setColor(COLOURS.brand);
}

/**
 * Tell the user something went wrong, ephemerally, without ever throwing a
 * second time — the interaction may already be replied to or deferred.
 *
 * Note: an interaction deferred *publicly* can't be made ephemeral afterwards,
 * so this edits that public reply instead. Commands that must fail privately
 * should stay undeferred or defer ephemerally.
 */
async function fail(interaction, content) {
  try {
    if (interaction.deferred) await interaction.editReply({ content, embeds: [], components: [] });
    else if (interaction.replied) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch (error) {
    logger.error('Failed to deliver error message to user:', error);
  }
}

module.exports = { COLOURS, brandEmbed, fail };
