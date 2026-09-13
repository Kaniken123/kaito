'use strict';

/**
 * /roll — dice in standard notation: `2d6`, `d20`, `4d8+2`, `3d6-1`.
 *
 * Parsing is deliberately strict: anything that isn't clean notation gets an
 * ephemeral explanation rather than a silent 1d6.
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const { brandEmbed } = require('../../lib/embeds');
const { randomInt } = require('../../lib/random');

/** `[count]d<sides>[+/-modifier]`, with whitespace allowed around the parts. */
const DICE_PATTERN = /^\s*(\d{0,3})\s*d\s*(\d{1,4})\s*(?:([+-])\s*(\d{1,4}))?\s*$/i;

const MAX_DICE = 100;
const MAX_SIDES = 1000;
/** Beyond this, list the total only — an embed field can't hold 100 numbers nicely. */
const MAX_LISTED_ROLLS = 30;

/**
 * Turn dice notation into a roll plan.
 * @returns {{count: number, sides: number, modifier: number} | {error: string}}
 */
function parseDice(input) {
  const match = DICE_PATTERN.exec(input);
  if (!match) {
    return { error: "That isn't dice notation. Try `2d6`, `d20` or `4d8+2`." };
  }

  const count = match[1] === '' ? 1 : Number.parseInt(match[1], 10);
  const sides = Number.parseInt(match[2], 10);
  const modifier = match[3] ? Number.parseInt(match[4], 10) * (match[3] === '-' ? -1 : 1) : 0;

  if (count < 1 || count > MAX_DICE) return { error: `Roll between 1 and ${MAX_DICE} dice.` };
  if (sides < 2 || sides > MAX_SIDES) return { error: `Dice need 2 to ${MAX_SIDES} sides.` };

  return { count, sides, modifier };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice, e.g. 2d6 or d20+3.')
    .addStringOption((option) =>
      option
        .setName('dice')
        .setDescription('Dice notation: 2d6, d20, 4d8+2 (default 1d6)')
        .setMaxLength(20),
    ),

  async execute(interaction) {
    const input = interaction.options.getString('dice') ?? '1d6';
    const plan = parseDice(input);

    if (plan.error) {
      await interaction.reply({ content: plan.error, flags: MessageFlags.Ephemeral });
      return;
    }

    const { count, sides, modifier } = plan;
    const rolls = Array.from({ length: count }, () => randomInt(1, sides));
    const sum = rolls.reduce((total, roll) => total + roll, 0);
    const total = sum + modifier;

    const notation = `${count}d${sides}${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : modifier}`;
    const embed = brandEmbed().setTitle(`🎲 ${notation} → ${total}`);

    if (count > 1 || modifier !== 0) {
      const listed =
        rolls.length <= MAX_LISTED_ROLLS
          ? rolls.join(' + ')
          : `${rolls.slice(0, MAX_LISTED_ROLLS).join(' + ')} … (+${rolls.length - MAX_LISTED_ROLLS} more)`;
      const maths = modifier === 0 ? `${listed} = **${total}**` : `${listed} = ${sum}, ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)} = **${total}**`;

      embed.setDescription(maths);
    }

    await interaction.reply({ embeds: [embed] });
  },

  // Exported for local testing of the parser without a Discord connection.
  parseDice,
};
