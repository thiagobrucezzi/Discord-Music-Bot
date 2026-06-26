# Deploy — Oracle Cloud (self-hosted Lavalink + CI/CD)

Architecture: the VM runs **your own Lavalink + the bot** via Docker Compose. GitHub
Actions builds the bot image (`linux/amd64`), pushes it to GHCR, and connects over SSH to
the VM to update it. You just merge to `main` and it deploys itself.

```
push/merge to main ─► GitHub Actions ─► build image ─► GHCR
                                          │
                                          └─ SSH to the VM ─► docker compose pull && up -d
Oracle VM (E2.1.Micro, 1 GB):
  ┌─ lavalink  (own node, internal network, does NOT expose 2333)  ◄── primary
  └─ bot       (connects to lavalink:2333; public nodes = fallback)
```

---

## 1. VM bootstrap (one time)

SSH into the VM:

```bash
ssh -i ~/Downloads/ssh-key-2026-06-21-2.key ubuntu@<VM_PUBLIC_IP>
```

Install Docker + the compose plugin:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu   # reconnect the SSH session after this
```

**2 GB swapfile** (safety net for 1 GB of RAM — key so Lavalink + bot don't get OOM-killed):

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl -w vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.d/99-swappiness.conf
```

App directory:

```bash
mkdir -p ~/discord-music-bot/lavalink
```

---

## 2. Files on the VM

Only these live in `~/discord-music-bot/` (the bot code travels as an image, it is not cloned):

- `docker-compose.yml`
- `lavalink/application.yml`
- `.env`  ← **never committed**, lives only here

`.env` (Discord tokens + your own node as primary):

```dotenv
DISCORD_TOKEN=<your Discord token>
DISCORD_CLIENT_ID=<your application id>
# GUILD_ID=<optional, to register slash commands instantly on one server>

LAVALINK_URL=lavalink:2333
LAVALINK_PASSWORD=<strong password, the same one the lavalink container sees>
LAVALINK_SECURE=false

# YouTube OAuth (see next section). Filled in AFTER the first boot.
YOUTUBE_OAUTH_REFRESH_TOKEN=<refresh token from the device-flow, BURNER account>
```

> `LAVALINK_PASSWORD` is used in two places: the `lavalink` container takes it as the server
> password, and the `bot` uses it to authenticate against it. It must be the same value.

---

## 2b. YouTube OAuth (REQUIRED for playback)

From a datacenter IP (any cloud VM) YouTube blocks the stream with *"This video requires
login"*. A `poToken` alone is **not enough**; you must authenticate with **OAuth** using a
**BURNER** Google account (⚠️ **never your main account** — it can get banned).

The config is already in `lavalink/application.yml` (`plugins.youtube.oauth.enabled: true` +
the `TV` client, the only OAuth-compatible one). Authorisation flow (one time):

1. Start Lavalink **without** `YOUTUBE_OAUTH_REFRESH_TOKEN` in `.env`. The logs show:

   ```
   docker compose logs lavalink | grep -i "google.com/device"
   # OAUTH INTEGRATION: ... go to https://www.google.com/device and enter code XXX-XXX-XXX
   ```

2. Go to **https://www.google.com/device**, enter the code and **authorise with the burner
   account**.

3. Lavalink prints the refresh token:

   ```
   docker compose logs lavalink | grep -i "refresh token"
   # Token retrieved successfully. Store your refresh token ... (1//0e...)
   ```

4. Store it in `.env` as `YOUTUBE_OAUTH_REFRESH_TOKEN=1//0e...` and recreate Lavalink:

   ```bash
   docker compose up -d --force-recreate lavalink
   docker compose logs lavalink | grep -i "access token refreshed"
   # YouTube access token refreshed successfully   ← no longer asks for a code
   ```

`docker-compose.yml` passes that token as `PLUGINS_YOUTUBE_OAUTH_REFRESHTOKEN` with
`PLUGINS_YOUTUBE_OAUTH_SKIPINITIALIZATION=true`, so it **survives restarts** without
re-authorising.

