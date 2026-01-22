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
        await player.skip();

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('⏭️ Song skipped')
            .setDescription(`Skipped: **${currentTrack.title}**`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
