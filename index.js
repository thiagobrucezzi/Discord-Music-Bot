import { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Shoukaku, Connectors } from 'shoukaku';
import { Kazagumo } from 'kazagumo';
import { config } from 'dotenv';
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Per-guild persisted state (for /resume across restarts) ────────────────
// Each guild's player state lives at state/<guildId>.json. We snapshot enough
// to recreate the player and continue from approximately the last position.
const STATE_DIR = join(__dirname, 'state');
const STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
try { mkdirSync(STATE_DIR, { recursive: true }); } catch (e) { /* exists */ }

function statePath(guildId) {
    return join(STATE_DIR, `${guildId}.json`);
}

function saveGuildState(player) {
    if (!player || !player.guildId) return;
    try {
        const current = player.queue.current;
        const queue = [...player.queue].map(t => ({
            uri: t.uri,
            title: t.title,
            requesterId: t.requester?.id ?? null
        }));
        const data = {
            guildId: player.guildId,
            voiceId: player.voiceId,
            textId: player.textId,
            volume: player.volume ?? 100,
            autoplay: Boolean(player._autoplay),
            loop: player._loopMode || 'none',
            twentyFourSeven: Boolean(player._twentyFourSeven),
            current: current ? {
                uri: current.uri,
                title: current.title,
                position: typeof player.position === 'number' ? player.position : 0,
                requesterId: current.requester?.id ?? null
            } : null,
            queue,
            savedAt: Date.now()
        };
        writeFileSync(statePath(player.guildId), JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        console.error(`💾 Failed to save state for guild ${player.guildId}:`, err.message);
    }
}

function loadGuildState(guildId) {
    try {
        const p = statePath(guildId);
        if (!existsSync(p)) return null;
        return JSON.parse(readFileSync(p, 'utf-8'));
    } catch (err) {
        console.error(`💾 Failed to load state for guild ${guildId}:`, err.message);
        return null;
    }
}

function deleteGuildState(guildId) {
    try {
        const p = statePath(guildId);
        if (existsSync(p)) unlinkSync(p);
    } catch (err) {
        console.error(`💾 Failed to delete state for guild ${guildId}:`, err.message);
    }
}

function cleanupOldStates() {
    try {
        const files = readdirSync(STATE_DIR).filter(f => f.endsWith('.json'));
        const now = Date.now();
        let removed = 0;
        for (const f of files) {
            const fp = join(STATE_DIR, f);
            try {
                const age = now - statSync(fp).mtimeMs;
                if (age > STATE_MAX_AGE_MS) {
                    unlinkSync(fp);
                    removed += 1;
                }
            } catch (e) { /* ignore */ }
        }
        if (removed > 0) console.log(`💾 Cleaned up ${removed} stale state file(s)`);
    } catch (err) { /* state dir doesn't exist or unreadable */ }
}
cleanupOldStates();

// ─── Player UI buttons ──────────────────────────────────────────────────────
// Two rows because Discord caps each ActionRow at 5 buttons.
function buildPlayerActionRow(player) {
    const isPaused = Boolean(player?.paused);
    const loopMode = player?._loopMode || 'none';
    const loopEmoji = loopMode === 'track' ? '🔂' : loopMode === 'queue' ? '🔁' : '➡️';

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_prev').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_pause').setEmoji(isPaused ? '▶️' : '⏸️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('music_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_loop').setEmoji(loopEmoji).setLabel(`Loop: ${loopMode}`).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_queue').setEmoji('📋').setLabel('Queue').setStyle(ButtonStyle.Secondary)
    );
    return [row1, row2];
}

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

// Helper: fetch available Lavalink v4 SSL nodes from public API
async function fetchLavalinkNodes(maxNodes = 20) {
    const apis = [
        'https://lavalink-list.ajieblogs.eu.org/SSL',
        'https://lavalink-list.ajieblogs.eu.org/all',
    ];
    for (const apiUrl of apis) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const response = await fetch(apiUrl, { signal: controller.signal });
            clearTimeout(timeout);
            if (!response.ok) continue;
            const list = await response.json();
            const v4Nodes = list
                .filter(n =>
                    (n.version === 'v4' || String(n.version).startsWith('4')) &&
                    !n.host.includes('-v3.') &&
                    !n.host.startsWith('lavalink-v3') &&
                    !n.host.includes('jirayu.net') &&
                    (n.secure || n.port === 443)
                )
                .slice(0, maxNodes)
                .map(n => ({
                    name: n.identifier || n.name || n.host,
                    url: `${n.host}:${n.port}`,
                    auth: n.password,
                    secure: Boolean(n.secure || n.port === 443)
                }));
            if (v4Nodes.length > 0) {
                console.log(`📡 API (${apiUrl}) returned ${v4Nodes.length} v4 SSL nodes`);
                return v4Nodes;
            }
        } catch (error) {
            console.warn(`⚠️ Could not fetch nodes from ${apiUrl}: ${error.message}`);
        }
    }
    return [];
}

