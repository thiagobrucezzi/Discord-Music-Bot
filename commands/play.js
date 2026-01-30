import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays a song or adds to queue')
        .addStringOption(option =>
            option.setName('song')
                .setDescription('Song name or URL')
                .setRequired(true)
        ),
    
    async execute(interaction, kazagumo) {
        await interaction.deferReply();

        // Try both 'song' and 'cancion' to support both old and new command registrations
        const query = interaction.options.getString('song') || interaction.options.getString('cancion');
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        console.log(`🎵 Play command | Guild: ${interaction.guild.id} | User: ${interaction.user.tag} | Query: ${query}`);

        if (!voiceChannel) {
            return interaction.editReply('❌ You must be in a voice channel to use this command!');
        }

        try {
            // Check if player already exists for this guild
            let player = kazagumo.players.get(interaction.guild.id);

            // Verify bot is actually in the voice channel
            const guild = interaction.guild;
            const botMember = guild.members.cache.get(interaction.client.user.id);
            const botVoiceChannel = botMember?.voice?.channel;

            if (player) {
                // Check if bot is actually connected to a voice channel
                if (!botVoiceChannel) {
                    // Bot is not in any channel, but player exists - destroy it
                    console.log('Bot not in voice channel but player exists, destroying player');
                    try {
                        await player.destroy();
                        player = null;
                    } catch (destroyError) {
                        console.error('Error destroying disconnected player:', destroyError);
                        player = null;
                    }
                } else if (player.voiceId !== voiceChannel.id) {
                    // Player exists but is in different channel - move it
                    try {
                        await player.setVoiceChannel(voiceChannel.id);
                    } catch (error) {
                        console.error('Error moving player to new channel:', error);
                        // If move fails, destroy old player and create new one
                        try {
                            await player.destroy();
                            player = null;
                        } catch (destroyError) {
                            console.error('Error destroying old player:', destroyError);
                            player = null;
                        }
                    }
                }
                
                // Update text channel if player still exists
                if (player) {
                    player.setTextChannel(interaction.channel.id);
                }
            }

            // Create new player if it doesn't exist or was destroyed
            if (!player) {
                try {
                    player = await kazagumo.createPlayer({
                        guildId: interaction.guild.id,
                        voiceId: voiceChannel.id,
                        textId: interaction.channel.id,
                        deaf: true
                    });
                } catch (createError) {
                    console.error('Error creating player:', createError);
                    // If player creation fails, try to get existing player again
                    player = kazagumo.players.get(interaction.guild.id);
                    if (!player) {
                        return interaction.editReply('❌ Could not connect to voice channel. Please try again!');
                    }
                }
            }

            // Search for the track
            console.log(`   └─ Searching for: ${query}`);
            const result = await kazagumo.search(query, {
                requester: interaction.user
            });

            if (!result.tracks.length) {
                console.log(`   └─ ❌ No results found`);
                return interaction.editReply('❌ No results found for your search!');
            }

            const track = result.tracks[0];
            const queueLengthBefore = player.queue.length;
            const isCurrentlyPlaying = player.playing || player.paused;
            const currentTrack = player.queue.current;
            
            console.log(`   └─ Found: ${track.title}`);
            console.log(`   └─ Queue before: ${queueLengthBefore} tracks | Currently playing: ${isCurrentlyPlaying ? currentTrack?.title : 'Nothing'}`);
            
            await player.queue.add(track);
            
            // Update autoplay context when a song is manually added
            // This ensures autoplay uses the latest manually added song as context
            if (player._autoplay) {
                player._autoplayContext = track;
                console.log(`   └─ 🔄 Updated autoplay context to: ${track.title}`);
            }
            
            const queueLengthAfter = player.queue.length;
            console.log(`   └─ ✅ Added to queue | Queue now: ${queueLengthAfter} tracks`);

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🎵 Song added')
                .setDescription(`**[${track.title}](${track.uri})**`)
                .addFields(
                    { name: '👤 Requested by', value: `${interaction.user}`, inline: true },
                    { name: '⏱️ Duration', value: track.length > 0 ? formatTime(track.length) : 'Live', inline: true }
                )
                .setThumbnail(track.thumbnail || null)
                .setTimestamp();

            if (!player.playing && !player.paused) {
                try {
                    console.log(`   └─ Starting playback: ${track.title}`);
                    await player.play();
                    embed.setDescription(`🎵 **Now playing:** [${track.title}](${track.uri})`);
                    console.log(`   └─ ✅ Now playing: ${track.title}`);
                } catch (playError) {
                    console.error(`   └─ ❌ Error starting playback:`, playError);
                    // Don't fail the command if play fails, just show the track was added
                }
            } else {
                console.log(`   └─ Track added to queue (${queueLengthAfter} total). Currently playing: ${currentTrack?.title}`);
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in play:', error);
            
            // More specific error messages
            let errorMessage = '❌ There was an error playing the song!';
            if (error.message?.includes('404') || error.status === 404) {
                errorMessage = '❌ Connection error. Please try again in a moment!';
            } else if (error.message?.includes('429') || error.status === 429) {
                errorMessage = '❌ Too many requests. Please wait a moment and try again!';
            } else if (error.message?.includes('timeout') || error.message?.includes('handshake')) {
                errorMessage = '❌ Connection timeout. Please try again!';
            }
            
            await interaction.editReply(errorMessage);
        }
    }
};

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
