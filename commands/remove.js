import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Removes a specific track from the queue')
        .addIntegerOption(option =>
            option.setName('position')
                .setDescription('Queue position (1 = next track)')
                .setRequired(true)
                .setMinValue(1)),

    async execute(interaction, kazagumo) {
        const player = kazagumo.players.get(interaction.guild.id);
        if (!player) return interaction.reply('❌ No song is currently playing!');

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel || player.voiceId !== voiceChannel.id) {
            return interaction.reply('❌ You must be in the same voice channel as the bot!');
        }

        const pos = interaction.options.getInteger('position');
        if (pos > player.queue.length) {
            return interaction.reply(`❌ The queue only has ${player.queue.length} upcoming track(s).`);
        }

        // KazagumoQueue is array-like — splice removes by index. Position 1 = index 0.
        const removed = player.queue.splice(pos - 1, 1)[0];
        if (!removed) return interaction.reply('❌ Could not remove that track.');

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🗑️ Track removed')
            .setDescription(`Removed: **[${removed.title}](${removed.uri})**`)
            .setFooter({ text: `Queue now: ${player.queue.length} upcoming` })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
};