// Primary node from .env
const lavalinkUrl = process.env.LAVALINK_URL || 'localhost:2333';
const lavalinkPort = parseInt(lavalinkUrl.split(':')[1]) || 2333;
const isSecure = process.env.LAVALINK_SECURE === 'true' || lavalinkPort === 443;

const primaryNode = {
    name: 'primary',
    url: lavalinkUrl,
    auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
    secure: isSecure
};

// Hardcoded fallback nodes (v4, SSL) — used if API is unreachable
// These are community-hosted public nodes; they may go down at any time.
// Note: jirayu.net is excluded — it rate-limits (429) under heavy reconnect load.
const fallbackNodes = [
    { name: 'triniumhost-v4',    url: 'lavalink-v4.triniumhost.com:443',      auth: 'free',                         secure: true },
    { name: 'serenetia-v4',      url: 'lavalinkv4.serenetia.com:443',         auth: 'https://seretia.link/discord', secure: true },
    { name: 'lavalinkv4-2',      url: 'lavalinkv4-2.serenetia.com:443',       auth: 'https://seretia.link/discord', secure: true },
];

console.log(`🔍 Fetching Lavalink nodes from public API...`);
const apiNodes = await fetchLavalinkNodes(); // try all available v4 SSL nodes

// Merge: primary → API nodes → hardcoded fallbacks; deduplicate by URL
const seenUrls = new Set();
const nodes = [primaryNode, ...apiNodes, ...fallbackNodes].filter(n => {
    if (seenUrls.has(n.url)) return false;
    seenUrls.add(n.url);
    return true;
});

console.log(`🎵 Lavalink nodes ready (${nodes.length} total):`);
nodes.forEach((n, i) => console.log(`   ${i + 1}. ${n.url}  [${n.name}]`));

// Create Discord.js connector
const connector = new Connectors.DiscordJS(client);

// Initialize Kazagumo with multi-node support
const kazagumo = new Kazagumo(
    {
        defaultSearchEngine: 'youtube',
        send: (guildId, payload) => {
            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        }
    },
    connector,
    nodes,
    {
        moveOnDisconnect: true,   // auto-move players to another node if one dies
        resumable: false,
        resumableTimeout: 30,
        reconnectTries: 2,
        reconnectInterval: 30000,
        restTimeout: 20000
    }
);

// Get Shoukaku instance from Kazagumo for events
const shoukaku = kazagumo.shoukaku;

// Flapping-node detector. Two trip conditions, whichever fires first:
//   1) FLAP_THRESHOLD closes within FLAP_WINDOW_MS of "ready", OR a proxy-close reason
//   2) STORM_THRESHOLD total closes within STORM_WINDOW_MS (catches dead nodes that
//      never fire 'ready' and whose close reason doesn't include 'proxy-close')
// Tripping calls killNodeHard(): shoukaku.removeNode() ALONE does not stop reconnects
// (the Node instance keeps its own connect→close→connect loop running internally), so
// we also monkey-patch close/connect to no-ops, terminate the underlying ws, and
// strip listeners.
const FLAP_WINDOW_MS = 5000;
const FLAP_THRESHOLD = 3;
const STORM_WINDOW_MS = 5000;
const STORM_THRESHOLD = 5;
const nodeFlapState = new Map(); // name -> { readyAt, flaps, removed, closes: number[] }

function killNodeHard(name, reason) {
    const state = nodeFlapState.get(name) || { readyAt: 0, flaps: 0, removed: false, closes: [] };
    if (state.removed) return;
    state.removed = true;
    nodeFlapState.set(name, state);

    const node = shoukaku.nodes.get(name);
    try {
        shoukaku.removeNode(name, reason);
    } catch (err) {
        // node may already be gone; ignore
    }
    if (node) {
        // Override the internal reconnect loop. After this, even if the ws fires a
        // 'close' event, node.close() is a no-op so it won't call connect() again.
        node.close = async () => {};
        node.connect = async () => {};
        try {
            if (node.ws) {
                node.ws.removeAllListeners('close');
                node.ws.removeAllListeners('error');
                node.ws.removeAllListeners('message');
                node.ws.removeAllListeners('upgrade');
                if (typeof node.ws.terminate === 'function') node.ws.terminate();
            }
        } catch (e) { /* ignore */ }
        try { node.removeAllListeners(); } catch (e) { /* ignore */ }
    }
    console.warn(`   └─ 🚫 Node ${name} hard-killed (reason: ${reason})`);

    // If we just killed the last connected node, ask for a fresh pool early
    // instead of waiting for the next scheduled refresh.
    const stillConnected = [...shoukaku.nodes.values()].some(n => n.state === 1);
    if (!stillConnected) {
        scheduleEmergencyRefresh();
    }
}

