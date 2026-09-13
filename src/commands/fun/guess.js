'use strict';

/**
 * /guess — guess the secret number between 1 and 100 in seven tries.
 *
 * The guess arrives through a modal (a popup text box) rather than chat, which
 * keeps Kaito slash-command-only: it never has to read channel messages.
 *
 * Games live in memory keyed by message ID and expire after five idle minutes.
 * A restart abandons in-progress games, which the buttons then report.
 */

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');

const { COLOURS, brandEmbed } = require('../../lib/embeds');
const { randomInt } = require('../../lib/random');
const logger = require('../../lib/logger');

const RANGE_MIN = 1;
const RANGE_MAX = 100;
const MAX_ATTEMPTS = 7;
const IDLE_TIMEOUT_MS = 5 * 60_000;

/** messageId → { userId, secret, guesses: [{value, hint}], timer } */
const games = new Map();

function guessButton({ disabled = false } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('guess:open')
      .setLabel('Make a guess')
      .setEmoji('🔢')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  );
}

function historyLines(game) {
  return game.guesses.map((guess, index) => `\`#${index + 1}\` **${guess.value}** — ${guess.hint}`);
}

function boardEmbed(game, { state = 'playing' } = {}) {
  const attemptsLeft = MAX_ATTEMPTS - game.guesses.length;
  const embed = brandEmbed().setTitle('🔢 Guess the number');

  const header =
    state === 'won'
      ? `🎉 <@${game.userId}> got it: **${game.secret}** in ${game.guesses.length} ${game.guesses.length === 1 ? 'try' : 'tries'}.`
      : state === 'lost'
        ? `💀 Out of tries — the number was **${game.secret}**.`
        : state === 'expired'
          ? `⏳ Game abandoned — the number was **${game.secret}**.`
          : `I picked a number between **${RANGE_MIN}** and **${RANGE_MAX}**. <@${game.userId}> has **${attemptsLeft}** ${attemptsLeft === 1 ? 'try' : 'tries'} left.`;

  embed.setDescription([header, '', ...historyLines(game)].join('\n').trim());

  if (state === 'won') embed.setColor(COLOURS.good);
  else if (state === 'lost' || state === 'expired') embed.setColor(COLOURS.bad);

  return embed;
}

/** End a game: drop its state and leave the final board on screen. */
function finish(messageId, game) {
  clearTimeout(game.timer);
  games.delete(messageId);
}

function armIdleTimer(messageId, game) {
  clearTimeout(game.timer);
  game.timer = setTimeout(async () => {
    if (!games.has(messageId)) return;
    finish(messageId, game);
    await game.message
      .edit({ embeds: [boardEmbed(game, { state: 'expired' })], components: [guessButton({ disabled: true })] })
      .catch((error) => logger.debug(`Could not expire guess game: ${error.message}`));
  }, IDLE_TIMEOUT_MS);
  game.timer.unref(); // an idle game must not keep the process alive
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guess')
    .setDescription(`Guess the secret number between ${RANGE_MIN} and ${RANGE_MAX}.`),

  async execute(interaction) {
    const game = {
      userId: interaction.user.id,
      secret: randomInt(RANGE_MIN, RANGE_MAX),
      guesses: [],
      timer: null,
      message: null,
    };

    const sent = await interaction.reply({
      embeds: [boardEmbed(game)],
      components: [guessButton()],
      withResponse: true,
    });

    // `resource` is nullable in the typings; fall back to fetching the reply.
    game.message = sent.resource?.message ?? (await interaction.fetchReply());
    games.set(game.message.id, game);
    armIdleTimer(game.message.id, game);
  },

  /** The "Make a guess" button opens the modal. */
  async handleComponent(interaction, [action]) {
    if (action !== 'open') return;

    const game = games.get(interaction.message.id);
    if (!game) {
      await interaction.reply({
        content: 'That game has finished. Start a new one with `/guess`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.user.id !== game.userId) {
      await interaction.reply({
        content: "That's someone else's game — start your own with `/guess`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Current v14 modal shape: a Label wraps the text input.
    const modal = new ModalBuilder()
      .setCustomId('guess:submit')
      .setTitle('Guess the number')
      .addLabelComponents(
        new LabelBuilder()
          .setLabel(`A number between ${RANGE_MIN} and ${RANGE_MAX}`)
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('value')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(3),
          ),
      );

    await interaction.showModal(modal);
  },

  /** The modal comes back here: customId `guess:submit`. */
  async handleModal(interaction, [action]) {
    if (action !== 'submit') return;

    // The modal was opened from the game message, so it can update it directly.
    const messageId = interaction.message?.id;
    const game = messageId ? games.get(messageId) : null;

    if (!game) {
      await interaction.reply({
        content: 'That game has finished. Start a new one with `/guess`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const raw = interaction.fields.getTextInputValue('value').trim();
    const value = Number.parseInt(raw, 10);

    if (!/^\d+$/.test(raw) || value < RANGE_MIN || value > RANGE_MAX) {
      await interaction.reply({
        content: `Guess a whole number between ${RANGE_MIN} and ${RANGE_MAX}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (game.guesses.some((guess) => guess.value === value)) {
      await interaction.reply({
        content: `You already guessed **${value}**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const hint = value === game.secret ? 'correct!' : value < game.secret ? 'too low ⬆️' : 'too high ⬇️';
    game.guesses.push({ value, hint });

    const won = value === game.secret;
    const lost = !won && game.guesses.length >= MAX_ATTEMPTS;

    if (won || lost) {
      finish(messageId, game);
      await interaction.update({
        embeds: [boardEmbed(game, { state: won ? 'won' : 'lost' })],
        components: [guessButton({ disabled: true })],
      });
      return;
    }

    armIdleTimer(messageId, game);
    await interaction.update({ embeds: [boardEmbed(game)], components: [guessButton()] });
  },
};
