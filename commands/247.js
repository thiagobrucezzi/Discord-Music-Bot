import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('247')
        .setDescription('Toggles 24/7 mode (bot stays in voice channel even when alone or idle)')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Enable or disable 24/7 mode')
                .setRequired(true)
                .addChoices(
                    { name: 'Enable',  value: 'on'  },
                    { name: 'Disable', value: 'off' }
                )),

    async execute(interaction, kazagumo) {
        const player = kazagumo.players.get(interaction.guild.id);
        if (!player) return interaction.reply('❌ No music is currently playing! Use `/play` first.');

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel || player.voiceId !== voiceChannel.id) {
            return interaction.reply('❌ You must be in the same voice channel as the bot!');
        }

        const enabled = interaction.options.getString('mode') === 'on';
        player._twentyFourSeven = enabled;

        const embed = new EmbedBuilder()
            .setColor(enabled ? 0x57F287 : 0xED4245)
            .setTitle(enabled ? '🌙 24/7 mode enabled' : '🌅 24/7 mode disabled')
            .setDescription(enabled
                ? 'The bot will stay in the voice channel even when the queue is empty or no humans are present.'
                : 'The bot will disconnect after 1 hour of inactivity / empty channel as usual.')
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
};