// ─── Periodic node-pool refresh ─────────────────────────────────────────────
// Public Lavalink hosts come and go. The startup fetch is a snapshot — without
// a refresh, the pool monotonically shrinks as nodes get hard-killed. Every
// REFRESH_INTERVAL_MS we re-query the API and add any fresh nodes the pool
// doesn't already know. Nodes we previously hard-killed are skipped so they
// don't immediately flap again.
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const EMERGENCY_REFRESH_COOLDOWN_MS = 5 * 60 * 1000; // 5 min
let lastRefreshAt = Date.now(); // initial fetch already happened at startup
let emergencyRefreshTimer = null;

async function refreshNodePool(label = 'scheduled') {
    lastRefreshAt = Date.now();
    let fresh;
    try {
        fresh = await fetchLavalinkNodes();
    } catch (err) {
        console.error(`📡 [${label}] node refresh failed: ${err.message}`);
        return;
    }
    if (!fresh.length) {
        console.warn(`📡 [${label}] node refresh returned 0 nodes`);
        return;
    }

    let added = 0;
    for (const cfg of fresh) {
        if (shoukaku.nodes.has(cfg.name)) continue;
        if (nodeFlapState.get(cfg.name)?.removed) continue;
        try {
            shoukaku.addNode(cfg);
            added += 1;
            console.log(`   + Added node ${cfg.name} (${cfg.url})`);
        } catch (err) {
            console.error(`   ✗ Failed adding ${cfg.name}: ${err.message}`);
        }
    }
    const connected = [...shoukaku.nodes.values()].filter(n => n.state === 1).length;
    console.log(`📡 [${label}] node refresh: +${added} new, ${shoukaku.nodes.size} total, ${connected} connected`);
}

function scheduleEmergencyRefresh() {
    if (emergencyRefreshTimer) return; // already scheduled
    const elapsed = Date.now() - lastRefreshAt;
    if (elapsed < EMERGENCY_REFRESH_COOLDOWN_MS) {
        const wait = EMERGENCY_REFRESH_COOLDOWN_MS - elapsed;
        console.warn(`📡 0 nodes connected, emergency refresh in ${Math.round(wait / 1000)}s`);
        emergencyRefreshTimer = setTimeout(() => {
            emergencyRefreshTimer = null;
            refreshNodePool('emergency');
        }, wait);
    } else {
        console.warn(`📡 0 nodes connected, emergency refresh now`);
        emergencyRefreshTimer = setTimeout(() => {
            emergencyRefreshTimer = null;
            refreshNodePool('emergency');
        }, 0);
    }
}

setInterval(() => refreshNodePool('scheduled'), REFRESH_INTERVAL_MS);

// ─── Cleanup helpers shared with command handlers ───────────────────────────
// KazagumoPlayer.destroy() sets state=DESTROYING *before* awaiting REST calls.
// If the REST call throws (e.g. EAI_AGAIN during a node DNS blip), the
// players.delete() at the end never runs, leaving a stuck DESTROYING entry
// that breaks every subsequent /play with "Player is already destroyed".
// This helper always wipes the kazagumo + shoukaku map entries, regardless.
async function forceCleanupPlayer(guildId) {
    const stale = kazagumo.players.get(guildId);
    if (stale) {
        try { await stale.destroy(); } catch (_) { /* ignore — we wipe state manually below */ }
    }
    kazagumo.players.delete(guildId);
    try {
        const conn = kazagumo.shoukaku.connections.get(guildId);
        if (conn) {
            conn.disconnect();
            kazagumo.shoukaku.connections.delete(guildId);
        }
    } catch (_) { /* ignore */ }
}
kazagumo._forceCleanupPlayer = forceCleanupPlayer;

// Force a node to disconnect+reconnect so it gets a fresh sessionId from
// Lavalink. Used when a node's stored session has gone stale on the Lavalink
// side (e.g. after the Lavalink process restarted) — symptom is REST 404
// on /v4/sessions/<id>/players even though the WS is connected. The internal
// reconnect loop will pick the node back up, and moveOnDisconnect=true moves
// any players hosted on it to another node in the meantime.
function recycleNode(name) {
    const node = shoukaku.nodes.get(name);
    if (!node) return;
    // Skip if we already hard-killed it; that node is gone for good.
    if (nodeFlapState.get(name)?.removed) return;
    console.warn(`   └─ ♻️ Recycling node ${name} (stale session); forcing reconnect`);
    try {
        // Prefer Shoukaku's graceful disconnect — it sends a proper close frame
        // and lets moveOnDisconnect:true migrate any players to another node.
        // Internal reconnect loop will pick the node back up with a fresh sessionId.
        if (typeof node.disconnect === 'function') {
            node.disconnect(1000, 'session-stale-recycle');
        } else if (node.ws && typeof node.ws.terminate === 'function') {
            node.ws.terminate();
        }
    } catch (err) {
        console.warn(`   └─ recycleNode ${name}: ${err.message}`);
    }
}
kazagumo._recycleNode = recycleNode;

