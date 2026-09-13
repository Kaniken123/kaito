'use strict';

/**
 * /coinflip — flip one coin, or up to ten at once.
 */

const { SlashCommandBuilder } = require('discord.js');

const { COLOURS, brandEmbed } = require('../../lib/embeds');
const { randomInt } = require('../../lib/random');

const MAX_COINS = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Flip a coin.')
    .addIntegerOption((option) =>
      option
        .setName('count')
        .setDescription(`How many coins to flip (1–${MAX_COINS}, default 1)`)
        .setMinValue(1)
        .setMaxValue(MAX_COINS),
    ),

  async execute(interaction) {
    const count = interaction.options.getInteger('count') ?? 1;
    const flips = Array.from({ length: count }, () => (randomInt(0, 1) === 0 ? 'Heads' : 'Tails'));

    if (count === 1) {
      const [flip] = flips;
      const embed = brandEmbed()
        .setColor(flip === 'Heads' ? COLOURS.good : COLOURS.warn)
        .setTitle(flip === 'Heads' ? '🪙 Heads!' : '🪙 Tails!');

      await interaction.reply({ embeds: [embed] });
      return;
    }

    const heads = flips.filter((flip) => flip === 'Heads').length;
    const embed = brandEmbed()
      .setTitle(`🪙 ${count} flips`)
      .setDescription(flips.map((flip) => (flip === 'Heads' ? '🟡' : '⚪')).join(' '))
      .addFields(
        { name: 'Heads', value: String(heads), inline: true },
        { name: 'Tails', value: String(count - heads), inline: true },
      );

    await interaction.reply({ embeds: [embed] });
  },
};
