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

// Lavalink nodes configuration
const lavalinkUrl = process.env.LAVALINK_URL || 'localhost:2333';
const lavalinkPort = parseInt(lavalinkUrl.split(':')[1]) || 2333;
// If port is 443 or specified as secure, use secure connection
const isSecure = process.env.LAVALINK_SECURE === 'true' || lavalinkPort === 443;

const nodes = [
    {
        name: 'lavalink',
        url: lavalinkUrl,
        auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
        secure: isSecure
    }
];

console.log(`🔗 Lavalink Configuration: ${lavalinkUrl} (secure: ${isSecure})`);

// Create Discord.js connector
const connector = new Connectors.DiscordJS(client);

// Initialize Kazagumo
// Kazagumo creates Shoukaku internally, we only need to pass the connector
const kazagumo = new Kazagumo(
    {
        defaultSearchEngine: 'youtube',
        send: (guildId, payload) => {
            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        }
    },
    connector,  // Second parameter: the connector
    nodes,     // Third parameter: Lavalink nodes
    {          // Fourth parameter: Shoukaku options
        moveOnDisconnect: false,
        resumable: false,
        resumableTimeout: 30,
        reconnectTries: 5, // Increase reconnection tries
        reconnectInterval: 5000, // Wait 5 seconds between reconnection attempts
        restTimeout: 15000 // Increase timeout to 15 seconds for slow servers
    }
);

// Get Shoukaku instance from Kazagumo for events
const shoukaku = kazagumo.shoukaku;

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
});

shoukaku.on('error', (name, error) => {
    console.error(`❌ Lavalink ${name}: Error -`, error);
    // Don't crash on Lavalink errors, just log them
});

shoukaku.on('close', (name, code, reason) => {
    console.warn(`⚠️ Lavalink ${name}: Closed - Code: ${code}, Reason: ${reason || 'No reason'}`);
    // Attempt to reconnect automatically
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
    // Only log important debug messages to avoid spam
    if (typeof info === 'string' && (
        info.includes('Connection') || 
        info.includes('Player') || 
        info.includes('Error') ||
        info.includes('404') ||
        info.includes('disconnect')
    )) {
        console.log(`[DEBUG] ${name}:`, info);
    }
});