// Commands collection
client.commands = new Collection();

// Load commands
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const command = await import(`file://${filePath}`);
    if ('default' in command && command.default.data) {
        client.commands.set(command.default.data.name, command.default);
    }
}

// Shoukaku events
shoukaku.on('ready', (name) => {
    console.log(`✅ Lavalink ${name}: Connected!`);
    const state = nodeFlapState.get(name) || { readyAt: 0, flaps: 0, removed: false };
    state.readyAt = Date.now();
    nodeFlapState.set(name, state);
});

shoukaku.on('error', (name, error) => {
    console.error(`❌ Lavalink ${name}: Error -`, error);
    // 429 = rate-limited by the host. No point waiting for more flaps — kill now.
    const msg = error?.message || '';
    if (msg.includes('429')) {
        killNodeHard(name, '429-rate-limited');
    }
});

shoukaku.on('close', (name, code, reason) => {
    console.warn(`⚠️ Lavalink ${name}: Closed - Code: ${code}, Reason: ${reason || 'No reason'}`);

    const state = nodeFlapState.get(name) || { readyAt: 0, flaps: 0, removed: false, closes: [] };
    if (state.removed) return;

    const now = Date.now();
    state.closes = (state.closes || []).filter(t => now - t < STORM_WINDOW_MS);
    state.closes.push(now);

    const sinceReady = state.readyAt > 0 ? now - state.readyAt : Infinity;
    const reasonStr = String(reason ?? '');
    const isProxyClose = reasonStr.includes('proxy-close');

    if (sinceReady < FLAP_WINDOW_MS || isProxyClose) {
        state.flaps += 1;
        nodeFlapState.set(name, state);
        console.warn(`   └─ Flap detected on ${name} (${state.flaps}/${FLAP_THRESHOLD}, ${sinceReady}ms after ready, reason="${reasonStr}")`);
        if (state.flaps >= FLAP_THRESHOLD) {
            killNodeHard(name, `flapping (${state.flaps} flaps)`);
            return;
        }
    } else {
        state.flaps = 0;
    }

    // Storm guard: regardless of cause, if a node closes too many times in a short
    // window it's hosed — kill it. Catches dead-upstream proxies whose 'ready' never
    // fires AND whose close reason isn't 'proxy-close'.
    if (state.closes.length >= STORM_THRESHOLD) {
        nodeFlapState.set(name, state);
        console.warn(`   └─ Storm detected on ${name} (${state.closes.length} closes in ${STORM_WINDOW_MS}ms)`);
        killNodeHard(name, `storm (${state.closes.length} closes/${STORM_WINDOW_MS}ms)`);
        return;
    }

    nodeFlapState.set(name, state);
});

shoukaku.on('disconnect', (name, players, moved) => {
    console.warn(`⚠️ Lavalink ${name}: Disconnected - Players: ${players.length}, Moved: ${moved}`);
    // Clean up disconnected players
    if (players && players.length > 0) {
        players.forEach(player => {
            try {
                if (player && !moved) {
                    player.destroy().catch(err => {
                        console.error(`Error destroying player ${player.guildId}:`, err);
                    });
                }
            } catch (err) {
                console.error('Error handling disconnected player:', err);
            }
        });
    }
});

// Kazagumo events
kazagumo.shoukaku.on('debug', (name, info) => {
    if (typeof info === 'string' && (
        info.includes('Connection') ||
        info.includes('Player') ||
        info.includes('Error') ||
        info.includes('404') ||
        info.includes('disconnect') ||
        info.includes('Voice') ||   // show all voice-related debug
        info.includes('Session') ||
        info.includes('Server Update') ||
        info.includes('State Update')
    )) {
        console.log(`[DEBUG] ${name}:`, info);
    }
});

// Helper: extract YouTube videoId from a track's URI (returns null if not YT)
function extractYouTubeId(uri) {
    if (!uri || typeof uri !== 'string') return null;
    // youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/shorts/ID
    const m = uri.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
}