> If the burner account ever gets banned, repeat the flow with another account and update
> `YOUTUBE_OAUTH_REFRESH_TOKEN`.

---

## 3. Deploy key for GitHub Actions

A **dedicated** key pair was generated (not your personal key). The public part goes on the VM:

```bash
# on the VM
echo "ssh-ed25519 AAAA... github-actions-deploy@discord-music-bot" >> ~/.ssh/authorized_keys
```

The private part is loaded as a GitHub secret (see below).

---

## 4. GitHub secrets

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `VM_HOST` | your VM's public IP |
| `VM_USER` | `ubuntu` |
| `VM_SSH_KEY` | full contents of the **dedicated** deploy private key |

`GITHUB_TOKEN` already exists (the workflow uses it to push to GHCR, no need to create it).

---

## 5. GHCR image visibility

**Default (recommended): public.** The image contains NO secrets — `.dockerignore` excludes
the `env`, so the Discord token never travels inside. Keeping it public is safe and simplest:
the VM pulls it **without login** and the deploy works as-is. Anyone can pull it, but without
your Discord token it's unusable code.

**Optional: private.** If you want to hide the code/image as a preference (it adds no security
over the secrets), you must log the VM into GHCR once:

1. PAT (classic) in GitHub → Settings → Developer settings → Personal access tokens →
   **Tokens (classic)**, with **only** the `read:packages` scope.
2. Log the VM in (run it in YOUR terminal so the token doesn't leak into shared logs):

   ```bash
   ssh -i ~/Downloads/ssh-key-...key ubuntu@<VM_PUBLIC_IP> \
     'echo <PAT> | docker login ghcr.io -u <your-github-user> --password-stdin'
   ```

3. **Only then** set the package to private: GitHub → profile → *Packages* →
   `discord-music-bot` → *Package settings* → *Change visibility* → **Private**.

> Order matters: log the VM in first, then make the package private. The other way around,
> the next deploy fails at `pull`.

---

## 6. First deploy

The first time is done by hand (afterwards it's automatic):

```bash
cd ~/discord-music-bot
docker compose pull        # pulls lavalink + the bot image
docker compose up -d
docker compose logs -f      # verify the bot connects to lavalink:2333
```

Register the slash commands (once, or whenever they change):

```bash
docker compose run --rm bot node deploy-commands.js
```

---

## 7. Day to day (CI/CD)

1. Work on a branch, open a PR against `main`.
2. Merge the PR → the workflow builds, pushes to GHCR and updates the VM by itself.
3. No need to SSH in again.

Force a manual deploy: Actions → **Build & Deploy** → Run workflow.

> ⚠️ CI only redeploys the **bot image**. Changes to `docker-compose.yml` or
> `lavalink/application.yml` are NOT auto-copied to the VM — `scp` them (or edit them
> directly there) and run `docker compose up -d` manually.

---

## 8. Maintenance

- **YouTube stops working** → two possible causes, two different fixes:
  - **"Must find sig function from script"** — YouTube rotated its player script; the remote
    cipher server (`cipher.kikkia.dev`) in `lavalink/application.yml` handles this
    automatically. Verify the boot log shows
    `Using remote cipher server with URL "https://cipher.kikkia.dev/"`. If the URL is
    missing, copy the latest `lavalink/application.yml` from the repo to the VM and recreate
    Lavalink. If the public instance is unreachable, self-host
    [`yt-cipher`](https://github.com/kikkia/yt-cipher) as a sidecar.
  - **"This video requires login"** — OAuth token expired or revoked. Redo section 2b with
    the same (or a new) burner account and update `YOUTUBE_OAUTH_REFRESH_TOKEN` in `.env`.
  - **Both fine but still no audio** → bump the plugin version in `lavalink/application.yml`
    (`dev.lavalink.youtube:youtube-plugin:<latest>` from
    https://github.com/lavalink-devs/youtube-source/releases), commit, update the VM and
    recreate Lavalink.
- **Check RAM/swap usage**: `free -h` and `docker stats` on the VM.
- **Logs**: `docker compose logs -f lavalink` / `docker compose logs -f bot`.
