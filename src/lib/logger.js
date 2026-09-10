'use strict';

/**
 * Kaito — tiny structured logger.
 *
 * Deliberately dependency-free: timestamped, levelled, single-line output that
 * plays nicely with Railway/Docker log viewers (they just capture stdout).
 * Swap the internals for `pino` later and the call sites don't change.
 */

const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 };

// Anything below LOG_LEVEL is dropped. Default: info.
const threshold = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

// ANSI colours, but only when we're attached to a real terminal.
const useColour = process.stdout.isTTY;
const COLOURS = {
  trace: '\x1b[90m', // grey
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';

function format(level, args) {
  const timestamp = new Date().toISOString();
  const tag = level.toUpperCase().padEnd(5);
  const label = useColour ? `${COLOURS[level]}${tag}${RESET}` : tag;
  return [`${timestamp} ${label}`, ...args];
}

function log(level, ...args) {
  if (LEVELS[level] < threshold) return;
  // warn/error go to stderr so hosting platforms flag them correctly.
  const sink = LEVELS[level] >= LEVELS.warn ? console.error : console.log;
  sink(...format(level, args));
}

const logger = {
  trace: (...args) => log('trace', ...args),
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};

module.exports = logger;