// Helper: search related songs for autoplay.
// Strategy:
//   1) If current track is YouTube → use YouTube Mix URL (RD<videoId>) which returns
//      a YouTube-curated radio playlist of similar songs. This is what powers the
//      "Radio based on X" feature in YouTube Music.
//   2) Otherwise fall back to a search by extracted artist name.
// Filters tracks already in the autoplay history to avoid loops.
async function searchAndPlayRelatedSong(player, kazagumo, client, guild) {
    const contextTrack = player._autoplayContext || player.queue.current;
    if (!contextTrack) {
        console.warn(`   └─ ⚠️ No context track available for autoplay`);
        return false;
    }
    if (!player._autoplayHistory) player._autoplayHistory = [];

    console.log(`   └─ 🔄 Autoplay searching from context: ${contextTrack.title}`);

    // Parallel search across all connected nodes, take first non-empty result.
    // Per-node timeout prevents one slow node from making the user wait minutes.
    async function searchWithFallback(rawQuery, { allowScsearch }) {
        const SEARCH_TIMEOUT_MS = 12000;
        const connectedNodes = [...kazagumo.shoukaku.nodes.values()].filter(n => n.state === 1);

        const searchOnNode = (nodeName) => new Promise((resolve) => {
            const t = setTimeout(() => resolve({ node: nodeName, tracks: [] }), SEARCH_TIMEOUT_MS);
            kazagumo.search(rawQuery, { requester: client.user, nodeName })
                .then(r => { clearTimeout(t); resolve({ node: nodeName, tracks: r?.tracks ?? [] }); })
                .catch(() => { clearTimeout(t); resolve({ node: nodeName, tracks: [] }); });
        });

        try {
            const winner = await Promise.any(connectedNodes.map(n =>
                searchOnNode(n.name).then(r => r.tracks.length ? r : Promise.reject(r))
            ));
            console.log(`   └─ 🔄 Autoplay first-to-find: ${winner.node}`);
            return winner.tracks;
        } catch (_) { /* all empty/timed out — fall through to scsearch */ }

        if (allowScsearch && !/^https?:\/\//i.test(rawQuery)) {
            try {
                const sc = await player.search(`scsearch:${rawQuery}`, { requester: client.user });
                if (sc?.tracks?.length) {
                    console.log(`   └─ 🔄 Autoplay SoundCloud fallback hit`);
                    return sc.tracks;
                }
            } catch (err) {
                console.warn(`   └─ Autoplay SoundCloud fallback failed: ${err.message}`);
            }
        }
        return [];
    }

    let candidates = [];
    try {
        const ytId = extractYouTubeId(contextTrack.uri);
        if (ytId) {
            const mixUrl = `https://www.youtube.com/watch?v=${ytId}&list=RD${ytId}`;
            console.log(`   └─ Using YouTube Mix: ${mixUrl}`);
            // Mix is a YT URL — scsearch doesn't apply, only multi-node fallback.
            candidates = await searchWithFallback(mixUrl, { allowScsearch: false });
            if (!candidates.length) console.warn(`   └─ Mix returned no tracks, falling back to artist search`);
        }

        if (candidates.length === 0) {
            // Fallback: artist-name search — multi-node + scsearch both apply.
            const artistMatch = contextTrack.title.match(/^([^-|]+)/);
            const searchQuery = artistMatch ? artistMatch[1].trim() : `radio ${contextTrack.title}`;
            console.log(`   └─ Fallback search: ${searchQuery}`);
            candidates = await searchWithFallback(searchQuery, { allowScsearch: true });
        }

        if (candidates.length === 0) {
            console.warn(`   └─ ⚠️ No autoplay candidates found`);
            return false;
        }

        // Filter: not the same as context, not already in history, not blacklisted
        const NON_MUSIC = ['how to', 'tutorial', 'guide', 'tips', 'tricks',
            'radio concierto', 'emisión en directo', 'live radio',
            'internet radio', 'licensing'];
        const historyUris = new Set(player._autoplayHistory.map(t => t.uri));
        const filtered = candidates.filter(t => {
            if (!t.uri || t.uri === contextTrack.uri) return false;
            if (historyUris.has(t.uri)) return false;
            const lower = (t.title || '').toLowerCase();
            if (NON_MUSIC.some(k => lower.includes(k))) return false;
            return true;
        });

        if (filtered.length === 0) {
            console.warn(`   └─ ⚠️ All autoplay candidates filtered out`);
            return false;
        }

        const next = filtered[0];
        console.log(`   └─ ✅ Autoplay picked: ${next.title}`);

        player._autoplayHistory.push(next);
        if (player._autoplayHistory.length > 30) player._autoplayHistory.shift();
        player._autoplayContext = next;

        const wasQueueEmpty = player.queue.length === 0 && !player.queue.current;
        await player.queue.add(next);

        if (wasQueueEmpty && !player.playing) {
            await player.play();
            await new Promise(r => setTimeout(r, 300));
        }
        return true;
    } catch (err) {
        console.error('Error in autoplay search:', err);
        return false;
    }
}

