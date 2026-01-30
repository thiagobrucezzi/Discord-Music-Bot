import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

// Helper function to search and play related songs (for skip command)
async function searchAndPlayRelatedSong(player, kazagumo, contextTrack) {
    if (!contextTrack) {
        contextTrack = player._autoplayContext || player.queue.current;
    }
    
    if (!contextTrack) {
        console.warn(`   └─ ⚠️ No context track available for autoplay`);
        return { success: false };
    }
    
    console.log(`   └─ 🔄 Autoplay: Searching for related songs...`);
    console.log(`   └─ Using context: ${contextTrack.title}`);
    
    // Initialize autoplay history if it doesn't exist
    if (!player._autoplayHistory) {
        player._autoplayHistory = [];
    }
    
    try {
        // Extract artist name from track title for better search
        let searchQuery = contextTrack.title;
        const artistMatch = contextTrack.title.match(/^([^-|]+)/);
        if (artistMatch) {
            const artistName = artistMatch[1].trim();
            searchQuery = artistName;
            console.log(`   └─ Extracted artist: ${artistName}`);
        } else {
            searchQuery = `radio ${contextTrack.title}`;
        }
        
        console.log(`   └─ Searching: ${searchQuery}`);
        
        // Use a dummy requester object
        const result = await kazagumo.search(searchQuery, {
            requester: { id: 'autoplay', username: 'Autoplay' }
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
                const relatedTrack = relatedTracks[0];
                console.log(`   └─ ✅ Found related song: ${relatedTrack.title}`);
                
                // Add to history (keep last 10 songs)
                player._autoplayHistory.push(relatedTrack);
                if (player._autoplayHistory.length > 10) {
                    player._autoplayHistory.shift(); // Remove oldest
                }
                
                // Update autoplay context
                player._autoplayContext = relatedTrack;
                
                // Check if queue is empty before adding
                const wasQueueEmpty = player.queue.length === 0;
                
                // Add to queue
                await player.queue.add(relatedTrack);
                
                // If queue was empty, we need to set current track and play
                // If queue had tracks, we can use skip() to advance
                if (wasQueueEmpty && player.queue.current) {
                    // Queue was empty, so current track is still the old one
                    // We need to advance to the new track
                    await player.skip();
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                // Play the track
                if (!player.playing) {
                    await player.play();
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                return { success: true, track: relatedTrack };
            }
        }
        return { success: false };
    } catch (error) {
        console.error('Error in autoplay search:', error);
        return { success: false };
    }
}

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
            // No more songs in queue
            // If autoplay is enabled, search for related song immediately
            if (player._autoplay && currentTrack) {
                // Respond immediately to avoid timeout
                await interaction.deferReply();
                
                // Mark that we're handling autoplay from skip command
                // This prevents playerEnd from processing it again
                player._autoplayHandledBySkip = true;
                player._autoplaySkipTrack = currentTrack;
                
                // Stop current track first
                try {
                    const shoukakuPlayer = player.shoukaku;
                    if (shoukakuPlayer && shoukakuPlayer.connection) {
                        await shoukakuPlayer.stop();
                    }
                } catch (e) {
                    // Ignore errors
                }
                
                // Search for related song immediately
                const result = await searchAndPlayRelatedSong(player, kazagumo, currentTrack);
                
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('⏭️ Song skipped')
                    .setDescription(`Skipped: **${currentTrack.title}**`)
                    .setTimestamp();
                
                if (result.success) {
                    // Store the related track that was added by skip
                    // This helps playerEnd know not to process autoplay until this track ends
                    player._autoplayRelatedTrack = result.track;
                    
                    embed.addFields({ 
                        name: '🔄 Autoplay', 
                        value: `**Playing related song:**\n[${result.track.title}](${result.track.uri})`, 
                        inline: false 
                    });
                } else {
                    embed.setDescription(`Skipped: **${currentTrack.title}**\n\n❌ No related songs found. Autoplay disabled.`);
                    player._autoplay = false;
                    player._autoplayHandledBySkip = false;
                    player._autoplaySkipTrack = null;
                    player._autoplayRelatedTrack = null;
                }
                
                return interaction.editReply({ embeds: [embed] });
            } else {
                // No autoplay, just stop current
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
        }
        
        // Get the next track before skipping
        const nextTracks = player.queue.slice(0, 1);
        const nextTrackInQueue = nextTracks[0];
        
        console.log(`   └─ Next track in queue: ${nextTrackInQueue?.title}`);
        
        if (!nextTrackInQueue) {
            return interaction.reply('❌ No next track found in queue!');
        }
        
        // Mark that we're doing a manual skip BEFORE stopping
        // This prevents playerEnd from processing and causing double skip
        player._manualSkip = true;
        player._manualSkipNextTrack = nextTrackInQueue;
        player._manualSkipTime = Date.now();
        
        // Try to stop the current track - this will trigger playerEnd
        // But playerEnd will see _manualSkip flag and return early
        let trackStopped = false;
        
        try {
            const shoukakuPlayer = player.shoukaku;
            if (shoukakuPlayer) {
                if (shoukakuPlayer.connection && typeof shoukakuPlayer.connection.stop === 'function') {
                    await shoukakuPlayer.connection.stop();
                    trackStopped = true;
                } else if (typeof shoukakuPlayer.stop === 'function') {
                    await shoukakuPlayer.stop();
                    trackStopped = true;
                }
            }
        } catch (stopError) {
            // If stop fails, use skip() and play() directly
        }
        
        // If stop() didn't work, use skip() and play() directly
        if (!trackStopped) {
            try {
                await player.skip();
                await new Promise(resolve => setTimeout(resolve, 300));
                
                if (!player.playing) {
                    await player.play();
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                // Clear flag after track starts playing
                setTimeout(() => {
                    if (player._manualSkip) {
                        player._manualSkip = false;
                        player._manualSkipNextTrack = null;
                        player._manualSkipTime = null;
                    }
                }, 2000);
            } catch (skipError) {
                player._manualSkip = false;
                player._manualSkipNextTrack = null;
                player._manualSkipTime = null;
            }
        }

        
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('⏭️ Song skipped')
            .setDescription(`Skipped: **${currentTrack.title}**`)
            .setTimestamp();
        
        // Show what's playing now (or what will play next)
        if (nextTrackInQueue) {
            embed.addFields({ name: '🎵 Next up', value: `**${nextTrackInQueue.title}**`, inline: false });
        } else if (queueLengthBefore === 0) {
            embed.setDescription(`Skipped: **${currentTrack.title}**\n\n❌ No more songs in queue.`);
        }

        await interaction.reply({ embeds: [embed] });
    }
};