// Handle when a track ends - automatically play next song in queue
kazagumo.on('playerEnd', async (player) => {
    try {
        const guild = client.guilds.cache.get(player.guildId);
        if (!guild) {
            // Guild not found, destroy player
            try {
                await player.destroy();
            } catch (err) {
                console.error('Error destroying player for missing guild:', err);
            }
            return;
        }

        // If there are more songs in the queue, play the next one
        const queueLength = player.queue.length;
        const currentTrackBefore = player.queue.current;
        
        console.log(`🎵 Track ended | Guild: ${player.guildId} | Queue length: ${queueLength} | Current track: ${currentTrackBefore?.title} | Playing: ${player.playing}`);
        
        if (queueLength > 0) {
            try {
                // Get the next track from the queue using slice (like queue.js does)
                const nextTracks = player.queue.slice(0, 1);
                const nextTrackInQueue = nextTracks[0];
                
                console.log(`   └─ Next track in queue: ${nextTrackInQueue?.title}`);
                
                if (!nextTrackInQueue) {
                    console.warn(`   └─ ⚠️ No next track found in queue!`);
                    return;
                }
                
                // Check if a manual skip was already performed
                // This prevents double-skip when skip command was used
                if (player._manualSkip && player._manualSkipNextTrack) {
                    const manualNextTrack = player._manualSkipNextTrack;
                    const currentTrack = player.queue.current;
                    
                    // If we're already on the track that was manually skipped to, don't process
                    if (currentTrack && (currentTrack === manualNextTrack || currentTrack.title === manualNextTrack.title)) {
                        // Clear the flag and skip processing
                        player._manualSkip = false;
                        player._manualSkipNextTrack = null;
                        return;
                    }
                }
                
                // Check if the next track is already playing (might have been manually skipped)
                // If current track is already the next one and it's playing, don't do anything
                if (player.queue.current === nextTrackInQueue && player.playing) {
                    console.log(`   └─ Next track already playing, skipping playerEnd processing`);
                    return;
                }
                
                // Skip to advance the queue - this should move nextTrackInQueue to current
                console.log(`   └─ Calling skip() to advance queue...`);
                await player.skip();
                
                // Wait for queue to update
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Verify the current track changed
                const currentTrackAfter = player.queue.current;
                const queueLengthAfter = player.queue.length;
                
                console.log(`   └─ After skip() | Current: ${currentTrackAfter?.title} | Queue length: ${queueLengthAfter}`);
                
                // Check if we need to play
                if (!player.playing) {
                    console.log(`   └─ Not playing, calling play()...`);
                    await player.play();
                    
                    // Wait and verify
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const isPlaying = player.playing;
                    const finalTrack = player.queue.current;
                    
                    console.log(`   └─ After play() | Playing: ${isPlaying} | Current: ${finalTrack?.title}`);
                    
                    // Send notification if track changed and is playing
                    if (finalTrack && finalTrack !== currentTrackBefore && isPlaying && player.textId) {
                        const channel = guild.channels.cache.get(player.textId);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setColor(0x5865F2)
                                .setTitle('🎵 Now playing')
                                .setDescription(`**[${finalTrack.title}](${finalTrack.uri})**`)
                                .addFields(
                                    { name: '👤 Requested by', value: `${finalTrack.requester}`, inline: true },
                                    { name: '⏱️ Duration', value: finalTrack.length > 0 ? formatTime(finalTrack.length) : 'Live', inline: true }
                                )
                                .setThumbnail(finalTrack.thumbnail || null)
                                .setTimestamp();
                            
                            try {
                                await channel.send({ embeds: [embed] });
                                console.log(`   └─ ✅ Sent notification for: ${finalTrack.title}`);
                            } catch (error) {
                                console.error('Error sending next track notification:', error);
                            }
                        }
                    } else if (finalTrack === currentTrackBefore) {
                        console.warn(`   └─ ⚠️ Track didn't advance, still on: ${currentTrackBefore?.title}`);
                    } else if (!isPlaying) {
                        console.warn(`   └─ ⚠️ Track changed but not playing! Current: ${finalTrack?.title}`);
                    }
                } else {
                    // Already playing, just send notification
                    const finalTrack = player.queue.current;
                    if (finalTrack && finalTrack !== currentTrackBefore && player.textId) {
                        const channel = guild.channels.cache.get(player.textId);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setColor(0x5865F2)
                                .setTitle('🎵 Now playing')
                                .setDescription(`**[${finalTrack.title}](${finalTrack.uri})**`)
                                .addFields(
                                    { name: '👤 Requested by', value: `${finalTrack.requester}`, inline: true },
                                    { name: '⏱️ Duration', value: finalTrack.length > 0 ? formatTime(finalTrack.length) : 'Live', inline: true }
                                )
                                .setThumbnail(finalTrack.thumbnail || null)
                                .setTimestamp();
                            
                            try {
                                await channel.send({ embeds: [embed] });
                                console.log(`   └─ ✅ Sent notification for: ${finalTrack.title}`);
                            } catch (error) {
                                console.error('Error sending next track notification:', error);
                            }
                        }
                    }
                }
            } catch (playError) {
                console.error('Error playing next track:', playError);
                if (playError.message) {
                    console.error(`   └─ Error message: ${playError.message}`);
                }
                if (playError.status) {
                    console.error(`   └─ Error status: ${playError.status}`);
                }
                // Try to continue with next track or destroy player if persistent error
            }
        } else {
            // No more songs, disconnect after a delay
            setTimeout(async () => {
                try {
                    const currentPlayer = kazagumo.players.get(player.guildId);
                    if (currentPlayer && !currentPlayer.playing && currentPlayer.queue.size === 0) {
                        await currentPlayer.destroy();
                    }
                } catch (err) {
                    console.error('Error destroying inactive player:', err);
                }
            }, 3600000); // Disconnect after 1 hour of inactivity
        }
    } catch (error) {
        console.error('Error in playerEnd handler:', error);
    }
});

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
});

// Detect when bot is manually disconnected from voice channel
client.on('voiceStateUpdate', async (oldState, newState) => {
    // Only care about the bot's own voice state
    if (newState.member?.id !== client.user?.id) return;

    const guildId = newState.guild.id;
    const player = kazagumo.players.get(guildId);

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