// Handle when a new track starts playing.
// We post the "Now playing" embed + control buttons here so it fires consistently
// for all start paths (manual /play, queue advance, autoplay, /resume restore, prev).
kazagumo.on('playerStart', async (player, track) => {
    try {
        const guild = client.guilds.cache.get(player.guildId);
        if (!guild) return;

        if (player.textId) {
            const channel = guild.channels.cache.get(player.textId);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('🎵 Now playing')
                    .setDescription(`**[${track.title}](${track.uri})**`)
                    .addFields(
                        { name: '👤 Requested by', value: track.requester ? `${track.requester}` : 'Autoplay', inline: true },
                        { name: '⏱️ Duration', value: track.length > 0 ? formatTime(track.length) : 'Live', inline: true }
                    )
                    .setThumbnail(track.thumbnail || null)
                    .setTimestamp();
                await channel.send({ embeds: [embed], components: buildPlayerActionRow(player) })
                    .catch(err => console.error('Error sending now playing:', err));
            }
        }

        saveGuildState(player);
    } catch (err) {
        console.error('Error in playerStart handler:', err);
    }
});

// Handle when a track ends.
// NOTE: Kazagumo automatically advances the queue and calls play() internally after
// this event fires. We must NOT call player.skip() or player.play() here for queue
// advancement — that would stop the track Kazagumo just started.
kazagumo.on('playerEnd', async (player) => {
    try {
        const guild = client.guilds.cache.get(player.guildId);
        if (!guild) {
            try { await player.destroy(); } catch (e) {}
            return;
        }

        const endedTrack = player.queue.current;
        const queueLength = player.queue.length;
        console.log(`🎵 Track ended | Guild: ${player.guildId} | Queue remaining: ${queueLength} | Was: ${endedTrack?.title}`);

        // Push to history (used by Previous button), unless we just navigated back
        if (endedTrack && !player._suppressHistoryPush) {
            if (!player._history) player._history = [];
            player._history.push(endedTrack);
            if (player._history.length > 25) player._history.shift();
        }
        player._suppressHistoryPush = false;

        if (queueLength === 0) {
            // Queue is empty — handle autoplay or schedule disconnect
            if (player._autoplay) {
                const success = await searchAndPlayRelatedSong(player, kazagumo, client, guild);
                if (!success) {
                    player._autoplay = false;
                    scheduleDisconnect(player, kazagumo);
                }
            } else {
                scheduleDisconnect(player, kazagumo);
            }
        }

        saveGuildState(player);
    } catch (error) {
        console.error('Error in playerEnd handler:', error);
    }
});

function scheduleDisconnect(player, kazagumo) {
    // 24/7 mode: never auto-disconnect on idle queue
    if (player._twentyFourSeven) return;
    // If there's already an empty-channel timer running for this guild, skip — it will handle cleanup
    if (emptyChannelTimers.has(player.guildId)) return;
    setTimeout(async () => {
        const p = kazagumo.players.get(player.guildId);
        if (!p || p._twentyFourSeven || p.playing || p.queue.length !== 0) return;
        try {
            await p.destroy();
        } catch (err) {
            // destroy() can fail mid-flight (e.g. DNS EAI_AGAIN on the REST call);
            // when that happens the player is stuck in DESTROYING state. Wipe it
            // forcefully so the next /play doesn't trip on a zombie entry.
            console.error('Error destroying inactive player:', err);
            await forceCleanupPlayer(player.guildId);
        }
    }, 3600000); // 1 hour of inactivity
}

// Handle player errors
kazagumo.on('playerException', async (player, error) => {
    console.error(`Player error in guild ${player.guildId}:`, error);
    // Log more details about the error
    if (error.message) {
        console.error(`Error message: ${error.message}`);
    }
    const status = error.status || error.response?.status;
    if (status) {
        console.error(`Error status: ${status}`);
    }
    
    // Don't destroy player on every error, just log it
    // Server errors (5xx) indicate Lavalink issues, not player issues
    if (status >= 500 && status < 600) {
        console.error(`⚠️ Lavalink server error ${status} for guild ${player.guildId}. Server may be having issues.`);
    } else if (status === 404 || error.message?.includes('404')) {
        console.warn(`404 error detected, player may need to reconnect for guild ${player.guildId}`);
    }
});

// Handle player disconnect
kazagumo.on('playerDestroy', (player) => {
    console.log(`Player destroyed for guild ${player.guildId}`);
    // Cancel any pending auto-disconnect timers so they don't linger in memory
    cancelEmptyChannelDisconnect(player.guildId);
});

// Track per-guild "empty channel" disconnect timers
const emptyChannelTimers = new Map();

