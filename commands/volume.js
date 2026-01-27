import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Adjusts volume (0-200)')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Volume level between 0 and 200')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(200)
        ),
    
    async execute(interaction, kazagumo) {
        await interaction.deferReply();
        
        const player = kazagumo.players.get(interaction.guild.id);

        if (!player) {
            return interaction.editReply('❌ No song is currently playing!');
        }

        // Verify player has a current track
        if (!player.queue.current) {
            return interaction.editReply('❌ No song is currently playing!');
        }

        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel || player.voiceId !== voiceChannel.id) {
            return interaction.editReply('❌ You must be in the same voice channel as the bot!');
        }

        // Verify bot is actually in voice channel
        const guild = interaction.guild;
        const botMember = guild.members.cache.get(interaction.client.user.id);
        const botVoiceChannel = botMember?.voice?.channel;
        
        if (!botVoiceChannel || botVoiceChannel.id !== voiceChannel.id) {
            return interaction.editReply('❌ Bot is not connected to the voice channel. Please use `/play` to reconnect!');
        }

        // Try multiple parameter names to support different command registrations
        // 'level' (new), 'volume' (old English), 'volumen' (Spanish)
        let volume = interaction.options.getInteger('level');
        if (volume === null) {
            volume = interaction.options.getInteger('volume');
        }
        if (volume === null) {
            volume = interaction.options.getInteger('volumen');
        }
        
        // Log for debugging
        console.log('Volume command received:', {
            level: interaction.options.getInteger('level'),
            volume: interaction.options.getInteger('volume'),
            volumen: interaction.options.getInteger('volumen'),
            finalVolume: volume,
            allOptions: interaction.options.data
        });
        
        // Validate volume value
        if (volume === null || volume === undefined) {
            return interaction.editReply('❌ Volume value is required! Please specify a volume level between 0 and 200.\n\n💡 **Important:** You may need to run `npm run deploy` to update the command with the new parameter name.');
        }
        
        if (volume < 0 || volume > 200) {
            return interaction.editReply('❌ Volume must be between 0 and 200!');
        }
        
        try {
            // Verify player is actually connected and ready
            if (!player.voiceId) {
                return interaction.editReply('❌ Player is not connected to a voice channel!');
            }
            
            // Kazagumo's setVolume expects a value between 0-100 (percentage)
            // But we're accepting 0-200, so we need to convert to percentage
            // If user wants 200%, that's 100% in Kazagumo terms
            // So: volume 0-200 maps to 0-100 in Kazagumo
            const kazagumoVolume = Math.min(100, Math.max(0, Math.round((volume / 200) * 100)));
            
            // Use Kazagumo's setVolume method
            // This should work correctly with the converted value
            await player.setVolume(kazagumoVolume);

            // Ensure volume is a valid number for display
            const displayVolume = volume !== null && volume !== undefined ? volume : 'unknown';

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🔊 Volume adjusted')
                .setDescription(`Volume set to: **${displayVolume}%**`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error setting volume:', error);
            console.error('Error details:', {
                status: error.status,
                message: error.message,
                path: error.path,
                volume: volume,
                kazagumoVolume: Math.min(100, Math.max(0, Math.round((volume / 200) * 100))),
                playerState: {
                    playing: player.playing,
                    paused: player.paused,
                    hasTrack: !!player.queue.current,
                    voiceId: player.voiceId
                }
            });
            
            // If error 400, try alternative approach - use the player's shoukaku property directly
            if (error.status === 400 || error.message?.includes('400') || error.message?.includes('not a function')) {
                try {
                    // Try accessing the Shoukaku player through the player object
                    const shoukakuPlayer = player.shoukaku;
                    if (shoukakuPlayer && typeof shoukakuPlayer.setVolume === 'function') {
                        // Lavalink uses 0-1000 range
                        const lavalinkVolume = Math.min(1000, Math.max(0, Math.round((volume / 200) * 1000)));
                        await shoukakuPlayer.setVolume(lavalinkVolume);
                        
                        const displayVolume = volume !== null && volume !== undefined ? volume : 'unknown';
                        const embed = new EmbedBuilder()
                            .setColor(0x5865F2)
                            .setTitle('🔊 Volume adjusted')
                            .setDescription(`Volume set to: **${displayVolume}%**`)
                            .setTimestamp();

                        return interaction.editReply({ embeds: [embed] });
                    }
                } catch (fallbackError) {
                    console.error('Fallback volume method failed:', fallbackError);
                }
                
                return interaction.editReply('❌ Error adjusting volume. The player connection might be invalid. Try using `/play` again!');
            }
            
            await interaction.editReply('❌ There was an error adjusting the volume. Please try again!');
        }
    }
};
