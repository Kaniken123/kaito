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

1. Push this repo to GitHub.
2. **https://railway.app** → **New Project** → **Deploy from GitHub repo** → pick it.
3. Railway detects the `Dockerfile` and builds automatically.
4. **Variables** tab → add every value from your `.env`
   (`DISCORD_TOKEN`, `CLIENT_ID`, `LOG_CHANNEL_ID`, LLM and Reddit keys…).
   **Do not** set `GUILD_ID` in production — you want global commands there.
5. Register commands globally once, from your machine:
   `npm run deploy:commands:global`
6. Check **Deployments → Logs** for `Kaito is online as Kaito#1234`.

> Kaito is a worker, not a web server — it makes an outbound gateway connection
> and never listens on a port. If Railway asks you to expose one, don't.

## 8. ⚠️ The SQLite / ephemeral filesystem caveat

Railway, Render, and Fly containers have an **ephemeral filesystem**. The whole
container is rebuilt on every deploy, so **`data/kaito.db` is wiped each time** —
warnings, reminders, polls, and ragebait config all vanish. It works, then
silently resets, which is a miserable way to find out.

**Option A — attach a persistent volume (easiest).**
1. Railway project → your service → **Settings** → **Volumes** → **Add Volume**.
2. Mount path: `/app/data`.
3. Set `DATABASE_PATH=/app/data/kaito.db` in Variables.
4. Redeploy. The file now survives deploys.
   Caveat: a volume binds the service to one instance — fine for a Discord bot,
   which shouldn't run multiple copies anyway (you'd get duplicate replies).

**Option B — move to hosted Postgres (scales properly).**
1. Railway → **New** → **Database** → **PostgreSQL**; it injects `DATABASE_URL`.
2. Rewrite **only** `src/db/*.js` against `pg`. Every command file calls those
   modules and never touches SQL, so nothing outside `src/db/` changes.
3. The SQL is plain and portable; the main edits are `AUTOINCREMENT` →
   `GENERATED ALWAYS AS IDENTITY`, `?` placeholders → `$1`, and the
   synchronous better-sqlite3 calls becoming `await`ed queries.

Local development doesn't care — SQLite on disk is perfect there.