function scheduleEmptyChannelDisconnect(guildId) {
    if (emptyChannelTimers.has(guildId)) return; // already scheduled
    const player = kazagumo.players.get(guildId);
    if (player?._twentyFourSeven) return; // 24/7 mode: stay even if alone
    console.log(`🔇 Voice channel empty in guild ${guildId}, disconnecting in 1 hour`);
    const timer = setTimeout(async () => {
        emptyChannelTimers.delete(guildId);
        const p = kazagumo.players.get(guildId);
        if (!p || p._twentyFourSeven) return;
        try {
            p.queue.clear();
            await p.destroy();
            console.log(`🔇 Disconnected from empty channel in guild ${guildId} after 1 hour`);
        } catch (err) {
            console.error('Error disconnecting from empty channel:', err);
        }
    }, 3600000); // 1 hour
    emptyChannelTimers.set(guildId, timer);
}

// Periodically snapshot player state so /resume can pick up where we left off
// even after a host-side restart. Runs every 30 seconds.
setInterval(() => {
    for (const player of kazagumo.players.values()) {
        if (player.playing || player.paused) saveGuildState(player);
    }
}, 30000);

function cancelEmptyChannelDisconnect(guildId) {
    const timer = emptyChannelTimers.get(guildId);
    if (timer) {
        clearTimeout(timer);
        emptyChannelTimers.delete(guildId);
        console.log(`✅ Someone joined in guild ${guildId}, cancelled empty-channel timer`);
    }
}

// Detect when users join/leave the bot's voice channel
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guildId = oldState.guild.id;
    const player = kazagumo.players.get(guildId);

    // Check if a human user left/joined the bot's channel
    if (newState.member?.id !== client.user?.id && player?.voiceId) {
        const botChannelId = player.voiceId;
        const channel = oldState.guild.channels.cache.get(botChannelId);
        if (!channel) return;

        const humanCount = channel.members.filter(m => !m.user.bot).size;

        if (humanCount === 0) {
            scheduleEmptyChannelDisconnect(guildId);
        } else {
            cancelEmptyChannelDisconnect(guildId);
        }
        return;
    }

    // Detect when bot itself is manually disconnected from voice channel
    if (newState.member?.id !== client.user?.id) return;

    // If bot was disconnected from voice channel (channel changed from something to null)
    if (oldState.channelId && !newState.channelId && player) {
        console.log(`⚠️ Bot was manually disconnected from voice channel in guild ${guildId}`);
        // Add a longer delay to avoid race conditions during initial connection
        // During initial connection, Discord may temporarily disconnect/reconnect
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Re-check player still exists after delay
        const currentPlayer = kazagumo.players.get(guildId);
        if (!currentPlayer) return; // Player already destroyed
        
        // Verify bot is still not in a channel
        const guild = newState.guild;
        const botMember = guild.members.cache.get(client.user.id);
        if (botMember?.voice?.channel) {
            console.log(`Bot reconnected to channel ${botMember.voice.channel.id}, not destroying player`);
            return;
        }
        
        // Only destroy if we're sure the bot is not in any channel
        // This prevents destroying the player during initial connection phase
        try {
            // Check if player is already destroyed by checking if it has required properties
            if (currentPlayer.voiceId && currentPlayer.guildId) {
                await currentPlayer.destroy().catch(err => {
                    // Only log if it's not an "already destroyed" error
                    if (!err.message?.includes('already destroyed') && err.code !== 1) {
                        console.error(`Error destroying player after manual disconnect:`, err);
                    }
                });
            }
        } catch (err) {
            // Player might already be destroyed, ignore
            if (!err.message?.includes('already destroyed') && err.code !== 1) {
                console.error(`Error checking player state:`, err);
            }
        }
    }
});

// Helper function to format time
function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Discord events
client.once('ready', () => {
    console.log(`🤖 Bot connected as ${client.user.tag}!`);
    console.log(`📊 Servers: ${client.guilds.cache.size}`);
});

// Also listen to the new event (to avoid the warning)
client.once('clientReady', () => {
    console.log(`✅ Client fully ready!`);
});

client.on('interactionCreate', async interaction => {
    // Slash commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction, kazagumo);
        } catch (error) {
            console.error('Error executing command:', error);
            const reply = {
                content: '❌ There was an error executing this command!',
                flags: 64
            };
            if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
            else await interaction.reply(reply);
        }
        return;
    }

    // Music control buttons
    if (interaction.isButton() && interaction.customId.startsWith('music_')) {
        await handleMusicButton(interaction).catch(err => console.error('Button handler error:', err));
    }
});

