import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skips to the next song'),
    
    async execute(interaction, kazagumo) {
        const player = kazagumo.players.get(interaction.guild.id);

        if (!player) {
            return interaction.reply('❌ No song is currently playing!');
        }

        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel || player.voiceId !== voiceChannel.id) {
            return interaction.reply('❌ You must be in the same voice channel as the bot!');
        }

        if (!player.queue.current) {
            return interaction.reply('❌ No song in the queue!');
        }

        const currentTrack = player.queue.current;
        const queueLengthBefore = player.queue.length;
        
        console.log(`⏭️ Skip command | Guild: ${interaction.guild.id} | Current: ${currentTrack?.title} | Queue length: ${queueLengthBefore}`);
        
        // Check if there are more tracks
        if (queueLengthBefore === 0) {
            // No more songs, just stop current
            try {
                const shoukakuPlayer = player.shoukaku;
                if (shoukakuPlayer && shoukakuPlayer.connection) {
                    await shoukakuPlayer.stop();
                }
            } catch (e) {
                // Ignore errors
            }
            return interaction.reply('❌ No more songs in the queue to skip to!');
        }
        
        // Get the next track before skipping
        const nextTracks = player.queue.slice(0, 1);
        const nextTrackInQueue = nextTracks[0];
        
        console.log(`   └─ Next track in queue: ${nextTrackInQueue?.title}`);
        
        if (!nextTrackInQueue) {
            return interaction.reply('❌ No next track found in queue!');
        }
        
        // Try multiple methods to stop the current track
        // This is critical - skip() won't work while a track is playing
        let trackStopped = false;
        
        // Method 1: Try Shoukaku connection stop (preferred method)
        try {
            const shoukakuPlayer = player.shoukaku;
            if (shoukakuPlayer) {
                // Try different ways to access the stop method
                if (shoukakuPlayer.connection && typeof shoukakuPlayer.connection.stop === 'function') {
                    await shoukakuPlayer.connection.stop();
                    trackStopped = true;
                } else if (typeof shoukakuPlayer.stop === 'function') {
                    await shoukakuPlayer.stop();
                    trackStopped = true;
                } else {
                    // Try accessing through kazagumo's shoukaku instance
                    try {
                        const mainShoukaku = kazagumo.shoukaku;
                        if (mainShoukaku && mainShoukaku.nodes) {
                            for (const [nodeName, node] of mainShoukaku.nodes) {
                                if (node && node.players) {
                                    const nodePlayer = node.players.get(interaction.guild.id);
                                    if (nodePlayer) {
                                        if (typeof nodePlayer.stop === 'function') {
                                            await nodePlayer.stop();
                                            trackStopped = true;
                                            break;
                                        } else if (nodePlayer.connection && typeof nodePlayer.connection.stop === 'function') {
                                            await nodePlayer.connection.stop();
                                            trackStopped = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    } catch (nodeError) {
                        // Silently fail - will use fallback method
                    }
                }
            }
        } catch (stopError) {
            // Silently fail - will use fallback method
        }
        
        // Method 2: If we couldn't stop, try skip() and play() anyway
        // We'll mark that we did a manual skip so playerEnd can check and avoid double-skip
        if (!trackStopped) {
            try {
                // Mark that we're doing a manual skip (store in player data)
                // This will help playerEnd know not to process again
                player._manualSkip = true;
                player._manualSkipNextTrack = nextTrackInQueue;
                
                // Try skip() - it might work even if track is playing
                await player.skip();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const checkTrack = player.queue.current;
                
                // If track changed, try to play it
                if (checkTrack && checkTrack !== currentTrack) {
                    await player.play();
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Clear the manual skip flag after a delay
                    setTimeout(() => {
                        if (player._manualSkip) {
                            player._manualSkip = false;
                            player._manualSkipNextTrack = null;
                        }
                    }, 2000);
                } else {
                    // Clear flag if skip didn't work - will advance when track ends
                    player._manualSkip = false;
                    player._manualSkipNextTrack = null;
                }
            } catch (skipError) {
                // Clear flag on error
                player._manualSkip = false;
                player._manualSkipNextTrack = null;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('⏭️ Song skipped')
            .setDescription(`Skipped: **${currentTrack.title}**`)
            .setTimestamp();
        
        // Show what's playing now (or what will play next)
        // Since we're stopping the track and letting playerEnd handle it,
        // we can show the next track that should play
        if (nextTrackInQueue) {
            embed.addFields({ name: '🎵 Next up', value: `**${nextTrackInQueue.title}**`, inline: false });
        } else if (queueLengthBefore === 0) {
            embed.setDescription(`Skipped: **${currentTrack.title}**\n\n❌ No more songs in queue.`);
        }

        await interaction.reply({ embeds: [embed] });
    }
};
