'use strict';

/**
 * Kaito — dynamic event loader.
 *
 * Walks src/events/** and wires each file up to the client. Every event file
 * exports { name, once?, execute(...args) }, where `name` comes from the
 * discord.js `Events` enum rather than a raw string (the enum is the current
 * v14 source of truth — e.g. the ready event is now 'clientReady').
 */

const fs = require('node:fs');
const path = require('node:path');

const logger = require('../lib/logger');

const EVENTS_DIR = path.join(__dirname, '..', 'events');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

function loadEvents(client) {
  let count = 0;

  for (const file of walk(EVENTS_DIR)) {
    const relative = path.relative(EVENTS_DIR, file);
    try {
      const event = require(file);

      if (!event?.name || typeof event.execute !== 'function') {
        logger.warn(`Skipping event ${relative}: missing "name" or "execute" export`);
        continue;
      }

      // Any throw inside a listener would otherwise become an unhandled
      // rejection, so every handler is wrapped once here.
      const handler = async (...args) => {
        try {
          await event.execute(...args);
        } catch (error) {
          logger.error(`Error in "${event.name}" handler:`, error);
        }
      };

      if (event.once) client.once(event.name, handler);
      else client.on(event.name, handler);

      count += 1;
      logger.debug(`Loaded event ${event.name} (${relative})`);
    } catch (error) {
      logger.error(`Failed to load event ${relative}:`, error);
    }
  }

  logger.info(`Loaded ${count} event listener(s)`);
}

module.exports = { loadEvents };