// Button handler: shares the same voice-channel validations as slash commands.
async function handleMusicButton(interaction) {
    const player = kazagumo.players.get(interaction.guild.id);
    if (!player) {
        return interaction.reply({ content: '❌ No music is currently playing!', flags: 64 });
    }
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel || player.voiceId !== voiceChannel.id) {
        return interaction.reply({ content: '❌ You must be in the same voice channel as the bot!', flags: 64 });
    }

    const id = interaction.customId;
    try {
        switch (id) {
            case 'music_pause': {
                if (player.paused) {
                    await player.pause(false);
                    await interaction.reply({ content: '▶️ Resumed', flags: 64 });
                } else {
                    await player.pause(true);
                    await interaction.reply({ content: '⏸️ Paused', flags: 64 });
                }
                saveGuildState(player);
                interaction.message?.edit({ components: buildPlayerActionRow(player) }).catch(() => {});
                break;
            }
            case 'music_skip': {
                const current = player.queue.current;
                await player.skip();
                await interaction.reply({ content: `⏭️ Skipped: **${current?.title ?? 'Unknown'}**`, flags: 64 });
                break;
            }
            case 'music_prev': {
                const history = player._history || [];
                if (history.length === 0) {
                    return interaction.reply({ content: '❌ No previous track in history!', flags: 64 });
                }
                const prev = history.pop();
                const current = player.queue.current;
                // Re-queue: prev → current → rest_of_queue, then skip
                if (current) player.queue.unshift(current);
                player.queue.unshift(prev);
                player._suppressHistoryPush = true; // current goes back to queue, not history
                await player.skip();
                await interaction.reply({ content: `⏮️ Going back to: **${prev.title}**`, flags: 64 });
                break;
            }
            case 'music_shuffle': {
                if (player.queue.length === 0) {
                    return interaction.reply({ content: '❌ Queue is empty, nothing to shuffle!', flags: 64 });
                }
                if (typeof player.queue.shuffle === 'function') {
                    player.queue.shuffle();
                } else {
                    for (let i = player.queue.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [player.queue[i], player.queue[j]] = [player.queue[j], player.queue[i]];
                    }
                }
                saveGuildState(player);
                await interaction.reply({ content: `🔀 Queue shuffled (${player.queue.length} tracks)`, flags: 64 });
                break;
            }
            case 'music_loop': {
                const order = ['none', 'track', 'queue'];
                const cur = player._loopMode || 'none';
                const next = order[(order.indexOf(cur) + 1) % order.length];
                player._loopMode = next;
                if (typeof player.setLoop === 'function') {
                    try { player.setLoop(next); } catch (e) { /* shouldn't fail */ }
                }
                saveGuildState(player);
                await interaction.reply({ content: `🔁 Loop mode: **${next}**`, flags: 64 });
                interaction.message?.edit({ components: buildPlayerActionRow(player) }).catch(() => {});
                break;
            }
            case 'music_stop': {
                deleteGuildState(player.guildId);
                player.queue.clear();
                await player.destroy();
                await interaction.reply({ content: '⏹️ Stopped and disconnected.', flags: 64 });
                break;
            }
            case 'music_queue': {
                const current = player.queue.current;
                const upcoming = [...player.queue].slice(0, 10);
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('📋 Queue')
                    .setDescription(current ? `**Now playing:** [${current.title}](${current.uri})` : 'Nothing playing')
                    .setTimestamp();
                if (upcoming.length > 0) {
                    const list = upcoming.map((t, i) => `**${i + 1}.** [${t.title}](${t.uri})`).join('\n');
                    embed.addFields({ name: `Upcoming (${player.queue.length} total)`, value: list.length > 1024 ? list.slice(0, 1021) + '...' : list });
                }
                await interaction.reply({ embeds: [embed], flags: 64 });
                break;
            }
            default:
                await interaction.reply({ content: '❌ Unknown button.', flags: 64 });
        }
    } catch (err) {
        console.error(`Button ${id} failed:`, err);
        const reply = { content: '❌ Action failed.', flags: 64 };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
    }
}

// Improved error handling for hosting
process.on('unhandledRejection', (error, promise) => {
    console.error('Unhandled promise rejection:', error);
    // Log more details if available
    if (error.stack) {
        console.error('Stack trace:', error.stack);
    }
    // Don't close the process in hosting, just log
    // This prevents the bot from crashing on unhandled rejections
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    if (error.stack) {
        console.error('Stack trace:', error.stack);
    }
    // Don't close the process in hosting, just log
    // This prevents the bot from crashing on uncaught exceptions
});

// Graceful shutdown handling (useful for hosting)
process.on('SIGINT', () => {
    console.log('\n🛑 Closing bot...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Closing bot...');
    client.destroy();
    process.exit(0);
});

// Verify token is present before starting
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN not found in environment variables!');
    console.error('💡 Make sure to configure DISCORD_TOKEN in your Wispbyte panel');
    process.exit(1);
}

// Start bot
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('❌ Error logging in:', error.message);
    console.error('💡 Verify that DISCORD_TOKEN is correct');
    process.exit(1);
});
