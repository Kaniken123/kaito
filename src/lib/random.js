'use strict';

/**
 * Kaito — small randomness helpers.
 *
 * Math.random() is fine for games and picking pictures; nothing here is
 * security-sensitive. Kept in one place so the fun commands don't each
 * re-implement (and subtly mis-implement) a shuffle.
 */

/** Random integer between min and max, both inclusive. */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** One random element, or undefined for an empty array. */
function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/** A shuffled copy (Fisher–Yates). Never mutates the input. */
function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

module.exports = { randomInt, randomItem, shuffle };
