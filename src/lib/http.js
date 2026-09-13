'use strict';

/**
 * Kaito — thin wrapper over global fetch for the public APIs we call.
 *
 * Node has fetch built in; this only adds the three things every call site
 * wants anyway:
 *   • a timeout — a hung API must never hold a Discord interaction open,
 *   • a User-Agent — Reddit rejects requests without one,
 *   • an error carrying the HTTP status, so callers can treat 429 (rate
 *     limited) differently from 404 (that subreddit has no images).
 */

const DEFAULT_TIMEOUT_MS = 8_000;

/** Sent on every outbound request unless a caller overrides it. */
const USER_AGENT = 'kaito-discord-bot/1.0 (+https://github.com/Kaniken123/kaito)';

class HttpError extends Error {
  constructor(status, statusText, url) {
    super(`HTTP ${status} ${statusText || ''} from ${url}`.trim());
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

/**
 * Fetch JSON, throwing HttpError on a non-2xx response.
 * @param {string} url
 * @param {object} [options] — standard fetch options plus `timeoutMs`.
 */
async function fetchJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, ...init } = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
    // AbortSignal.timeout rejects with a TimeoutError rather than hanging.
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) throw new HttpError(response.status, response.statusText, url);
  return response.json();
}

module.exports = { fetchJson, HttpError, USER_AGENT, DEFAULT_TIMEOUT_MS };
