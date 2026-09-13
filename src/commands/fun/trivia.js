'use strict';

/**
 * /trivia — a multiple-choice question from the Open Trivia DB.
 *
 * Anyone in the channel may answer once, within the window. Each answer gets
 * private feedback immediately; when the window closes the message reveals the
 * answer and who got it right.
 *
 * Live questions are held in memory on purpose: a question only lives for
 * 45 seconds, so a restart mid-question just expires it (the buttons say so).
 * Scores are the only thing persisted.
 */

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const trivia = require('../../services/trivia');
const scores = require('../../db/trivia');
const { COLOURS, brandEmbed, fail } = require('../../lib/embeds');
const logger = require('../../lib/logger');

const ANSWER_WINDOW_MS = 45_000;
const LETTERS = ['A', 'B', 'C', 'D'];
const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** messageId → { answers, correctIndex, question, answered: Map, message, timer } */
const active = new Map();

/** Scores are per guild; DMs share one bucket. */
const scoreKey = (interaction) => interaction.guildId ?? '@me';

function answerRow(answers, { disabled = false } = {}) {
  return new ActionRowBuilder().addComponents(
    answers.map((_, index) =>
      new ButtonBuilder()
        .setCustomId(`trivia:answer:${index}`)
        .setLabel(LETTERS[index])
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
    ),
  );
}

function questionEmbed(question) {
  const options = question.answers.map((answer, index) => `**${LETTERS[index]}.** ${answer}`);

  return brandEmbed()
    .setTitle('❓ Trivia')
    .setDescription(`**${question.question}**\n\n${options.join('\n')}`)
    .setFooter({
      text: `${question.category} • ${DIFFICULTY_LABELS[question.difficulty] ?? question.difficulty} • answers close in ${ANSWER_WINDOW_MS / 1000}s`,
    });
}

/** Close a question: disable the buttons and show the answer. */
async function reveal(messageId) {
  const state = active.get(messageId);
  if (!state) return;
  active.delete(messageId);
  clearTimeout(state.timer);

  const { question, answered } = state;
  const winners = [...answered.entries()]
    .filter(([, index]) => index === question.correctIndex)
    .map(([userId]) => `<@${userId}>`);

  const embed = brandEmbed()
    .setColor(winners.length > 0 ? COLOURS.good : COLOURS.muted)
    .setTitle('❓ Trivia — closed')
    .setDescription(
      [
        `**${question.question}**`,
        '',
        `✅ **${LETTERS[question.correctIndex]}. ${question.answers[question.correctIndex]}**`,
        '',
        winners.length > 0
          ? `Correct: ${winners.join(', ')}`
          : answered.size > 0
            ? 'Nobody got it right.'
            : 'Nobody answered.',
      ].join('\n'),
    )
    .setFooter({ text: `${question.category} • ${answered.size} answer(s)` });

  await state.message
    .edit({ embeds: [embed], components: [answerRow(question.answers, { disabled: true })] })
    .catch((error) => logger.debug(`Could not edit trivia message ${messageId}: ${error.message}`));
}

async function play(interaction) {
  const difficulty = interaction.options.getString('difficulty') ?? undefined;

  await interaction.deferReply();

  let question;
  try {
    question = await trivia.fetchQuestion({ difficulty });
  } catch (error) {
    if (error instanceof trivia.TriviaRateLimitError) {
      await fail(interaction, 'Trivia is being rate-limited — try again in a few seconds.');
      return;
    }
    logger.error('/trivia could not fetch a question:', error);
    await fail(interaction, "Couldn't reach the trivia database right now, try again shortly.");
    return;
  }

  const message = await interaction.editReply({
    embeds: [questionEmbed(question)],
    components: [answerRow(question.answers)],
  });

  const state = { question, answered: new Map(), message, timer: null };
  state.timer = setTimeout(() => {
    reveal(message.id).catch((error) => logger.error('Trivia reveal failed:', error));
  }, ANSWER_WINDOW_MS);
  state.timer.unref(); // a pending question must not hold the process open

  active.set(message.id, state);
}

async function leaderboard(interaction) {
  const rows = scores.topScores(scoreKey(interaction), 10);

  if (rows.length === 0) {
    await interaction.reply({
      content: 'Nobody has played trivia here yet. Start with `/trivia play`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = rows.map((row, index) => {
    const rank = medals[index] ?? `**${index + 1}.**`;
    return `${rank} <@${row.user_id}> — **${row.correct}** correct of ${row.answered}`;
  });

  const you = scores.scoreFor(scoreKey(interaction), interaction.user.id);
  const embed = brandEmbed()
    .setTitle('🏆 Trivia leaderboard')
    .setDescription(lines.join('\n'));

  if (you) embed.setFooter({ text: `You: ${you.correct} correct of ${you.answered}` });

  await interaction.reply({ embeds: [embed] });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Trivia questions from the Open Trivia DB.')
    .addSubcommand((sub) =>
      sub
        .setName('play')
        .setDescription('Ask a new trivia question.')
        .addStringOption((option) =>
          option
            .setName('difficulty')
            .setDescription('How hard the question should be')
            .addChoices(
              { name: 'Easy', value: 'easy' },
              { name: 'Medium', value: 'medium' },
              { name: 'Hard', value: 'hard' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('leaderboard').setDescription("Who's winning at trivia here."),
    ),

  async execute(interaction) {
    if (interaction.options.getSubcommand() === 'leaderboard') {
      await leaderboard(interaction);
      return;
    }
    await play(interaction);
  },

  /** Button presses: customId `trivia:answer:<index>`. */
  async handleComponent(interaction, [action, rawIndex]) {
    if (action !== 'answer') return;

    const state = active.get(interaction.message.id);
    if (!state) {
      await interaction.reply({
        content: 'That question has closed. Start a new one with `/trivia play`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (state.answered.has(interaction.user.id)) {
      await interaction.reply({
        content: "You've already answered this one.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const index = Number.parseInt(rawIndex, 10);
    const correct = index === state.question.correctIndex;

    state.answered.set(interaction.user.id, index);
    scores.recordAnswer(scoreKey(interaction), interaction.user.id, correct);

    await interaction.reply({
      content: correct
        ? `✅ Correct — **${state.question.answers[index]}**. Sit tight for the reveal.`
        : `❌ Not **${state.question.answers[index]}**. Better luck next question.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
