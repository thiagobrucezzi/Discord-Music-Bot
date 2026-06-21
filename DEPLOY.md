# Deploy — Oracle Cloud (self-hosted Lavalink + CI/CD)

Arquitectura: la VM corre **Lavalink propio + el bot** vía Docker Compose. GitHub
Actions buildea la imagen del bot (`linux/amd64`), la pushea a GHCR y se conecta por
SSH a la VM para actualizarla. Vos solo mergeás a `main` y se despliega solo.

```
push/merge a main ─► GitHub Actions ─► build imagen ─► GHCR
                                          │
                                          └─ SSH a la VM ─► docker compose pull && up -d
VM Oracle (E2.1.Micro, 1GB):
  ┌─ lavalink  (nodo propio, red interna, NO expone 2333)  ◄── primario
  └─ bot       (conecta a lavalink:2333; públicos = fallback)
```

---

## 1. Bootstrap de la VM (una sola vez)

SSH a la VM:

```bash
ssh -i ~/Downloads/ssh-key-2026-06-21-2.key ubuntu@<VM_PUBLIC_IP>
```

Instalar Docker + plugin compose:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu   # reconectar la sesión SSH después de esto
```

**Swapfile de 2 GB** (red de seguridad para 1 GB de RAM — clave para que Lavalink + bot no mueran por OOM):

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl -w vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.d/99-swappiness.conf
```

Directorio de la app:

```bash
mkdir -p ~/discord-music-bot/lavalink
```

---

## 2. Archivos en la VM

En `~/discord-music-bot/` van **solo** estos (el código del bot viaja como imagen, no se clona):

- `docker-compose.yml`
- `lavalink/application.yml`
- `.env`  ← **NO se commitea**, vive solo acá

`.env` (tokens de Discord + nodo propio como primario):

```dotenv
DISCORD_TOKEN=<tu token de Discord>
DISCORD_CLIENT_ID=<tu application id>
# GUILD_ID=<opcional, para registrar slash commands al instante en un server>

LAVALINK_URL=lavalink:2333
LAVALINK_PASSWORD=<password fuerte, el mismo que ve el contenedor lavalink>
LAVALINK_SECURE=false
```

> `LAVALINK_PASSWORD` se usa en dos lugares: el contenedor `lavalink` lo toma como
> password del servidor, y el `bot` lo usa para autenticarse contra él. Tiene que ser
> el mismo valor.

---

## 3. Llave de deploy para GitHub Actions

Se generó un par **dedicado** (no es tu llave personal). La pública va a la VM:

```bash
# en la VM
echo "ssh-ed25519 AAAA... github-actions-deploy@discord-music-bot" >> ~/.ssh/authorized_keys
```

La privada se carga como secret de GitHub (ver abajo).

---

## 4. Secrets en GitHub

Repo → Settings → Secrets and variables → Actions:

| Secret | Valor |
|---|---|
| `VM_HOST` | la IP pública de tu VM |
| `VM_USER` | `ubuntu` |
| `VM_SSH_KEY` | contenido completo de la llave privada **dedicada** de deploy |

`GITHUB_TOKEN` ya existe (lo usa el workflow para pushear a GHCR, no hay que crearlo).

---

## 5. Imagen en GHCR privada (con login en la VM)

Mantenemos la imagen **privada**. Para que la VM la pueda bajar, hay que loguearla
a GHCR **una sola vez** con un Personal Access Token de solo lectura de packages.

1. Crear un PAT (classic) en GitHub → Settings → Developer settings → Personal access
   tokens → **Tokens (classic)** → Generate, con **solo** el scope `read:packages`.
2. Loguear la VM (correr en TU terminal, así el token no queda en logs ajenos):

   ```bash
   ssh -i ~/Downloads/ssh-key-...key ubuntu@<VM_PUBLIC_IP> \
     'echo <PAT> | docker login ghcr.io -u <tu-usuario-github> --password-stdin'
   ```

   El login queda guardado en `~/.docker/config.json` de la VM, que es el mismo
   usuario (`ubuntu`) con el que entra el deploy de GitHub Actions → los `docker
   compose pull` siguientes autentican solos.

3. **Recién después** poné el package en privado: GitHub → perfil → *Packages* →
   `discord-music-bot` → *Package settings* → *Change visibility* → **Private**.

> Orden importante: primero el login en la VM, después privar el package. Al revés,
> el siguiente deploy falla en el `pull`.

---

## 6. Primer deploy

La primera vez se hace a mano (después es automático):

```bash
cd ~/discord-music-bot
docker compose pull        # baja lavalink + la imagen del bot
docker compose up -d
docker compose logs -f      # verificar que el bot conecta a lavalink:2333
```

Registrar los slash commands (una vez, o cuando cambien):

```bash
docker compose run --rm bot node deploy-commands.js
```

---

## 7. Día a día (CI/CD)

1. Trabajás en una rama, abrís PR contra `main`.
2. Mergeás el PR → el workflow buildea, pushea a GHCR y actualiza la VM solo.
3. No hace falta volver a entrar por SSH.

Forzar un deploy manual: Actions → **Build & Deploy** → Run workflow.

---

## 8. Mantenimiento

- **YouTube deja de andar** → casi siempre es el plugin. Subí la versión en
  `lavalink/application.yml` (`dev.lavalink.youtube:youtube-plugin:<última>` de
  https://github.com/lavalink-devs/youtube-source/releases), commit, merge → redeploy.
- **Ver uso de RAM/swap**: `free -h` y `docker stats` en la VM.
- **Logs**: `docker compose logs -f lavalink` / `docker compose logs -f bot`.
