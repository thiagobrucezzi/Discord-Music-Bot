import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Sets loop mode')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Loop mode')
                .setRequired(true)
                .addChoices(
                    { name: 'Off',          value: 'none'  },
                    { name: 'Current track', value: 'track' },
                    { name: 'Whole queue',   value: 'queue' }
                )),

    async execute(interaction, kazagumo) {
        const player = kazagumo.players.get(interaction.guild.id);
        if (!player) return interaction.reply('❌ No song is currently playing!');

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel || player.voiceId !== voiceChannel.id) {
            return interaction.reply('❌ You must be in the same voice channel as the bot!');
        }

        const mode = interaction.options.getString('mode');
        player._loopMode = mode;
        if (typeof player.setLoop === 'function') {
            try { player.setLoop(mode); } catch (e) { /* ignore */ }
        }

        const labels = { none: '➡️ Off', track: '🔂 Track', queue: '🔁 Queue' };
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🔁 Loop mode')
            .setDescription(`Loop mode set to: **${labels[mode]}**`)
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
};
