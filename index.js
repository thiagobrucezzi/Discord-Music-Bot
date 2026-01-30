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

        // Check if a manual skip was performed - if so, skip processing
        // This prevents double skip when skip command already handled it
        if (player._manualSkip && player._manualSkipTime) {
            const timeSinceSkip = Date.now() - player._manualSkipTime;
            // Only ignore if skip happened recently (within last 3 seconds)
            if (timeSinceSkip < 3000) {
                console.log(`   └─ Manual skip in progress, skipping playerEnd processing`);
                // Don't return yet - wait a bit and check if track actually changed
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Check if track changed - if so, clear flag and let it play
                const currentTrack = player.queue.current;
                const expectedTrack = player._manualSkipNextTrack;
                if (currentTrack && expectedTrack && 
                    (currentTrack.uri === expectedTrack.uri || currentTrack.title === expectedTrack.title)) {
                    // Track is correct, clear flag and let it continue
                    player._manualSkip = false;
                    player._manualSkipNextTrack = null;
                    player._manualSkipTime = null;
                    console.log(`   └─ Track changed correctly, clearing skip flag`);
                    return; // Don't process further - track is already playing
                }
                // If track didn't change, continue with normal processing
                player._manualSkip = false;
                player._manualSkipNextTrack = null;
                player._manualSkipTime = null;
            }
        }

        // If there are more songs in the queue, play the next one
        const queueLength = player.queue.length;
        const currentTrackBefore = player.queue.current;
        
        console.log(`🎵 Track ended | Guild: ${player.guildId} | Queue length: ${queueLength} | Current track: ${currentTrackBefore?.title} | Playing: ${player.playing}`);
        
        // Check if autoplay was handled by skip command
        // If skip just added a related song, we should let that song play
        // and only process autoplay again when that related song ends
        if (player._autoplayHandledBySkip) {
            const skipTrack = player._autoplaySkipTrack;
            const relatedTrack = player._autoplayRelatedTrack;
            
            // If the current track is the one that was skipped (the original track)
            // Skip already handled autoplay, so don't process again
            if (skipTrack && currentTrackBefore && 
                (currentTrackBefore.uri === skipTrack.uri || currentTrackBefore.title === skipTrack.title)) {
                console.log(`   └─ Skipped track ended, autoplay already handled by skip, skipping playerEnd processing`);
                // Don't clear the flag yet - wait until the related song ends
                return;
            }
            
            // If there are songs in queue and we have a related track from skip
            // Check if the next track is the one that skip added
            if (queueLength > 0 && relatedTrack) {
                const nextTracks = player.queue.slice(0, 1);
                const nextTrackInQueue = nextTracks[0];
                
                // If the next track is the related one that skip added, don't process autoplay
                if (nextTrackInQueue && 
                    (nextTrackInQueue.uri === relatedTrack.uri || nextTrackInQueue.title === relatedTrack.title)) {
                    console.log(`   └─ Autoplay handled by skip, related song in queue, skipping autoplay processing`);
                    // Continue with normal queue processing, but don't process autoplay
                    // The flag will be cleared when the related song ends
                }
            }
        }
        
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
                
                // Check if the next track is already playing (might have been manually skipped)
                const currentPlayingTrack = player.queue.current;
                if (currentPlayingTrack && nextTrackInQueue && player.playing) {
                    if (currentPlayingTrack.uri === nextTrackInQueue.uri || 
                        currentPlayingTrack.title === nextTrackInQueue.title) {
                        console.log(`   └─ Next track already playing, skipping playerEnd processing`);
                        return;
                    }
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
            // No more songs in queue
            // Check if autoplay is enabled
            if (player._autoplay) {
                // If autoplay was handled by skip, check if we should clear the flag
                // The flag should be cleared when the related song (added by skip) ends
                if (player._autoplayHandledBySkip) {
                    const relatedTrack = player._autoplayRelatedTrack;
                    // If current track is the related song that skip added, clear the flag
                    // This means the related song just ended, so we can process autoplay normally now
                    if (currentTrackBefore && relatedTrack && 
                        (currentTrackBefore.uri === relatedTrack.uri || 
                         currentTrackBefore.title === relatedTrack.title)) {
                        console.log(`   └─ Related song from skip ended, clearing flag and processing autoplay`);
                        player._autoplayHandledBySkip = false;
                        player._autoplaySkipTrack = null;
                        player._autoplayRelatedTrack = null;
                    } else {
                        // Still on the skipped track or flag mismatch, don't process autoplay
                        console.log(`   └─ Autoplay handled by skip, waiting for related song to end`);
                        return;
                    }
                }
                
                // Process autoplay normally
                const success = await searchAndPlayRelatedSong(player, kazagumo, client, guild);
                if (!success) {
                    // Disable autoplay if no more related songs
                    player._autoplay = false;
                    // Disconnect after a delay if no more music
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
            } else {
                // Autoplay disabled or no current track, disconnect after a delay
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
