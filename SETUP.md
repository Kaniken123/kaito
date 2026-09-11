# Kaito — Setup Walkthrough

Every manual, click-by-click step. Do steps **1–4** now: that's all you need to
get Kaito online and answering `/ping`. Steps 5–6 unlock `/cursedfood` and
ragebait mode; step 7–8 are deployment.

---

## 1. Create the application and bot

1. Go to **https://discord.com/developers/applications**.
2. Click **New Application** (top right).
3. Name it **Kaito** → tick the terms box → **Create**.
4. In the left sidebar click **Bot**.
   - Under **Username**, set the bot's name to `Kaito` if it isn't already.
   - (Optional) Upload an avatar here.

## 2. Enable the privileged gateway intents

Still on the **Bot** page, scroll to **Privileged Gateway Intents** and turn ON:

| Intent | Why Kaito needs it |
| --- | --- |
| **Server Members Intent** | join/leave logging, `/userinfo`, member lookups |
| **Message Content Intent** | ragebait mode must read message text in its bound channel |

> Leave **Presence Intent** off — Kaito doesn't use it.

Click **Save Changes**. If you skip this, login fails with
`Used disallowed intents`.

## 3. Copy your token and client ID

1. **Bot** page → **Reset Token** → **Yes, do it!** → **Copy**.
   This is shown **once**. Paste it into `.env` as `DISCORD_TOKEN`.
   Treat it like a password — anyone with it controls your bot.
2. **General Information** page → copy the **Application ID**.
   Paste it into `.env` as `CLIENT_ID`.
3. In Discord itself, enable **User Settings → Advanced → Developer Mode**.
   You can now right-click any server or channel → **Copy Server ID** /
   **Copy Channel ID**, which is how you fill in `GUILD_ID` and `LOG_CHANNEL_ID`.

## 4. Invite Kaito to your server

1. Left sidebar → **Installation**.
2. Under **Installation Contexts**, make sure **Guild Install** is ticked.
3. Under **Default Install Settings → Guild Install**:
   - **Scopes:** `bot` and `applications.commands`
   - **Permissions:** tick the list below.
4. Copy the **Install Link** at the top of the page and open it, or just use this
   URL with your own `CLIENT_ID` substituted in:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=1374658096214&scope=bot%20applications.commands
```

**The minimum permissions Kaito actually uses** (`1374658096214`):

| Permission | Used by |
| --- | --- |
| View Channels | everything |
| Send Messages | everything |
| Send Messages in Threads | replying inside threads |
| Embed Links | `/userinfo`, `/poll`, `/meme`, `/cursedfood`, … |
| Attach Files | image-posting commands |
| Read Message History | `/purge`, ragebait context window |
| Add Reactions | fun commands |
| Manage Messages | `/purge` |
| Manage Channels | `/slowmode` |
| Kick Members | `/kick` |
| Ban Members | `/ban`, `/unban` |
| Moderate Members | `/timeout`, `/untimeout` |
| Manage Roles | `/role add|remove` |

> Deliberately **not** requested: Administrator. Never give a bot Administrator
> when a specific list works — a compromised token then can't nuke the server.

**Role hierarchy gotcha:** Discord won't let Kaito moderate anyone whose highest
role sits above Kaito's. After inviting, go to **Server Settings → Roles** and
drag the **Kaito** role near the top, above the members you want it to manage.

---

## 5. LLM API key — for ragebait mode

Kaito's ragebait persona is provider-swappable via env vars.

**Anthropic (default):**
1. Sign up at **https://console.anthropic.com**.
2. **API Keys** → **Create Key** → copy it.
3. In `.env`: `LLM_PROVIDER=anthropic`, `LLM_API_KEY=sk-ant-…`,
   `LLM_MODEL=claude-sonnet-4-5`.

**OpenAI:**
1. Key from **https://platform.openai.com/api-keys**.
2. In `.env`: `LLM_PROVIDER=openai`, `LLM_API_KEY=sk-…`, `LLM_MODEL=gpt-4o-mini`.

> Model names change — check the provider's current model list before pinning one.
> Leave `LLM_API_KEY` blank and ragebait mode simply stays off; nothing else breaks.

## 6. Reddit script app — for `/cursedfood`

Unauthenticated Reddit JSON gets rate-limited hard from cloud host IPs, so Kaito
uses proper app-only OAuth.

1. Log in to Reddit → **https://www.reddit.com/prefs/apps**.
2. Click **create another app…** at the bottom.
3. Fill in:
   - **name:** `kaito-cursedfood`
   - **type:** select **script**
   - **redirect uri:** `http://localhost:8080` (unused, but required)
