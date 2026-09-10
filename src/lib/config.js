'use strict';

/**
 * Kaito — configuration.
 *
 * Loads .env, validates the variables Kaito genuinely cannot start without,
 * and exits with a readable message if any are missing. Optional features
 * (Reddit, LLM, logging channel) degrade gracefully instead of blocking boot,
 * so you can run the bot before you've signed up for every third-party API.
 */

require('dotenv').config({ quiet: true });

const path = require('node:path');

/** Treat empty strings the same as "not set" — a blank line in .env is not a value. */
function env(name, fallback = undefined) {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

// ── Hard requirements ──────────────────────────────────────────────────────
const REQUIRED = {
  DISCORD_TOKEN: 'Bot token — Developer Portal → your app → Bot → Reset Token',
  CLIENT_ID: 'Application ID — Developer Portal → your app → General Information',
};

const missing = Object.keys(REQUIRED).filter((key) => env(key) === undefined);

if (missing.length > 0) {
  console.error('\n Kaito cannot start — missing required environment variables:\n');
  for (const key of missing) console.error(`   • ${key}  →  ${REQUIRED[key]}`);
  console.error('\n  Copy .env.example to .env and fill these in, then try again.');
  console.error('  Full walkthrough: see SETUP.md\n');
  process.exit(1);
}

const config = {
  // ── Discord ──
  token: env('DISCORD_TOKEN'),
  clientId: env('CLIENT_ID'),
  guildId: env('GUILD_ID'), // optional: instant command registration while developing
  logChannelId: env('LOG_CHANNEL_ID'), // optional: join/leave + mod action log

  // ── Storage ──
  databasePath: path.resolve(env('DATABASE_PATH', './data/kaito.db')),

  // ── Reddit (/cursedfood) ──
  reddit: {
    clientId: env('REDDIT_CLIENT_ID'),
    clientSecret: env('REDDIT_CLIENT_SECRET'),
    userAgent: env('REDDIT_USER_AGENT', 'discord:kaito-cursedfood:v1.0 (by /u/unknown)'),
    // Only when all three are present do we use the authenticated path.
    get enabled() {
      return Boolean(this.clientId && this.clientSecret);
    },
  },
  cursedFoodChannelId: env('CURSED_FOOD_CHANNEL_ID'), // optional: scheduled daily post

  // ── LLM (ragebait mode) ──
  llm: {
    provider: (env('LLM_PROVIDER', 'anthropic') || '').toLowerCase(),
    apiKey: env('LLM_API_KEY'),
    model: env('LLM_MODEL', 'claude-sonnet-4-5'),
    dailyCap: Number.parseInt(env('RAGEBAIT_DAILY_CAP', '200'), 10),
    get enabled() {
      return Boolean(this.apiKey);
    },
  },

  logLevel: env('LOG_LEVEL', 'info'),
};

module.exports = config;
