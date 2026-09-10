'use strict';

/**
 * Kaito — slash command registration.
 *
 * Discord does not learn about your commands by you running the bot; you have
 * to PUT them to the API. Run this whenever you add, rename, or change a command.
 *
 *   npm run deploy:commands          → guild-scoped (instant, uses GUILD_ID)
 *   npm run deploy:commands:global   → global (all servers, ~1h to propagate)
 *   node deploy-commands.js --clear  → remove all commands from the target scope
 *
 * Guild-scoped is what you want while developing: changes show up immediately.
 * Global is for production. If GUILD_ID is unset, this falls back to global.
 */

const { REST, Routes } = require('discord.js');

const config = require('./src/lib/config');
const logger = require('./src/lib/logger');
const { loadCommands, toApplicationCommands } = require('./src/handlers/commands');

const args = process.argv.slice(2);
const clear = args.includes('--clear');
const global = args.includes('--global') || !config.guildId;

async function main() {
  const commands = clear ? [] : toApplicationCommands(loadCommands());

  const rest = new REST().setToken(config.token);
  const route = global
    ? Routes.applicationCommands(config.clientId)
    : Routes.applicationGuildCommands(config.clientId, config.guildId);

  const scope = global ? 'globally' : `to guild ${config.guildId}`;
  logger.info(`${clear ? 'Clearing commands' : `Registering ${commands.length} command(s)`} ${scope}…`);

  // PUT replaces the entire command set for this scope — commands you deleted
  // locally disappear from Discord too, which is exactly what you want.
  const result = await rest.put(route, { body: commands });

  logger.info(`Done. ${result.length} command(s) now registered ${scope}.`);
  if (global && !clear) {
    logger.warn('Global commands can take up to an hour to appear. Set GUILD_ID for instant updates while developing.');
  }
}

main().catch((error) => {
  logger.error('Command registration failed:', error);
  process.exit(1);
});
