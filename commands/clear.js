import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clears upcoming tracks (the current song keeps playing)'),

    async execute(interaction, kazagumo) {
        const player = kazagumo.players.get(interaction.guild.id);
        if (!player) return interaction.reply('❌ No song is currently playing!');

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel || player.voiceId !== voiceChannel.id) {
            return interaction.reply('❌ You must be in the same voice channel as the bot!');
        }

        const cleared = player.queue.length;
        if (cleared === 0) {
            return interaction.reply('❌ Queue is already empty.');
        }
        player.queue.clear();

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🧹 Queue cleared')
            .setDescription(`Removed **${cleared}** upcoming track(s). The current song keeps playing.`)
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
};
