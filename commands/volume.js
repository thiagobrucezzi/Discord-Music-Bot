import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Adjusts volume (0-200)')
        .addIntegerOption(option =>
            option.setName('volume')
                .setDescription('Volume between 0 and 200')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(200)
        ),
    
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

        const volume = interaction.options.getInteger('volume');
        await player.setVolume(volume);

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🔊 Volume adjusted')
            .setDescription(`Volume set to: **${volume}%**`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
