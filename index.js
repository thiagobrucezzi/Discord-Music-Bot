import { Client, GatewayIntentBits, Collection, EmbedBuilder } from 'discord.js';
import { Shoukaku, Connectors } from 'shoukaku';
import { Kazagumo } from 'kazagumo';
import { config } from 'dotenv';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
}

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

// Helper function to search and play related songs for autoplay
async function searchAndPlayRelatedSong(player, kazagumo, client, guild) {
    // Use autoplay context if available, otherwise use current track
    const contextTrack = player._autoplayContext || player.queue.current;
    
    if (!contextTrack) {
        console.warn(`   └─ ⚠️ No context track available for autoplay`);
        return false;
    }
    
    // Initialize autoplay history if it doesn't exist
    if (!player._autoplayHistory) {
        player._autoplayHistory = [];
    }
    
    console.log(`   └─ 🔄 Autoplay enabled, searching for related songs...`);
    console.log(`   └─ Using context: ${contextTrack.title}`);
    
    try {
        // Extract artist name from track title for better search
        // Format is usually "Artist - Song" or "Artist | Song"
        let searchQuery = contextTrack.title;
        
        // Try to extract artist name
        const artistMatch = contextTrack.title.match(/^([^-|]+)/);
        if (artistMatch) {
            const artistName = artistMatch[1].trim();
            // Use artist name for better music-focused results
            searchQuery = artistName;
            console.log(`   └─ Extracted artist: ${artistName}`);
        } else {
            // Fallback to radio mode
            searchQuery = `radio ${contextTrack.title}`;
        }
        
        console.log(`   └─ Searching: ${searchQuery}`);
        
        const result = await kazagumo.search(searchQuery, {
            requester: client.user
        });

        if (result.tracks && result.tracks.length > 0) {
            // Filter out tracks that are duplicates, in history, or not music-related
            const relatedTracks = result.tracks.filter(track => {
                // Exclude if same URI
                if (track.uri === contextTrack.uri || 
                    (player.queue.current && track.uri === player.queue.current.uri)) {
                    return false;
                }
                
                // Exclude if same title (case insensitive)
                const trackTitleLower = track.title.toLowerCase();
                const contextTitleLower = contextTrack.title.toLowerCase();
                if (trackTitleLower === contextTitleLower) {
                    return false;
                }
                
                // Exclude non-music content (tutorials, guides, radio streams, etc.)
                const nonMusicKeywords = [
                    'how to', 'tutorial', 'guide', 'tips', 'tricks',
                    'radio concierto', 'emisión en directo', 'live radio',
                    'internet radio', 'licensing', 'keyfob', 'volvo',
                    'things you didn\'t know', 'cassette - radio'
                ];
                const isNonMusic = nonMusicKeywords.some(keyword => 
                    trackTitleLower.includes(keyword)
                );
                if (isNonMusic) {
                    return false;
                }
                
                // Exclude if in history (check URI and similar titles)
                const inHistory = player._autoplayHistory.some(historyTrack => {
                    if (historyTrack.uri === track.uri) return true;
                    // Check if titles are very similar (same artist/session)
                    const historyTitleLower = historyTrack.title.toLowerCase();
                    // If titles share significant words, consider them duplicates
                    const trackWords = trackTitleLower.split(/\s+/).filter(w => w.length > 3);
                    const historyWords = historyTitleLower.split(/\s+/).filter(w => w.length > 3);
                    const commonWords = trackWords.filter(w => historyWords.includes(w));
                    // If more than 2 significant words match, likely same song
                    if (commonWords.length >= 2) return true;
                    return false;
                });
                
                return !inHistory;
            });

            if (relatedTracks.length > 0) {
                // Take the first related track
                const relatedTrack = relatedTracks[0];
                console.log(`   └─ ✅ Found related song: ${relatedTrack.title}`);
                
                // Add to history (keep last 10 songs)
                player._autoplayHistory.push(relatedTrack);
                if (player._autoplayHistory.length > 10) {
                    player._autoplayHistory.shift(); // Remove oldest
                }
                
                // Update autoplay context to the new track
                player._autoplayContext = relatedTrack;
                
                // Check if queue is empty before adding
                const wasQueueEmpty = player.queue.length === 0;
                
                // Add to queue
                await player.queue.add(relatedTrack);
                
                // If queue was empty, we need to advance to the new track
                if (wasQueueEmpty && player.queue.current) {
                    await player.skip();
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                // Play the track
                if (!player.playing) {
                    await player.play();
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                // Send notification
                if (player.textId) {
                    const channel = guild.channels.cache.get(player.textId);
                    if (channel) {
                        const embed = new EmbedBuilder()
                            .setColor(0x5865F2)
                            .setTitle('🔄 Autoplay')
                            .setDescription(`**Playing related song:**\n[${relatedTrack.title}](${relatedTrack.uri})`)
                            .addFields(
                                { name: '⏱️ Duration', value: relatedTrack.length > 0 ? formatTime(relatedTrack.length) : 'Live', inline: true }
                            )
                            .setThumbnail(relatedTrack.thumbnail || null)
                            .setTimestamp();
                        
                        try {
                            await channel.send({ embeds: [embed] });
                            console.log(`   └─ ✅ Autoplay: Playing ${relatedTrack.title}`);
                        } catch (error) {
                            console.error('Error sending autoplay notification:', error);
                        }
                    }
                }
                return true;
            } else {
                console.warn(`   └─ ⚠️ No different related songs found`);
                return false;
            }
        } else {
            console.warn(`   └─ ⚠️ No related songs found`);
            return false;
        }
    } catch (autoplayError) {
        console.error('Error in autoplay search:', autoplayError);
        return false;
    }
}

// Handle when a track ends
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

        const queueLength = player.queue.length;
        const endedTrack = player.queue.current;

        console.log(`🎵 Track ended | Guild: ${player.guildId} | Queue remaining: ${queueLength} | Was: ${endedTrack?.title}`);

        if (queueLength > 0) {
            // Kazagumo already plays the next track automatically.
            // Wait briefly for it to advance, then send a "now playing" notification.
            await new Promise(resolve => setTimeout(resolve, 400));
            const nextTrack = player.queue.current;
            if (nextTrack && player.textId) {
                const channel = guild.channels.cache.get(player.textId);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('🎵 Now playing')
                        .setDescription(`**[${nextTrack.title}](${nextTrack.uri})**`)
                        .addFields(
                            { name: '👤 Requested by', value: `${nextTrack.requester}`, inline: true },
                            { name: '⏱️ Duration', value: nextTrack.length > 0 ? formatTime(nextTrack.length) : 'Live', inline: true }
                        )
                        .setThumbnail(nextTrack.thumbnail || null)
                        .setTimestamp();
                    await channel.send({ embeds: [embed] }).catch(err => console.error('Error sending now playing:', err));
                }
            }
        } else {
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
    } catch (error) {
        console.error('Error in playerEnd handler:', error);
    }
});

