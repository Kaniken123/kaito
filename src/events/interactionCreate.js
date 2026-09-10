'use strict';

/**
 * Kaito — central interaction router.
 *
 * Handles three kinds of interaction:
 *   1. Slash commands            → command.execute(interaction)
 *   2. Autocomplete              → command.autocomplete(interaction)
 *   3. Buttons / select menus    → command.handleComponent(interaction, parts)
 *
 * Component routing convention: a custom ID is colon-separated and its FIRST
 * segment is the owning command's name, e.g. "poll:vote:2" is routed to the
 * /poll command. That keeps a feature's buttons in the same file as its command.
 */

const { Events, MessageFlags } = require('discord.js');
const logger = require('../lib/logger');

/**
 * Reply with an error without ever throwing a second time. An interaction may
 * already be replied to or deferred, so pick the right method for its state.
 */
async function replyWithError(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (error) {
    logger.error('Failed to deliver error message to user:', error);
  }
}

module.exports = {
  name: Events.InteractionCreate,

  /** @param {import('discord.js').Interaction} interaction */
  async execute(interaction) {
    const { client } = interaction;

    // ── 1. Slash commands ────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        logger.warn(`Received unknown command: /${interaction.commandName}`);
        await replyWithError(interaction, 'That command no longer exists. Try `/help`.');
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        logger.error(`Error executing /${interaction.commandName}:`, error);
        await replyWithError(interaction, 'Something went wrong running that command.');
      }
      return;
    }

    // ── 2. Autocomplete ──────────────────────────────────────────────────
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (typeof command?.autocomplete !== 'function') return;

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        logger.error(`Autocomplete failed for /${interaction.commandName}:`, error);
      }
      return;
    }

    // ── 3. Buttons and select menus ──────────────────────────────────────
    if (interaction.isMessageComponent()) {
      const parts = interaction.customId.split(':');
      const command = client.commands.get(parts[0]);

      if (typeof command?.handleComponent !== 'function') {
        logger.debug(`No component handler for customId "${interaction.customId}"`);
        return;
      }

      try {
        await command.handleComponent(interaction, parts.slice(1));
      } catch (error) {
        logger.error(`Component handler failed for "${interaction.customId}":`, error);
        await replyWithError(interaction, 'Something went wrong handling that.');
      }
    }
  },
};
