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

        if (!voiceChannel) {
            return interaction.editReply('❌ You must be in a voice channel to use this command!');
        }

        try {
            const player = await kazagumo.createPlayer({
                guildId: interaction.guild.id,
                voiceId: voiceChannel.id,
                textId: interaction.channel.id,
                deaf: true
            });

            const result = await kazagumo.search(query, {
                requester: interaction.user
            });

            if (!result.tracks.length) {
                return interaction.editReply('❌ No results found for your search!');
            }

            const track = result.tracks[0];
            await player.queue.add(track);

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
                await player.play();
                embed.setDescription(`🎵 **Now playing:** [${track.title}](${track.uri})`);
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in play:', error);
            await interaction.editReply('❌ There was an error playing the song!');
        }
    }
};

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
