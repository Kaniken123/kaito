'use strict';

/**
 * Kaito — Open Trivia DB client.
 *
 * Three quirks of the API drive this file:
 *   • It allows one request every 5 seconds per IP and answers a faster one
 *     with response_code 5, so all calls go through a single queue that keeps
 *     them spaced out.
 *   • A session token stops the same question repeating. It goes stale after
 *     6 idle hours (code 3) and runs dry once every question has been served
 *     (code 4); both are fixed by getting a new token.
 *   • Responses are requested with `encode=url3986` because the default
 *     encoding uses HTML entities, which look broken inside a Discord embed.
 */

const { fetchJson } = require('../lib/http');
const { shuffle } = require('../lib/random');
const logger = require('../lib/logger');

const API_BASE = 'https://opentdb.com';
const MIN_GAP_MS = 5_200; // the documented limit is 5s; leave a little headroom

const RESPONSE_CODES = {
  SUCCESS: 0,
  NO_RESULTS: 1,
  INVALID_PARAMETER: 2,
  TOKEN_NOT_FOUND: 3,
  TOKEN_EMPTY: 4,
  RATE_LIMITED: 5,
};

let sessionToken = null;
let lastRequestAt = 0;
let queue = Promise.resolve();

/** Raised when the API says we're going too fast, so the command can say so. */
class TriviaRateLimitError extends Error {
  constructor() {
    super('Open Trivia DB is rate-limiting us');
    this.name = 'TriviaRateLimitError';
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run a task after the API's minimum gap has elapsed, one at a time.
 * Two people using /trivia at once queue up instead of both getting code 5.
 */
function schedule(task) {
  const run = async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastRequestAt = Date.now();
    }
  };

  // then(run, run) so one caller's failure doesn't wedge the queue.
  queue = queue.then(run, run);
  return queue;
}

async function requestToken() {
  const data = await fetchJson(`${API_BASE}/api_token.php?command=request`);
  if (data.response_code !== RESPONSE_CODES.SUCCESS || !data.token) {
    throw new Error(`Could not get a session token (code ${data.response_code})`);
  }
  logger.debug('Open Trivia DB session token refreshed');
  return data.token;
}

/** Decode one url3986-encoded field. */
const decode = (value) => decodeURIComponent(value);

function buildUrl({ difficulty, category }) {
  const params = new URLSearchParams({ amount: '1', type: 'multiple', encode: 'url3986' });
  if (difficulty) params.set('difficulty', difficulty);
  if (category) params.set('category', String(category));
  if (sessionToken) params.set('token', sessionToken);
  return `${API_BASE}/api.php?${params}`;
}

/**
 * Fetch one multiple-choice question.
 *
 * @param {{ difficulty?: 'easy'|'medium'|'hard', category?: number }} [options]
 * @returns {Promise<{question: string, answers: string[], correctIndex: number,
 *                    category: string, difficulty: string}>}
 */
function fetchQuestion({ difficulty, category } = {}) {
  return schedule(async () => {
    // Two attempts: the second covers a stale or exhausted session token.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (!sessionToken) sessionToken = await requestToken().catch(() => null);

      const data = await fetchJson(buildUrl({ difficulty, category }));

      if (data.response_code === RESPONSE_CODES.SUCCESS && data.results?.length) {
        const result = data.results[0];
        const correct = decode(result.correct_answer);
        const answers = shuffle([correct, ...result.incorrect_answers.map(decode)]);

        return {
          question: decode(result.question),
          answers,
          correctIndex: answers.indexOf(correct),
          category: decode(result.category),
          difficulty: decode(result.difficulty),
        };
      }

      if (data.response_code === RESPONSE_CODES.RATE_LIMITED) throw new TriviaRateLimitError();

      if (
        data.response_code === RESPONSE_CODES.TOKEN_NOT_FOUND ||
        data.response_code === RESPONSE_CODES.TOKEN_EMPTY
      ) {
        // Stale or exhausted token — drop it and try once more with a new one.
        logger.debug(`Open Trivia DB token rejected (code ${data.response_code}); renewing`);
        sessionToken = null;
        if (attempt === 1) await sleep(MIN_GAP_MS);
        continue;
      }

      throw new Error(`Open Trivia DB returned response_code ${data.response_code}`);
    }

    throw new Error('Open Trivia DB had no question for us');
  });
}

module.exports = { fetchQuestion, TriviaRateLimitError };
