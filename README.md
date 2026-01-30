# 🎵 Discord Music Bot

Complete music bot for Discord using **Kazagumo**, **Shoukaku** and **Lavalink**.

## ✨ Features

- ✅ Music playback from YouTube
- ✅ Queue system
- ✅ Full playback control (play, pause, resume, stop, skip, queue)
- ✅ Volume adjustment
- ✅ Queue visualization
- ✅ Lavalink integration
- ✅ Modern slash commands

## 📋 Requirements

- **Node.js** 18.0.0 or higher
- **npm** 7.0.0 or higher
- A **Discord bot** created
- A **Lavalink** server (free hosting or local)

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

1. Create a file called `.env` in the root of the project
2. Copy and paste this content:

```env
# Discord bot token (REQUIRED)
DISCORD_TOKEN=your_token_here

# Bot Application ID (OPTIONAL - obtained automatically if not provided)
DISCORD_CLIENT_ID=your_application_id

# Server ID for instant commands (OPTIONAL - if not provided, commands will be registered globally)
GUILD_ID=your_server_id

# Lavalink configuration (REQUIRED - see next step)
LAVALINK_URL=host:port
LAVALINK_PASSWORD=your_password
LAVALINK_SECURE=false
```

### 5.2 Fill in the Values

- **`DISCORD_TOKEN`:** The token you copied in Step 2.3 (REQUIRED)
- **`DISCORD_CLIENT_ID`:** The Application ID you copied in Step 2.4 (OPTIONAL - the script can obtain it automatically from your token)
- **`GUILD_ID`:** The Server ID you copied in Step 3.3 (OPTIONAL - if not provided, commands will be registered globally and may take up to 1 hour to appear)
- **`LAVALINK_URL` and `LAVALINK_PASSWORD`:** You'll configure these in the next step (REQUIRED)

---

## 🎵 Step 6: Configure Lavalink

You need a Lavalink server for the bot to play music. You have 2 options:

### Option A: Free Hosting Service (Recommended) ⭐

1. **Go to:** https://lavalink.darrennathanael.com/
2. **Register** and create a node
3. **Copy the information:**
   - **URL:** (e.g., `lavalinkv4.serenetia.com:443`)
   - **Password:** (the password they gave you)
4. **Update your `.env`:**
   ```env
   LAVALINK_URL=lavalinkv4.serenetia.com:443
   LAVALINK_PASSWORD=your_password_here
   LAVALINK_SECURE=true
   ```
   **Note:** If the port is `443`, always use `LAVALINK_SECURE=true`

### Option B: Other Free Services

You can search for other free Lavalink hosting services:
- Search on Discord: bot community servers
- Search on Google: "free lavalink hosting"
- Some services require registration or have limits

### Option C: Local Lavalink (Testing Only)

If you want to test locally:

1. **Download Lavalink:**
   - Go to: https://github.com/lavalink-devs/Lavalink/releases
   - Download `Lavalink.jar`

2. **Create `application.yml`:**
   ```yaml
   server:
     port: 2333
     address: 0.0.0.0
   
   lavalink:
     server:
       password: "youshallnotpass"
       sources:
         youtube: true
         soundcloud: true
   ```

3. **Run Lavalink:**
   ```bash
   java -jar Lavalink.jar
   ```

4. **Configure `.env`:**
   ```env
   LAVALINK_URL=localhost:2333
   LAVALINK_PASSWORD=youshallnotpass
   LAVALINK_SECURE=false
   ```

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
🔗 Lavalink Configuration: host:port (secure: true/false)
🤖 Bot connected as YourBot#1234!
📊 Servers: X
✅ Lavalink lavalink: Connected!
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
🔗 Lavalink Configuration: lavalinkv4.serenetia.com:443 (secure: true)
🤖 Bot connected as YourBot#1234!
📊 Servers: X
✅ Lavalink lavalink: Connected!
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

## 🎮 Available Commands

| Command | Description |
|---------|-------------|
| `/play <song>` | Plays a song or adds to queue |
| `/stop` | Stops playback and clears queue |
| `/skip` | Skips to next song |
| `/pause` | Pauses playback |
| `/resume` | Resumes playback |
| `/queue` | Shows the playback queue |
| `/volume <0-200>` | Adjusts volume (0-200%) |
| `/autoplay <on/off>` | Enables or disables automatic playback of related songs |

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
/volume volume: 50
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
Bot-Music-Discord/
├── commands/          # Bot slash commands
│   ├── play.js
│   ├── stop.js
│   ├── skip.js
│   ├── pause.js
│   ├── resume.js
│   ├── queue.js
│   ├── volume.js
│   └── autoplay.js
├── index.js          # Main bot file
├── deploy-commands.js # Script to register commands
├── setup.js          # Initial verification script
├── package.json      # Dependencies and scripts
├── .env              # Environment variables (create manually)
└── README.md         # This documentation
```

---

## 🆘 Troubleshooting

### Bot doesn't connect to Discord

- ✅ Verify that `DISCORD_TOKEN` is correct in `.env`
- ✅ Verify that the bot has the correct intents enabled
- ✅ Verify that the bot is invited to the server

### Doesn't connect to Lavalink

- ✅ Verify that `LAVALINK_URL` and `LAVALINK_PASSWORD` are correct
- ✅ If using port 443, make sure you have `LAVALINK_SECURE=true`
- ✅ Verify that the Lavalink server is active
- ✅ Try with another Lavalink server

### Commands don't appear

- ✅ Run `npm run deploy` to register commands
- ✅ Wait 1-2 minutes (server commands) or up to 1 hour (global commands)
- ✅ Refresh Discord completely (close and reopen)
- ✅ Verify that the bot has permissions on the server

### Bot doesn't play music

- ✅ Verify that Lavalink is connected (should see "✅ Lavalink lavalink: Connected!")
- ✅ Make sure you're in a voice channel before using `/play`
- ✅ Verify that the bot has permissions to connect to the channel

---

## 📝 Important Notes

- The bot needs permissions to connect to voice channels
- Global commands can take up to 1 hour to appear
- Use `GUILD_ID` in `.env` for instant commands
- Port 443 requires `LAVALINK_SECURE=true`
- The `.env` should NOT be uploaded to GitHub (it's in `.gitignore`)
- The `.env` MUST be uploaded to Wispbyte manually

---

## 🔐 Bot Permissions

When inviting the bot, make sure to give it these permissions:
- ✅ **Connect** (connect to voice channels)
- ✅ **Speak** (speak in voice channels)
- ✅ **Use Voice Activity** (use voice activity)
- ✅ **Send Messages** (send messages)
- ✅ **Use Slash Commands** (use slash commands)

---

## 🙏 Credits

- [Kazagumo](https://github.com/Takiyo0/Kazagumo) - Wrapper for Shoukaku
- [Shoukaku](https://github.com/shipgirlproject/Shoukaku) - Lavalink client
- [Lavalink](https://github.com/lavalink-devs/Lavalink) - Audio server
- [Discord.js](https://discord.js.org/) - Discord library

---

**Enjoy your music bot! 🎵**

**Thiago Brucezzi**