function scheduleDisconnect(player, kazagumo) {
    // If there's already an empty-channel timer running for this guild, skip — it will handle cleanup
    if (emptyChannelTimers.has(player.guildId)) return;
    setTimeout(async () => {
        try {
            const p = kazagumo.players.get(player.guildId);
            if (p && !p.playing && p.queue.length === 0) await p.destroy();
        } catch (err) {
            console.error('Error destroying inactive player:', err);
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
    console.log(`🔇 Voice channel empty in guild ${guildId}, disconnecting in 1 hour`);
    const timer = setTimeout(async () => {
        emptyChannelTimers.delete(guildId);
        const player = kazagumo.players.get(guildId);
        if (!player) return;
        try {
            player.queue.clear();
            await player.destroy();
            console.log(`🔇 Disconnected from empty channel in guild ${guildId} after 1 hour`);
        } catch (err) {
            console.error('Error disconnecting from empty channel:', err);
        }
    }, 3600000); // 1 hour
    emptyChannelTimers.set(guildId, timer);
}

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
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction, kazagumo);
    } catch (error) {
        console.error('Error executing command:', error);
        const reply = { 
            content: '❌ There was an error executing this command!', 
            flags: 64 // Ephemeral flag (MessageFlags.Ephemeral = 64)
        };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
        } else {
            await interaction.reply(reply);
        }
    }
});

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
