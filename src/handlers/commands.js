'use strict';

/**
 * Kaito — dynamic command loader.
 *
 * Walks src/commands/** recursively and loads every .js file that exports
 * { data, execute }. Adding a command = dropping a file in a folder; there is
 * no central list to remember to update (and /help is generated from this, so
 * new commands document themselves).
 */

const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');

const logger = require('../lib/logger');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

/** Recursively collect every .js file path under a directory. */
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

/**
 * Load all commands into a Collection keyed by command name.
 *
 * At runtime a broken file is skipped so one bad command can't stop the bot
 * booting. Registration is the opposite: it PUTs the whole command set, so a
 * skipped file would silently DELETE that command from Discord. Hence `strict`.
 *
 * @param {{ strict?: boolean }} [options] — strict throws if any file failed.
 * @returns {Collection<string, object>}
 */
function loadCommands({ strict = false } = {}) {
  const commands = new Collection();
  const failures = [];

  for (const file of walk(COMMANDS_DIR)) {
    const relative = path.relative(COMMANDS_DIR, file);
    try {
      const command = require(file);

      // Shape check — a malformed file should be skipped loudly, not crash boot.
      if (!command?.data || typeof command.execute !== 'function') {
        failures.push(`${relative}: missing "data" or "execute" export`);
        logger.warn(`Skipping ${relative}: missing "data" or "execute" export`);
        continue;
      }

      // The folder a command lives in becomes its /help category.
      command.category = path.basename(path.dirname(file));
      commands.set(command.data.name, command);
      logger.debug(`Loaded command /${command.data.name} (${relative})`);
    } catch (error) {
      failures.push(`${relative}: ${error.message}`);
      logger.error(`Failed to load command ${relative}:`, error);
    }
  }

  if (failures.length > 0 && strict) {
    throw new Error(`Refusing to continue — ${failures.length} command file(s) failed to load:\n  • ${failures.join('\n  • ')}`);
  }

  logger.info(`Loaded ${commands.size} command(s)`);
  return commands;
}

/** The same commands serialised for Discord's registration API. */
function toApplicationCommands(commands) {
  return [...commands.values()].map((command) => command.data.toJSON());
}

module.exports = { loadCommands, toApplicationCommands };
