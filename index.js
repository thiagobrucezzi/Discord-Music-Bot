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
        reconnectTries: 2,
        restTimeout: 10000
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
    console.log(`[DEBUG] ${name}:`, info);
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
        if (player.queue.size > 0) {
            try {
                await player.play();
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
                        
                        try {
                            await channel.send({ embeds: [embed] });
                        } catch (error) {
                            console.error('Error sending next track notification:', error);
                        }
                    }
                }
            } catch (playError) {
                console.error('Error playing next track:', playError);
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
    // Don't destroy player on every error, just log it
});

// Handle player disconnect
kazagumo.on('playerDestroy', (player) => {
    console.log(`Player destroyed for guild ${player.guildId}`);
});

// Detect when bot is manually disconnected from voice channel
client.on('voiceStateUpdate', (oldState, newState) => {
    // Only care about the bot's own voice state
    if (newState.member?.id !== client.user?.id) return;

    const guildId = newState.guild.id;
    const player = kazagumo.players.get(guildId);

    // If bot was disconnected from voice channel (channel changed from something to null)
    if (oldState.channelId && !newState.channelId && player) {
        console.log(`⚠️ Bot was manually disconnected from voice channel in guild ${guildId}`);
        // Destroy the player to clean up state, but check if it's already destroyed
        try {
            // Check if player is already destroyed by checking if it has required properties
            if (player.voiceId && player.guildId) {
                player.destroy().catch(err => {
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
