'use strict';

/**
 * /ping — the end-to-end smoke test.
 *
 * Reports two different latencies, which are genuinely different things:
 *   • Roundtrip — how long Kaito took to reply to *your* interaction.
 *   • Websocket — the gateway heartbeat ping between Kaito and Discord.
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription("Check that Kaito is alive and see how fast it's responding."),

  async execute(interaction) {
    // Reply first, then edit: the difference between the two timestamps is the
    // real roundtrip. Ephemeral so a health check doesn't clutter the channel.
    const sent = await interaction.reply({
      content: 'Pinging…',
      flags: MessageFlags.Ephemeral,
      withResponse: true,
    });

    // `resource` is nullable in the v14 typings, so fall back to "now" if absent.
    const repliedAt = sent.resource?.message?.createdTimestamp ?? Date.now();
    const roundtrip = repliedAt - interaction.createdTimestamp;
    const websocket = Math.round(interaction.client.ws.ping);

    await interaction.editReply(
      [
        '**Pong!**',
        `> Roundtrip: \`${roundtrip}ms\``,
        `> Websocket: \`${websocket < 0 ? 'measuring…' : `${websocket}ms`}\``,
      ].join('\n'),
    );
  },
};
