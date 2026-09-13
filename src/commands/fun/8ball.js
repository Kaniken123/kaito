'use strict';

/**
 * /8ball — ask a yes/no question, get an unhelpfully confident answer.
 *
 * The answer list lives in src/lib/content.js so it can be reworded without
 * touching this file.
 */

const { SlashCommandBuilder } = require('discord.js');

const { EIGHT_BALL_ANSWERS } = require('../../lib/content');
const { COLOURS, brandEmbed } = require('../../lib/embeds');
const { randomItem } = require('../../lib/random');

/** Embed colour per answer mood — green for yes, yellow for maybe, red for no. */
const MOOD_COLOURS = { yes: COLOURS.good, maybe: COLOURS.warn, no: COLOURS.bad };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8-ball a yes/no question.')
    .addStringOption((option) =>
      option
        .setName('question')
        .setDescription('What do you want to know?')
        .setRequired(true)
        .setMaxLength(256),
    ),

  async execute(interaction) {
    const question = interaction.options.getString('question', true);
    const answer = randomItem(EIGHT_BALL_ANSWERS);

    const embed = brandEmbed()
      .setColor(MOOD_COLOURS[answer.mood])
      .setTitle('🎱 The magic 8-ball says…')
      .setDescription(`> ${question}\n\n**${answer.text}**`)
      .setFooter({ text: `Asked by ${interaction.user.displayName}` });

    await interaction.reply({ embeds: [embed] });
  },
};