4. Click **create app**.
5. Copy the values into `.env`:
   - The string **under the app name** (top-left, under "personal use script")
     → `REDDIT_CLIENT_ID`
   - The **secret** field → `REDDIT_CLIENT_SECRET`
   - `REDDIT_USER_AGENT=discord:kaito-cursedfood:v1.0 (by /u/your_reddit_username)`

> Leave these blank and `/cursedfood` falls back to a public proxy — fine locally,
> flaky when hosted.

---

## 7. Deploy to Railway

> **Use a separate bot for local development.** If `npm run dev` runs with the
> same token while Railway is live, two copies of Kaito share one identity: every
> command gets answered twice and one side fails with "interaction already
> acknowledged". Repeat steps 1–4 to create a **Kaito Dev** application, keep
> its token in your local `.env`, and give the real token only to Railway.

Deployment settings (Dockerfile builder, restart policy, shutdown grace period,
which file changes trigger a redeploy) live in [`railway.json`](railway.json),
so they're versioned with the code rather than clicked into the dashboard.

1. Push this repo to GitHub.
2. **https://railway.com** → sign up for the **Hobby** plan. Kaito runs 24/7, so
   trial credits run out, and trial volumes are capped at 0.5 GB.
3. **New Project** → **Deploy from GitHub repo** → pick `kaito`. Railway reads
   the `Dockerfile` and `railway.json` automatically. The first deploy may start
   right away and crash on missing variables; that's expected — finish the next
   steps and it redeploys.

   **`kaito` isn't in the list?** Railway's GitHub App can't see the repo.
   - Railway → avatar → **Account Settings**: the connected GitHub account must
     be the one that owns the repo.
   - **https://github.com/settings/installations** → **Railway** → **Configure**
     → **Repository access** → **All repositories**, or add `kaito` → **Save**.
     If Railway isn't listed there, install it via **Configure GitHub App** on
     Railway's "Deploy from GitHub repo" screen.
   - Back in Railway, reload the repo list.
4. **Attach the volume now**, before any real data exists — see step 8, option A.
5. Click the **kaito service** → **Variables** → **Raw Editor** → paste:
   ```
   DISCORD_TOKEN=your-production-token
   CLIENT_ID=your-production-client-id
   LOG_CHANNEL_ID=
   RAILWAY_RUN_UID=0
   ```
   - **Then apply the change.** Railway stages variable edits instead of
     applying them — click **Deploy** on the banner at the top of the canvas.
     Until you do, the bot keeps crashing with "missing required environment
     variables" even though the Variables tab shows the values.
   - Put them on the **service**, not under Project Settings → Shared Variables;
     shared variables don't reach a service unless you add them to it.
   - Exactly `KEY=value`, no spaces around `=`, in the **production** environment.
   - `RAILWAY_RUN_UID=0` is **required** with a volume. Railway mounts volumes
     owned by root, and the Dockerfile runs as the unprivileged `node` user, so
     without it SQLite can't write to `/app/data` and Kaito crashes on boot.
   - **Don't** set `GUILD_ID` — production registers commands globally.
   - **Don't** set `DATABASE_PATH` — the Dockerfile already points it at the volume.
   - Add the Reddit (step 6) and LLM (step 5) variables when you reach those features.
