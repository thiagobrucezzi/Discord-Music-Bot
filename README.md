# 🎵 Discord Music Bot

Complete music bot for Discord using **Kazagumo**, **Shoukaku** and **Lavalink**.

## ✨ Features

- ✅ Music playback from YouTube (single tracks, search queries, and full playlists)
- ✅ Queue system with shuffle
- ✅ Full playback control (play, pause, resume, stop, skip, queue)
- ✅ Volume adjustment (0–100%)
- ✅ Queue visualization, `/nowplaying` with progress bar, `/seek`, `/remove`, `/clear`, `/loop` (none/track/queue)
- ✅ **In-channel control buttons** — every "Now playing" message ships with prev / pause / skip / stop / shuffle / loop / queue buttons (pause and loop re-render their icon/label live)
- ✅ **Queue persistence + smart `/resume`** — the queue, current track and playback position are persisted to disk every 30s; if the bot is restarted, `/resume` reconnects to your voice channel, recreates the player and seeks back to where it was (state expires after 7 days)
- ✅ **24/7 mode** — `/247 on` keeps the bot in voice even with an empty queue or empty channel
- ✅ **Smart autoplay (YouTube Mix)** — when the queue ends, builds a YouTube Mix from the current track for context-aware recommendations, with an artist-name fallback if no mix is available
- ✅ **`/status` command** — Discord WS ping, every Lavalink node's state/ping/players, uptime, RSS/heap memory, Node.js version, and the active node for the current guild
- ✅ **Multi-node Lavalink failover** — auto-discovers public v4 nodes from a public API plus hardcoded fallbacks, and `/play` retries across every connected node until one accepts the player
- ✅ **Parallel multi-node search** — every `/play` query hits every connected node in parallel (with a 12s per-node timeout); the first node to return results wins, so a single slow/broken node can't make you wait 2+ minutes. SoundCloud (`scsearch:`) is tried as a last resort if every YouTube node comes back empty
- ✅ **Flapping-node detector** — nodes that disconnect 3 times within 5s (or proxy-close) are removed from the pool to prevent reconnect storms / 429 rate limits
- ✅ **Stale-session recovery** — if a Lavalink node returns `404` on `/v4/sessions/.../players` (its session ID expired after a restart), the bot skips that node for the retry, force-recycles its WebSocket so it gets a fresh session for next time, and falls back to a clean player on another node. Failed destroys are also force-cleaned from the in-memory map so a DNS blip can't leave a zombie player around
- ✅ **Auto-disconnect** — leaves the channel after 1 hour if the queue is empty or no humans remain in the voice channel (skipped while 24/7 mode is on)
- ✅ **Manual-disconnect cleanup** — if someone kicks the bot from the voice channel, the player is destroyed cleanly
- ✅ Modern slash commands

---

## 🚀 Deployment Options

The bot runs the **same code** everywhere — pick the hosting that fits you. The real
difference is **where Lavalink (the audio engine) lives** and how reliable YouTube
playback is:

| Option | Best for | Lavalink (audio) | YouTube reliability | Updates |
|---|---|---|---|---|
| **Local** (Step 7) | development & testing | public nodes (or your own jar) | depends on the node | manual `npm start` |
| **Wispbyte** (Step 8) | free, zero-DevOps hosting | public nodes | flaky (shared public nodes) | `git push` auto-deploy |
| **Oracle Cloud — full self-host** (Step 9) | reliability & control, still **$0** | **your own node** + public fallback | **high** (own node + OAuth) | `push` → image → auto-deploy |

### Why this matters

- **Lavalink** is the engine that actually fetches and streams the audio. The bot is just
  the Discord "brain" that talks to it over the network.
- **Public Lavalink nodes** are free and need zero setup, but they're shared and get
  blocked/rate-limited by YouTube constantly — the #1 cause of *"the bot joins but there's
  no sound"* and random outages.
- **Running your own Lavalink** (Step 9) removes that dependency. The catch: from a
  **datacenter IP** (any cloud VM), YouTube demands a logged-in session, so you do a
  one-time **OAuth** login with a **throwaway Google account**. The payoff is a bot that's
  reliable, fully yours, and **free** on Oracle Cloud's Always Free tier.

> 🧭 **New here?** Start with **Local** (Step 7) to confirm your bot token works, then
> deploy to **Wispbyte** (easiest) or **Oracle** (most reliable, recommended).

---

## 📋 Requirements

- **Node.js** 18.0.0 or higher
- **npm** 7.0.0 or higher
- A **Discord bot** created
- A **Lavalink v4** server — the bot auto-discovers free public nodes, so no manual setup is needed (or run **your own** for reliability — see Step 9)
- **(Optional, for Step 9)** A host with **Docker** + Docker Compose. Oracle Cloud's **Always Free** tier is a great free home for it.

---

## 📥 Step 1: Clone/Download the Project

### Option A: With Git

```bash
git clone <your-repository>
cd Bot-Music-Discord
```

### Option B: Download ZIP

1. Download the project as ZIP
2. Extract the folder
3. Open a terminal in the extracted folder

---

## 🤖 Step 2: Create the Bot on Discord

### 2.1 Create the Application

