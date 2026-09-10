# Kaito

A general-purpose Discord bot: moderation, utility commands, games, and a
channel-bound AI persona. Built on **discord.js v14** with **slash commands only**,
**better-sqlite3** for persistence, and a Dockerfile so it runs anywhere.

> **First time setting up a Discord bot?** Read [SETUP.md](SETUP.md) — it covers
> every click in the Developer Portal, the invite URL, and deployment.

---

## Requirements

- **Node.js 20+** (developed on 24 LTS)
- A Discord application + bot token → [SETUP.md](SETUP.md) steps 1–4
- *Optional:* an LLM API key (ragebait mode) and Reddit credentials (`/cursedfood`)

## Quick start

```bash
git clone <your-repo-url> kaito
cd kaito
npm install

cp .env.example .env      # then fill in DISCORD_TOKEN, CLIENT_ID, GUILD_ID

npm run deploy:commands   # tell Discord about the slash commands
npm run dev               # start Kaito with auto-restart on file changes
```

Then type `/ping` in your server. If Kaito replies, everything is wired up.

## npm scripts

| Script | What it does |
| --- | --- |
| `npm start` | Run Kaito (production) |
| `npm run dev` | Run with `node --watch` — restarts on file save |
| `npm run deploy:commands` | Register commands to `GUILD_ID` — **instant**, use while developing |
| `npm run deploy:commands:global` | Register globally — all servers, up to ~1h to propagate |
| `node deploy-commands.js --clear` | Remove all commands from the current scope |

**You must re-run `deploy:commands` whenever you add or change a command's
name, description, or options.** Restarting the bot alone is not enough — Discord
stores the command definitions on its side. Editing only the *body* of `execute()`
needs just a restart.

## Commands

| Command | What it does |
| --- | --- |
| `/ping` | Check Kaito is alive; shows roundtrip and websocket latency |

*(More land as each feature stage is built — `/help` generates this list live
from the loaded commands, so it never goes stale.)*

## Project layout

```
src/
├─ commands/          # one file per command, auto-loaded recursively
│  ├─ moderation/     # the folder name becomes the /help category
│  ├─ utility/
│  └─ fun/
├─ events/            # one file per gateway event, auto-loaded
├─ db/                # ALL SQL lives here — swap SQLite for Postgres without
│                     # touching a single command file
├─ services/          # third-party integrations (LLM, Reddit)
├─ handlers/          # the command + event auto-loaders
├─ lib/               # logger, env config + validation
└─ index.js           # entry point: client, intents, shutdown
deploy-commands.js    # slash command registration script
```

### How it fits together

- **Adding a command** = create `src/commands/<category>/<name>.js` exporting
  `{ data, execute }`, then run `npm run deploy:commands`. No registry to update.
- **Adding an event** = create `src/events/<name>.js` exporting
  `{ name, once?, execute }`, using the `Events` enum for the name.
- **Buttons and select menus** route by custom ID: the first colon-separated
  segment is the owning command's name (`poll:vote:2` → `/poll`), which is
  dispatched to that command's `handleComponent()`. A feature's interactive bits
  stay in the same file as the command.
- **Errors** are contained at three levels: each `execute()` is wrapped by the
  interaction router, each event listener is wrapped by the event loader, and
  `unhandledRejection` / `uncaughtException` catch the rest. One bad interaction
  never takes Kaito offline.

## Configuration

Every variable is documented in [.env.example](.env.example). Only
`DISCORD_TOKEN` and `CLIENT_ID` are required — Kaito validates them on startup
and exits with a readable message if they're missing. Optional integrations
(Reddit, LLM, log channel) just stay switched off rather than blocking boot.

## Deployment

`docker build -t kaito . && docker run --env-file .env kaito`, or push to Railway
and set the variables in its dashboard — [SETUP.md](SETUP.md) step 7.

⚠️ **Read [SETUP.md](SETUP.md) step 8 before deploying.** Hosted containers have
an ephemeral filesystem and will silently wipe the SQLite database on every
redeploy unless you attach a volume.
