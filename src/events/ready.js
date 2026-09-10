'use strict';

/**
 * Fires once, after Kaito has logged in and received the full gateway ready payload.
 *
 * Note: in current discord.js v14 the event is `Events.ClientReady` ('clientReady').
 * The old 'ready' string is deprecated — always take the name from the enum.
 */

const { Events, ActivityType } = require('discord.js');
const logger = require('../lib/logger');

module.exports = {
  name: Events.ClientReady,
  once: true,

  /** @param {import('discord.js').Client} client */
  execute(client) {
    logger.info(`Kaito is online as ${client.user.tag}`);
    logger.info(`Serving ${client.guilds.cache.size} guild(s)`);

    client.user.setPresence({
      activities: [{ name: '/help', type: ActivityType.Listening }],
      status: 'online',
    });
  },
};