6. Service → **Settings** → **Networking**: leave it with **no public domain**,
   and don't set a healthcheck path. Kaito is a worker, not a web server — it
   makes an outbound gateway connection and never listens on a port, so an HTTP
   healthcheck would fail every deploy.
7. Register the slash commands globally, from your machine. Registration is just
   an API call to Discord — it doesn't need the database, so skip compiling
   better-sqlite3 (which needs a C++ toolchain on Windows):
   ```
   npm ci --ignore-scripts
   npm run deploy:commands:global
   ```
   This reads `DISCORD_TOKEN` and `CLIENT_ID` from your local `.env`, so they must
   be the **production** app's values, saved to disk.
   - Global commands take up to an hour to appear; in Discord, **Ctrl+R**
     reloads its cached command list. Re-run the second line only when a
     command's definition changes — not on every deploy.
   - ⚠️ With the production token in `.env`, **don't** `npm run dev` while
     Railway is running (double replies — see the note at the top of this step).
8. **Only if you ever registered guild commands with the *production* app**:
   clear them, or those commands show up twice in that server (once guild-scoped,
   once global). Commands registered by **Kaito Dev** belong to a different
   application and never clash — skip this step if you've only used the dev app.
   With the production values in `.env` and `GUILD_ID` set to that server:
   ```
   node deploy-commands.js --clear
   ```
   Then empty `GUILD_ID` again.
9. Check it's healthy:
   - **Deployments** → latest → **Deploy Logs** (not Build Logs) shows
     `Database ready at /app/data/kaito.db` followed by `Kaito is online as Kaito#1234`.
   - `/ping` answers in your server.
   - *Optional, needs the [Railway CLI](https://docs.railway.com/guides/cli)*
     (`npm i -g @railway/cli`, `railway login`, `railway link`):
     `railway ssh` → `ls -la /app/data` lists `kaito.db`. Click **Redeploy**,
     then check again: the file should still be there with the same timestamp.
   - The *old* deployment's logs end with `Received SIGTERM` and
     `Database connection closed` — graceful shutdown is working.

From here, every push to `main` that touches code redeploys automatically.
Docs-only pushes don't restart the bot (see `watchPatterns` in `railway.json`).

**If a deploy keeps restarting:** open its logs. A missing required variable
prints a clear message and exits; `railway.json` caps retries at 5 so it
doesn't loop forever.

## 8. ⚠️ The SQLite / ephemeral filesystem caveat

Railway, Render, and Fly containers have an **ephemeral filesystem**. The whole
container is rebuilt on every deploy, so **`data/kaito.db` is wiped each time** —
warnings, reminders, polls, and ragebait config all vanish. It works, then
silently resets, which is a miserable way to find out.

**Option A — attach a persistent volume (easiest, and the right fit for Kaito).**
1. In the project canvas, right-click the service → **Attach Volume**
   (or `Ctrl/Cmd + K` → "volume").
2. Mount path: `/app/data`.
3. Make sure `RAILWAY_RUN_UID=0` is set in Variables (step 7.5).
4. Redeploy. The file now survives deploys.
5. Service → **Backups** → turn on automated backups. A volume survives
   redeploys, not accidents.

Trade-offs of a volume, both fine for a Discord bot:
- **One instance only** — Railway doesn't allow replicas with a volume. You
  never want two copies of a bot anyway (duplicate replies).
- **A few seconds offline per deploy** — Railway stops the old deployment before
  starting the new one so two processes never write the same file.

**Option B — move to hosted Postgres (scales properly).**
1. Railway → **New** → **Database** → **PostgreSQL**; it injects `DATABASE_URL`.
2. Rewrite **only** `src/db/*.js` against `pg`. Every command file calls those
   modules and never touches SQL, so nothing outside `src/db/` changes.
3. The SQL is plain and portable; the main edits are `AUTOINCREMENT` →
   `GENERATED ALWAYS AS IDENTITY`, `?` placeholders → `$1`, and the
   synchronous better-sqlite3 calls becoming `await`ed queries.

Local development doesn't care — SQLite on disk is perfect there.
