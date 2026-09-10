'use strict';

/**
 * Kaito — entry point.
 *
 * Creates the client, loads commands + events, opens the database, and logs in.
 * Also owns process-level safety: crash handlers and a graceful shutdown.
 */

const { Client, GatewayIntentBits, Partials } = require('discord.js');

const config = require('./lib/config');
const logger = require('./lib/logger');
const database = require('./db');
const { loadCommands } = require('./handlers/commands');
const { loadEvents } = require('./handlers/events');

/**
 * Intents declare which events Discord will send us. Ask for the minimum:
 *   Guilds          — servers, channels, roles (required for slash commands)
 *   GuildMembers    — join/leave events            [PRIVILEGED — enable in the portal]
 *   GuildMessages   — message events in servers
 *   MessageContent  — the actual text of messages  [PRIVILEGED — enable in the portal]
 *
 * The two privileged ones must be toggled on under Bot → Privileged Gateway
 * Intents or login fails with a "disallowed intents" error. See SETUP.md.
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  // Lets Kaito act on uncached messages (e.g. an older message being deleted).
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

// discord.js has no built-in command registry — attaching our own Collection to
// the client is the conventional pattern, so any handler can reach it.
client.commands = loadCommands();
loadEvents(client);

// ── Process-level safety net ───────────────────────────────────────────────
// Log and keep running: one bad interaction should never take the bot offline.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal} — shutting down…`);
  try {
    await client.destroy(); // close the gateway connection first
  } catch (error) {
    logger.error('Error while destroying client:', error);
  }
  database.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Go ─────────────────────────────────────────────────────────────────────
client.login(config.token).catch(async (error) => {
  logger.error('Login failed — check DISCORD_TOKEN and your privileged intents.');
  logger.error(error);

  // Tear down cleanly rather than process.exit()-ing mid-connect, which races
  // the gateway teardown and produces a confusing native assertion on Windows.
  await client.destroy().catch(() => {});
  database.close();
  process.exitCode = 1;
});