1. Go to: https://discord.com/developers/applications
2. Click **"New Application"**
3. Give your bot a name (e.g., "My Music Bot")
4. Click **"Create"**

### 2.2 Configure the Bot

1. In the side menu, go to **"Bot"**
2. Click **"Add Bot"** and confirm
3. **Enable these options:**
   - ✅ **Message Content Intent** (if available)
   - ✅ **Server Members Intent** (if available)
   - ✅ **Presence Intent** (optional)

### 2.3 Get the Token

1. In the **"Token"** section, click **"Reset Token"** or **"Copy"**
2. **⚠️ IMPORTANT:** Save this token in a safe place (you'll need it later)
3. **NEVER** share this token publicly

### 2.4 Get the Application ID

1. Go to the **"General Information"** section
2. Copy the **Application ID** (you'll also need this later)

---

## ➕ Step 3: Add the Bot to the Server

### 3.1 Generate Invitation Link

1. In the side menu, go to **"OAuth2" → "URL Generator"**
2. In **"Scopes"**, select:
   - ✅ `bot`
   - ✅ `applications.commands`
3. In **"Bot Permissions"**, select:
   - ✅ **Connect** (connect to voice channels)
   - ✅ **Speak** (speak in voice channels)
   - ✅ **Use Voice Activity** (use voice activity)
   - ✅ **Send Messages** (send messages)
   - ✅ **Use Slash Commands** (use slash commands)
4. Copy the **generated URL** at the bottom of the page

### 3.2 Invite the Bot

1. Open the copied URL in your browser
2. Select the server where you want to add the bot
3. Click **"Authorize"**
4. Complete the CAPTCHA if it appears

### 3.3 Get the Server ID (Optional, but Recommended)

1. In Discord, enable **Developer Mode:**
   - Go to: **User Settings → Advanced → Developer Mode**
2. Right-click on your server → **"Copy ID"**
3. Save this ID (you'll use it for instant commands)

---

## 📦 Step 4: Install Dependencies

1. Open a terminal in the project folder
2. Run:

```bash
npm install
```

This will install all necessary dependencies.

---

## ⚙️ Step 5: Configure Environment Variables

### 5.1 Create the `.env` file

Copy `.env.example` to `.env` and fill in your values:

```bash
# macOS / Linux / Git Bash
cp .env.example .env

# Windows CMD
copy .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

```env
# Discord bot token (REQUIRED)
DISCORD_TOKEN=your_token_here

# Bot Application ID (OPTIONAL — auto-fetched from Discord API if omitted)
DISCORD_CLIENT_ID=your_application_id

# Server ID for instant slash-command registration (OPTIONAL)
# If omitted, commands register globally (can take up to 1 hour to appear)
GUILD_ID=your_server_id

# Primary Lavalink node (REQUIRED)
# The bot auto-discovers additional public nodes for redundancy.
LAVALINK_URL=lavalink-v4.triniumhost.com:443
LAVALINK_PASSWORD=free
LAVALINK_SECURE=true
```

### 5.2 Fill in the Values

- **`DISCORD_TOKEN`:** The token you copied in Step 2.3 (REQUIRED)
- **`DISCORD_CLIENT_ID`:** The Application ID you copied in Step 2.4. **Optional** — if omitted, `npm run deploy` fetches it from the Discord API using your token.
- **`GUILD_ID`:** Your server ID (Step 3.3). **Optional** — if set, slash commands appear on that server within 1-2 minutes. If omitted, they register globally and may take up to 1 hour.
- **`LAVALINK_URL` / `LAVALINK_PASSWORD` / `LAVALINK_SECURE`:** Your primary Lavalink node. The bot will automatically connect to additional public nodes for redundancy — so even if the primary is down, music keeps playing.

> **Which Lavalink values to use, per deployment:**
> - **Local / Wispbyte:** point to a public v4 SSL node, e.g. `LAVALINK_URL=lavalink-v4.triniumhost.com:443`, `LAVALINK_PASSWORD=free`, `LAVALINK_SECURE=true`.
> - **Oracle / Docker (Step 9):** point to your own node on the internal Docker network — `LAVALINK_URL=lavalink:2333`, `LAVALINK_PASSWORD=<your strong password>`, `LAVALINK_SECURE=false`.
>
> Either way the bot still auto-discovers public nodes as fallback.

---

## 🎵 Step 6: Configure Lavalink

The bot uses **automatic multi-node failover** — it connects to multiple Lavalink v4 servers at startup. You only need to configure one primary node in `.env`; the rest are discovered automatically from a public API.

### Automatic Node Discovery

On every startup the bot:
1. Fetches available Lavalink v4 SSL nodes from `lavalink-list.ajieblogs.eu.org`
2. Connects to all discovered nodes simultaneously
3. Uses the healthiest node for each request
4. If a node goes down mid-playback, Shoukaku moves the player to another node automatically

You will see something like this in the logs:

```
🔍 Fetching Lavalink nodes from public API...
📡 API returned 4 v4 SSL nodes
🎵 Lavalink nodes ready (5 total):
   1. lavalink-v4.triniumhost.com:443  [primary]
   2. lavalinkv4.serenetia.com:443  [lavalinkv4-serenetia-com-443]
   ...
✅ Lavalink primary: Connected!
✅ Lavalink lavalinkv4-serenetia-com-443: Connected!
```

### Using a Free Public Node (Default)

The `.env.example` already contains a working free node (`lavalink-v4.triniumhost.com`). You can use it as-is, or swap it for any other public Lavalink v4 node.

### Option: Local Lavalink (Advanced)

If you want to run your own Lavalink server:

1. **Download Lavalink:**
   - Go to: https://github.com/lavalink-devs/Lavalink/releases
   - Download `Lavalink.jar`

2. **Create `application.yml`:**
   ```yaml
   server:
     port: 2333
     address: 0.0.0.0

   # Use the youtube-source plugin — the built-in YouTube source is deprecated.
   plugins:
     youtube:
       enabled: true

   lavalink:
     plugins:
       - dependency: "dev.lavalink.youtube:youtube-plugin:1.18.1"
         repository: "https://maven.lavalink.dev/releases"
     server:
       password: "youshallnotpass"
       sources:
         youtube: false   # disabled built-in; the plugin handles YouTube
         soundcloud: true
   ```

3. **Run Lavalink:**
   ```bash
   java -jar Lavalink.jar
   ```

4. **Update `.env`:**
   ```env
   LAVALINK_URL=localhost:2333
   LAVALINK_PASSWORD=youshallnotpass
   LAVALINK_SECURE=false
   ```

> ⚠️ **Running on a cloud VM / VPS?** YouTube blocks audio streaming from datacenter IPs
> (*"This video requires login"*) — a `poToken` alone is **not** enough. You'll need the
> `youtube-source` **OAuth** setup with a throwaway Google account. See **Step 9** for the
> complete, production-ready version (Docker + your own Lavalink + OAuth + CI/CD). On a
> home/residential connection, the config above usually works without OAuth.

---

## 🧠 How it Works (Internals)

This section documents the runtime behavior so you can understand the logs and tune things if needed.

### Multi-node failover

- On startup, the bot fetches Lavalink v4 SSL nodes from `lavalink-list.ajieblogs.eu.org`.
- It also keeps a small list of **hardcoded fallback nodes** (`triniumhost`, `serenetia`) used if the API is unreachable.
- The primary node from `.env`, the API nodes and the fallbacks are merged, deduplicated by URL, and all are connected at once.
- When you run `/play`, the bot iterates through **every connected node** until one accepts the player creation. Stale players/connections are cleaned up between attempts.

### Flapping-node detector

Some public nodes "connect → close → reconnect" in a tight loop (often `proxy-close: lavalink-error`), which resets Shoukaku's retry counter and quickly triggers `429 Too Many Requests` from the host. To prevent this:

- A node that closes within **5 seconds** of becoming `ready` (or with a `proxy-close` reason) counts as a "flap".
- After **3 flaps**, the node is removed from the pool for the rest of the session.
- A `429` error on a node forces it to be removed on the next close.

You'll see logs like `Flap detected on serenetia-v4 (2/3, 1240ms after ready)` and eventually `🚫 Node X removed from pool after 3 flaps`.

### Parallel multi-node search

When you run `/play`, the bot doesn't search nodes one by one — it fans out a search to **every connected node in parallel** and takes the first one to return non-empty tracks. This matters because the public Lavalink YouTube plugin gets blocked by YouTube's anti-bot intermittently, and a "blocked" node doesn't error; it just returns 0 tracks (sometimes after a 2+ minute delay).

- Each per-node search has a hard **12-second timeout** so a fully hung node drops out of the race instead of stalling the request.
- The race is `Promise.any`-style: empty / timeout / error all count as "this node loses", first node with tracks wins.
- If every YouTube node comes back empty, the bot tries **SoundCloud** (`scsearch:<query>`) on the player's node as a last resort — most public Lavalink v4 hosts ship lavaplayer's SoundCloud source.
- Result: in practice, a healthy node responds in ~1 second, so even when the primary is wedged you see results in ~1s instead of waiting for the primary's timeout.

The autoplay engine uses the same parallel-race logic for its YouTube Mix lookup and artist-name fallback, so a stuck node doesn't dry up autoplay either.

### Stale-session recovery

If a Lavalink node restarts (or its `sessionId` otherwise expires on the server side), the next REST call against it returns `404` on a path like `/v4/sessions/<id>/players`. When `/play` detects this:

1. The offending node is **added to a per-attempt skip-list** so the retry picks a different node.
2. The dead WebSocket is **force-recycled** (`node.disconnect(1000, 'session-stale-recycle')`) — Shoukaku reconnects it and Lavalink hands it a fresh session ID for future requests. `moveOnDisconnect:true` migrates any players hosted on it during the swap.
3. The current player is wiped via `forceCleanupPlayer()` (see below) and the retry creates a fresh player on a healthy node.

#### `forceCleanupPlayer`: the zombie-killer

`KazagumoPlayer.destroy()` sets the player's state to `DESTROYING` **before** awaiting its REST calls. If the REST call throws (e.g. DNS `EAI_AGAIN` during a node hostname blip), the final `players.delete()` never runs and the player is stuck in `DESTROYING` forever — the next `/play` finds the zombie, can't destroy it again ("Player is already destroyed"), and every search after that fails because `kazagumo.search()` internally fans out `getPlayers()` to every connected node and one stale session 404s the whole `Promise.all`.

To prevent this, `index.js` exposes `kazagumo._forceCleanupPlayer(guildId)` which **always** deletes the player + voice connection from the maps, even when destroy fails partway. It's wired into:

- `scheduleDisconnect`'s 1-hour idle cleanup (the original trigger of the cascade)
- `/play`'s "bot was kicked but player still exists" branch
- The stale-session retry path

`/play` also uses `player.search()` (which pins to a specific node) instead of the bare `kazagumo.search()` (which fans out across nodes), so a single stale session can never poison searches via the `getLeastUsedNode` path.

### Smart autoplay

When the queue ends and `/autoplay on` is active:

1. If the current track has a YouTube ID, the bot loads the corresponding **YouTube Mix** (`youtube.com/watch?v=ID&list=RDID`) — YouTube's "Radio based on" playlist — and uses those tracks as candidates.
2. If the track is not from YouTube, or the Mix returns nothing, the bot falls back to extracting the **artist name** from the title (text before `-` or `|`) and searching for it.
3. Candidates are filtered to exclude:
   - Same URI / same title as the current track
   - Anything in the player's **last-10 autoplay history** (deduplicates by URI and by significant word overlap)
   - Non-music keywords (`tutorial`, `how to`, `radio concierto`, `live radio`, etc.)
4. The first valid related track is added and played, and `_autoplayContext` is updated so the next round chains naturally.
5. Manually adding a song with `/play` while autoplay is on **updates the autoplay context** to that new track, so future related searches branch from your latest pick.

### Player buttons

Every "Now playing" message ships with two rows of buttons that target the active player in the same guild:

| Button | Action |
|---|---|
| ⏮️ Prev | Re-queue the previous track from the in-memory history (last 25) and skip back to it |
| ⏯️ Pause / Resume | Toggle pause; the icon re-renders to reflect the live state |
| ⏭️ Skip | Skip to the next track |
| ⏹️ Stop | Stop, clear the queue, delete the persisted state file, and disconnect |
| 🔀 Shuffle | Shuffle the upcoming queue |
| 🔁 Loop | Cycle `none → track → queue`; the label updates to the current mode |
| 📋 Queue | Show the current track + the next 10 upcoming |

Buttons require you to be in the same voice channel as the bot. They never expire — Discord keeps them live as long as the message exists.

### Queue persistence and `/resume`

- Every 30 seconds, and on key state changes, the bot writes each active player's state (current track, queue, position, volume, voice channel, autoplay/loop/24-7 flags) to `state/<guildId>.json`.
- When you run `/resume`:
  - If a player exists and is paused, it unpauses.
  - If no player exists but a state file is present, the bot reconnects to your current voice channel, recreates the player, restores the current track, seeks to the saved position (when > 5s) and re-enqueues the rest of the queue in the background.
- `/stop` and the ⏹️ Stop button delete the state file. The state file is also auto-deleted after **7 days** of staleness on startup.

### 24/7 mode

`/247 on` sets a per-player flag that makes both auto-disconnect timers (empty-queue and empty-channel) skip that player. `/247 off` re-enables them. The flag is persisted with the rest of the state.

### Auto-disconnect timers

Two independent 1-hour timers keep the bot from idling forever:

| Trigger | Behavior |
|---------|----------|
| Queue empty + autoplay disabled (or autoplay found nothing) | Disconnect after **1 hour** of inactivity |
| All humans leave the bot's voice channel | Disconnect after **1 hour**. Cancelled if anyone rejoins. |

If someone manually disconnects the bot from the voice channel, the player is destroyed cleanly after a 3s grace period (to avoid races during initial connection).

---

## 🧪 Step 7: Test Locally

**⚠️ IMPORTANT:** Test that everything works locally before hosting on Wispbyte.

### 7.1 Verify Configuration

Run the verification script:

```bash
npm run setup
```

This script will verify:
- ✅ Node.js version
- ✅ Dependencies installed
- ✅ Environment variables configured
- ✅ Necessary files present

### 7.2 Register Commands

Register the slash commands on Discord:

```bash
npm run deploy
```

**Important Notes:** 
- You can run this command **locally** (before hosting) or **from Wispbyte console** (after hosting)
- If you specified `GUILD_ID` in `.env`, commands will appear **immediately** (1-2 minutes)
- If not, global commands can take **up to 1 hour** to appear
- The script will automatically fallback to global registration if server registration fails (e.g., missing permissions)

### 7.3 Start the Bot

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

### 7.4 Verify it Works

You should see in the console:

```
🔍 Fetching Lavalink nodes from public API...
📡 API returned X v4 SSL nodes
🎵 Lavalink nodes ready (X total):
   1. lavalink-v4.triniumhost.com:443  [primary]
   ...
🤖 Bot connected as YourBot#1234!
📊 Servers: X
✅ Lavalink primary: Connected!
✅ Client fully ready!
```

### 7.5 Test on Discord

1. **Join a voice channel** in your server
2. Type `/play` followed by a song name
3. The bot will automatically connect and start playing

**If everything works correctly, you're ready to host on Wispbyte!** ✅

---

## 🌐 Step 8: Host on Wispbyte

Once you've tested that everything works locally, you can host it on [Wispbyte](https://wispbyte.com/client).

### 8.1 Prerequisites

Make sure you have:
- ✅ Bot working locally
- ✅ Wispbyte account

**Note:** You can register commands either:
- **Before hosting:** Run `npm run deploy` locally
- **After hosting:** Run `npm run deploy` from Wispbyte's console/terminal

### 8.2 Upload Project to Wispbyte

You have **2 options** to upload your bot:

#### Option A: Upload Complete Folder (Faster) ⚡

1. **Prepare the files:**
   - Compress your project into a ZIP
   - **Include:** All files EXCEPT `node_modules` (installs automatically)
   - **Include:** The `.env` file (required for Wispbyte)

2. **Upload to Wispbyte:**
   - Go to Wispbyte panel
   - Use **File Manager** or **Upload Files**
   - Upload the ZIP and extract it
   - Or upload files individually

3. **Advantages:**
   - ✅ Faster to get started
   - ✅ You don't need Git
   - ✅ Direct file control

4. **Disadvantages:**
   - ❌ To update, you must upload files manually
   - ❌ No version control

#### Option B: Connect with GitHub (Recommended for Production) 🔗

1. **Create a GitHub repository:**
   - Go to: https://github.com/new
   - Create a repository (public or private)
   - **DO NOT** initialize with README

2. **Upload your code to GitHub:**

   **If you have Git installed:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Discord Music Bot"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
   git push -u origin main
   ```
   
   **⚠️ IMPORTANT:** Verify that `.env` is in `.gitignore` before doing `git add .`
   
   **If you DON'T have Git:**
   - Use GitHub Desktop: https://desktop.github.com/
   - Or upload files manually from GitHub web

3. **Connect Wispbyte with GitHub:**
   - In Wispbyte, look for: **"Git"** or **"Repository"** or **"Source Control"**
   - Paste the URL: `https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git`
   - Branch: `main`
   - Enable **Auto Deploy** ✅

4. **Upload `.env` manually:**
   - The `.env` is NOT on GitHub (for security)
   - You must upload it manually to Wispbyte using File Manager

5. **Advantages:**
   - ✅ Version control
   - ✅ Auto-deploy when you do `git push`
   - ✅ Easy to update
   - ✅ Change history

6. **Disadvantages:**
   - ❌ Requires Git/GitHub
   - ❌ More complex initial setup

### 8.3 Configure Environment Variables

**Note:** Wispbyte doesn't have an Environment Variables section, so you must upload the `.env` file directly.

1. **Make sure your `.env` has all variables:**

```env
DISCORD_TOKEN=your_token_here
LAVALINK_URL=lavalinkv4.serenetia.com:443
LAVALINK_PASSWORD=your_password
LAVALINK_SECURE=true
# Optional - Client ID is obtained automatically if not provided
DISCORD_CLIENT_ID=your_application_id

# Optional - If not provided, commands will be registered globally
GUILD_ID=your_server_id
```

2. **Upload the `.env` along with other files** to Wispbyte

**⚠️ IMPORTANT:** 
- The `.env` is in `.gitignore` so it **does NOT upload to GitHub** (for security)
- But you **MUST upload it to Wispbyte** manually
- **NEVER** share your `.env` publicly

### 8.4 Service Configuration

In Wispbyte, configure:

- **Type:** Node.js
- **Node.js Version:** 18.x or higher (recommended 20.x)
- **Startup Command:** (Already configured, you don't need to change it)
- **Port:** Not necessary (the bot doesn't use HTTP port)
- **Auto-restart:** Enabled (recommended)

**💡 How does Wispbyte know what to execute?**

The **Startup Command** that comes by default in Wispbyte is already configured correctly:

```bash
if [[ -d .git ]] && [[ 0 == "1" ]]; then git pull; fi; 
if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; 
if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; 
if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; 
/usr/local/bin/node /home/container/index.js
```

This command:
1. Does `git pull` if there's a connected repository
2. Installs dependencies with `npm install`
3. Executes `node index.js` (which is equivalent to `npm start`)

**You don't need to change it.** When the server restarts, Wispbyte automatically executes this command.

### 8.5 Install Dependencies

Wispbyte should install automatically with `npm install`, but if not:

1. Go to Wispbyte console/terminal
2. Run: `npm install`

### 8.6 Register Commands (If Not Done Locally)

**You can register commands in two ways:**

#### Option A: From Wispbyte Console (After Hosting) ✅

1. Go to Wispbyte panel
2. Open the **Console/Terminal** section
3. Run:
   ```bash
   npm run deploy
   ```

**This is especially useful if:**
- You didn't register commands locally
- You need to update commands after making changes
- You want to switch between server-specific and global commands

#### Option B: From Local Machine (Before Hosting)

Run `npm run deploy` locally before uploading to Wispbyte (see Step 7.2).

**Note:** Both methods work the same way. The script will automatically:
- Try to register on the server if `GUILD_ID` is provided
- Fallback to global registration if server registration fails
- Use the Client ID from `.env` or obtain it automatically from your token

### 8.7 Start the Bot

1. In the Wispbyte panel, click **Start**
2. Check the logs to verify everything is okay
3. You should see:
   ```
   🤖 Bot connected as YourBot#1234!
   ✅ Lavalink lavalink: Connected!
   ```

### 8.8 Verification

#### Expected Logs

If everything is okay, you should see in the logs:

```
🔍 Fetching Lavalink nodes from public API...
📡 API returned X v4 SSL nodes
🎵 Lavalink nodes ready (X total):
   1. lavalink-v4.triniumhost.com:443  [primary]
   ...
🤖 Bot connected as YourBot#1234!
📊 Servers: X
✅ Lavalink primary: Connected!
✅ Client fully ready!
```

#### If there are Errors

- **Token error:** Verify `DISCORD_TOKEN` in `.env`
- **Lavalink error:** Verify `LAVALINK_URL` and `LAVALINK_PASSWORD`
- **Dependencies error:** Run `npm install` in Wispbyte console

### 8.8 Update the Bot

#### If you make code changes:

**If you use GitHub (Option B):**
1. Edit code locally
2. Test: `npm start`
3. Upload to GitHub:
   ```bash
   git add .
   git commit -m "Change description"
   git push
   ```
4. Wispbyte automatically detects, does `git pull` and restarts the bot

**If you uploaded complete folder (Option A):**
1. Edit code locally
2. Test: `npm start`
3. Upload modified files to Wispbyte manually
4. Restart the bot from the panel

#### If you change commands:

1. Run `npm run deploy` **locally** (not from Wispbyte)
2. Commands will update on Discord

### 8.9 Tips for Wispbyte

1. **Use Git:** It's easier to keep code updated
2. **Monitor logs:** Wispbyte has real-time logs
3. **Auto-restart:** Enable it so the bot restarts if it crashes
4. **Backups:** Save your `.env` in a safe place

---

## ☁️ Step 9: Deploy on Oracle Cloud (Free, Full Self-Hosted)

The **most reliable, fully free** way to run the bot: your **own Lavalink node** + the bot,
both in Docker on an Oracle Cloud **Always Free** VM, with a **CI/CD pipeline** that
auto-deploys on every push. No more depending on flaky public nodes.

> 📖 The exhaustive server runbook (VM creation, Docker install, swap, secrets, OAuth,
> first deploy, maintenance) lives in **[DEPLOY.md](DEPLOY.md)**. This section explains the
> architecture and the essentials.

### Why self-host? (the architecture)

Public Lavalink nodes are shared and constantly blocked/rate-limited by YouTube — the
usual cause of *"the bot joins but there's no audio"*. Running your own node removes that
dependency. The whole stack is one `docker compose`:

```
   push/merge to main ─► GitHub Actions ─► build bot image ─► GHCR (image registry)
                                              │
                                              └─ SSH to the VM ─► docker compose pull && up -d
   VM (Oracle Always Free, Docker only):
     ┌─ lavalink container  (own node: Lavalink v4 + youtube-source + OAuth)  ◄── primary
     │      ▲  internal docker network (lavalink:2333, NOT exposed publicly)
     └─ bot container  ──────────────────────────────────────────────► Discord
            └─► public Lavalink nodes  ◄── automatic fallback if your node is down
```

- **`lavalink`** — official `lavalink:4-alpine` image + `youtube-source` plugin. Reachable
  only on the internal Docker network; **port 2333 is never exposed**.
- **`bot`** — your image (built by CI), connects to `lavalink:2333` as the **primary** node;
  public nodes stay configured as **fallback** (logic already in `index.js`).

### ⚠️ Why YouTube needs OAuth on a cloud VM

From a **datacenter IP** (any cloud VM), YouTube flags requests with **"This video requires
login"** — and a `poToken` alone is **not enough**. The fix is a one-time **OAuth** login
using a **throwaway Google account** (⚠️ **never your main account** — it can get banned).
The `TV` client then streams as a logged-in user.

1. `lavalink/application.yml` sets `plugins.youtube.oauth.enabled: true` and includes the
   `TV` client (the only OAuth-compatible one).
2. On first start, Lavalink logs a code → go to **https://www.google.com/device**, enter it,
   and authorise with the **burner** account.
3. Lavalink prints a **refresh token**. Store it as `YOUTUBE_OAUTH_REFRESH_TOKEN` in the
   VM's `.env`; `docker-compose.yml` passes it as `PLUGINS_YOUTUBE_OAUTH_REFRESHTOKEN` with
   `PLUGINS_YOUTUBE_OAUTH_SKIPINITIALIZATION=true`, so it **survives restarts** without
   re-authorising.

### `.env` (lives only on the VM — never committed)

```dotenv
DISCORD_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_application_id     # optional
# GUILD_ID=your_server_id                 # optional

LAVALINK_URL=lavalink:2333
LAVALINK_PASSWORD=use_a_strong_password   # same value the lavalink container uses
LAVALINK_SECURE=false

# From the OAuth device-flow above (burner Google account):
YOUTUBE_OAUTH_REFRESH_TOKEN=1//0e...
```

### Run it

```bash
docker compose up -d                              # starts lavalink + bot
docker compose logs -f                            # watch: "✅ Lavalink primary: Connected!"
docker compose run --rm bot node deploy-commands.js   # register slash commands once
```

### CI/CD — `push` → live (GitHub Actions → GHCR → VM)

On every push to `main`, [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):

1. **Builds** the bot image (`linux/amd64`) and **pushes** it to **GHCR**
   (`ghcr.io/<your-username>/discord-music-bot`).
2. **SSHes** into the VM and runs `docker compose pull && docker compose up -d`.

Add these **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `VM_HOST` | your VM's public IP |
| `VM_USER` | SSH user (e.g. `ubuntu`) |
| `VM_SSH_KEY` | a **dedicated** SSH private key (its public key goes in the VM's `~/.ssh/authorized_keys`) |

Pushing the image uses the built-in `GITHUB_TOKEN`. If you keep the GHCR package **public**
the VM pulls anonymously (no secrets in the image — the `.env` is injected at runtime). For
a **private** image, `docker login ghcr.io` once on the VM with a `read:packages` PAT.

### Resource footprint

On the **smallest** Always Free VM (1 OCPU / 1 GB RAM), with a song playing:

| Service | RAM | CPU |
|---|---|---|
| lavalink | ~200 MB | ~0% |
| bot | ~50 MB | ~0% |
| **Total VM** | **~600 MB / 954** | load ~0.1 (1 core) |

A 2 GB swapfile (see DEPLOY.md) is added as a safety net. Streaming barely registers.

> 📖 Full step-by-step — instance creation, swap, Docker install, secrets, OAuth, first
> deploy, and maintenance (e.g. bumping the `youtube-source` plugin when YouTube changes):
> **[DEPLOY.md](DEPLOY.md)**.

---

## 🎮 Available Commands

| Command | Description |
|---------|-------------|
| `/play <song>` | Plays a song, adds it to the queue, or queues a full **playlist** (search, track URL, or playlist URL) |
| `/skip` | Skips to the next song |
| `/pause` | Pauses playback |
| `/resume` | Resumes playback — or, if the bot was restarted, restores the persisted queue and position (see [Queue persistence and /resume](#queue-persistence-and-resume)) |
| `/stop` | Stops playback, clears the queue, deletes the persisted state, and disconnects |
| `/queue` | Shows the current playback queue |
| `/nowplaying` | Shows the current track with a progress bar, position, length, volume, and flags |
| `/seek <time>` | Jumps to a specific position. Accepts `mm:ss`, `hh:mm:ss`, `1h2m3s`, or raw seconds |
| `/remove <position>` | Removes a specific track from the queue (position 1 = next track) |
| `/clear` | Clears all upcoming tracks (the current song keeps playing) |
| `/shuffle` | Shuffles the songs in the queue |
| `/loop <mode>` | Loop mode: `none`, `track` (repeat current), or `queue` (repeat full queue) |
| `/volume <0-100>` | Adjusts volume (0–100%) |
| `/autoplay <on/off>` | Automatically plays related songs when the queue ends (see [Smart autoplay](#smart-autoplay)) |
| `/247 <on/off>` | Toggles 24/7 mode — keeps the bot in voice even when alone or idle (see [24/7 mode](#247-mode)) |
| `/status` | Shows bot, Discord, and Lavalink node status (WS ping, node states, uptime, memory, Node.js version) |

## 📖 Usage Guide

### 1. Using the Bot on Discord

1. **Join a voice channel** in your server
2. Type `/play` followed by a song name
3. The bot will automatically connect and start playing

### 2. Usage Examples

```
/play never gonna give you up
/play https://www.youtube.com/watch?v=dQw4w9WgXcQ
/play bohemian rhapsody
/volume level: 50
/shuffle
/queue
/skip
```

---

## 🛠️ Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Starts the bot |
| `npm run dev` | Starts the bot with auto-reload |
| `npm run deploy` | Registers slash commands on Discord |
| `npm run setup` | Verifies initial configuration |

---

## 📁 Project Structure

```
Discord-Music-Bot/
├── commands/          # Bot slash commands (auto-discovered by deploy-commands.js)
│   ├── play.js
│   ├── skip.js
│   ├── pause.js
│   ├── resume.js
│   ├── stop.js
│   ├── queue.js
│   ├── nowplaying.js
│   ├── seek.js
│   ├── remove.js
│   ├── clear.js
│   ├── shuffle.js
│   ├── loop.js
│   ├── volume.js
│   ├── autoplay.js
│   ├── 247.js
│   └── status.js
├── state/             # Per-guild persisted player state (queue, position, flags) — gitignored, auto-created
├── index.js           # Main bot file (multi-node Lavalink, persistence, button handler, event wiring)
├── deploy-commands.js # Script to register slash commands on Discord
├── setup.js           # Initial configuration verification script
├── package.json       # Dependencies and scripts
├── .env.example       # Environment variables template
├── .env               # Your config (create from .env.example, never commit)
└── README.md          # This documentation
```

---

## 🆘 Troubleshooting

### Bot doesn't connect to Discord

- ✅ Verify that `DISCORD_TOKEN` is correct in `.env`
- ✅ Verify that the bot has the correct intents enabled
- ✅ Verify that the bot is invited to the server

### Doesn't connect to Lavalink

- ✅ Verify that `LAVALINK_URL` and `LAVALINK_PASSWORD` are correct in `.env`
- ✅ If using port 443, make sure `LAVALINK_SECURE=true`
- ✅ The bot auto-connects to multiple public nodes — if the primary is down, others will be used automatically
- ✅ Check the startup logs: you should see multiple "✅ Lavalink X: Connected!" lines
- ✅ If you see `🚫 Node X removed from pool after 3 flaps`, that node is dead/unstable and the bot intentionally ejected it — playback continues on remaining nodes
- ✅ If `/play` says `❌ No Lavalink nodes are online right now`, all nodes failed at once — wait a few seconds and try again, the bot keeps reconnecting in the background

### Commands don't appear

- ✅ Run `npm run deploy` to register commands
- ✅ Wait 1-2 minutes (server commands) or up to 1 hour (global commands)
- ✅ Refresh Discord completely (close and reopen)
- ✅ Verify that the bot has permissions on the server

### Bot doesn't play music

- ✅ Verify that Lavalink is connected (should see "✅ Lavalink lavalink: Connected!")
- ✅ Make sure you're in a voice channel before using `/play`
- ✅ Verify that the bot has permissions to connect to the channel

### `/play` says "No results found" for a well-known artist

The Lavalink YouTube plugin gets rate-limited or blocked by YouTube's anti-bot from time to time — when it happens, search returns 0 tracks instead of an error. The bot already mitigates this by racing the search across every connected node in parallel and falling back to SoundCloud (`scsearch:`), so you only see "No results found" when **every** connected node's YouTube source is blocked **and** SoundCloud has no match.

If this keeps happening:
- Try again in a few minutes — the public node pool refreshes hourly and a freshly-added node often has working YouTube.
- Restart the bot to force-refresh the node pool.
- Consider running a private Lavalink with the `youtube-source` plugin configured with OAuth, which is much more reliable than the lavaplayer default.

### Bot disconnected by itself

- ✅ Expected: the bot leaves after **1 hour** of an empty queue (with autoplay off) or **1 hour** alone in the voice channel — see [Auto-disconnect timers](#auto-disconnect-timers)
- ✅ If it disconnected mid-song, check the logs for `Lavalink X: Closed` — the node likely dropped. The bot will auto-recover via failover on the next `/play`

---

## 📝 Important Notes

- The bot needs permissions to connect to voice channels
- Global commands can take up to 1 hour to appear
- Use `GUILD_ID` in `.env` for instant commands
- Port 443 requires `LAVALINK_SECURE=true`
- The `.env` should NOT be uploaded to GitHub (it's in `.gitignore`)
- The `.env` MUST be uploaded to Wispbyte manually
- The bot auto-disconnects after **1 hour** of inactivity or **1 hour** alone in the voice channel (skipped while `/247` is on)
- The `state/` directory is created automatically on startup and is gitignored — it stores per-guild queue/position so `/resume` can recover after a restart (entries older than 7 days are cleaned up on boot)
- If you have a leftover `env` file (no dot) in the project root, it's safe to delete — it's a legacy artifact and is already ignored by Git

---

## 🔐 Bot Permissions

When inviting the bot, make sure to give it these permissions:
- ✅ **Connect** (connect to voice channels)
- ✅ **Speak** (speak in voice channels)
- ✅ **Use Voice Activity** (use voice activity)
- ✅ **Send Messages** (send messages)
- ✅ **Use Slash Commands** (use slash commands)

---

## 🙏 Credits & References

### Built with

- [Discord.js](https://discord.js.org/) — Discord library
- [Kazagumo](https://github.com/Takiyo0/Kazagumo) — Wrapper for Shoukaku
- [Shoukaku](https://github.com/shipgirlproject/Shoukaku) — Lavalink client
- [Lavalink](https://github.com/lavalink-devs/Lavalink) — Audio server
- [youtube-source](https://github.com/lavalink-devs/youtube-source) — YouTube source manager + OAuth/poToken for Lavalink

### Infrastructure & deployment (Step 9)

- [Oracle Cloud — Always Free](https://www.oracle.com/cloud/free/) — the free VM
- [Lavalink Docker docs](https://lavalink.dev/getting-started/docker) — official compose/image reference
- [GitHub Container Registry (GHCR)](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) — bot image registry
- [GitHub Actions](https://docs.github.com/en/actions) — CI/CD
- [docker/build-push-action](https://github.com/docker/build-push-action) — builds & pushes the image
- [appleboy/ssh-action](https://github.com/appleboy/ssh-action) — SSH deploy step

### YouTube anti-bot — further reading

- [youtube-source: OAuth & poToken](https://github.com/lavalink-devs/youtube-source#using-a-potoken) — why a cloud VM needs OAuth
- ["Video requires login on dedicated server" (issue #107)](https://github.com/lavalink-devs/youtube-source/issues/107) — the exact datacenter-IP problem
- [bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider) — browserless poToken generator (an alternative to OAuth)
- [youtube-trusted-session-generator](https://github.com/iv-org/youtube-trusted-session-generator) — Chromium-based poToken/visitorData generator
- [yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide) — background on Proof-of-Origin tokens

---

**Enjoy your music bot! 🎵**

**Thiago Brucezzi**