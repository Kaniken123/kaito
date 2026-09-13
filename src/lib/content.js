'use strict';

/**
 * Kaito — editable content lists.
 *
 * Pure data, no logic: add, remove or reorder entries without touching any
 * command code. Kept out of the command files so tweaking the flavour of the
 * bot doesn't mean editing behaviour.
 */

/**
 * Subreddits `/cursedfood` pulls from. One is picked at random, then a random
 * image post from it; if a subreddit yields nothing usable the next is tried.
 */
const CURSED_FOOD_SUBREDDITS = ['cursedfoods', 'StupidFood', 'shittyfoodporn', 'forbiddensnacks'];

/** Subreddits `/meme` pulls from when no subreddit is given. */
const MEME_SUBREDDITS = ['memes', 'dankmemes', 'me_irl', 'ProgrammerHumor', 'wholesomememes'];

/**
 * `/8ball` replies. `mood` only drives the embed colour:
 *   yes → green, maybe → yellow, no → red.
 */
const EIGHT_BALL_ANSWERS = [
  { text: 'It is certain.', mood: 'yes' },
  { text: 'Without a doubt.', mood: 'yes' },
  { text: 'Yes — definitely.', mood: 'yes' },
  { text: 'You may rely on it.', mood: 'yes' },
  { text: 'As I see it, yes.', mood: 'yes' },
  { text: 'Most likely.', mood: 'yes' },
  { text: 'Outlook good.', mood: 'yes' },
  { text: 'Signs point to yes.', mood: 'yes' },
  { text: 'Reply hazy — try again.', mood: 'maybe' },
  { text: 'Ask again later.', mood: 'maybe' },
  { text: 'Better not tell you now.', mood: 'maybe' },
  { text: 'Cannot predict now.', mood: 'maybe' },
  { text: 'Concentrate and ask again.', mood: 'maybe' },
  { text: 'The stars are being coy about it.', mood: 'maybe' },
  { text: "Don't count on it.", mood: 'no' },
  { text: 'My reply is no.', mood: 'no' },
  { text: 'My sources say no.', mood: 'no' },
  { text: 'Outlook not so good.', mood: 'no' },
  { text: 'Very doubtful.', mood: 'no' },
  { text: 'Absolutely not, and stop asking.', mood: 'no' },
];

module.exports = { CURSED_FOOD_SUBREDDITS, MEME_SUBREDDITS, EIGHT_BALL_ANSWERS };
