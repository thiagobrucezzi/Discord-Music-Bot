import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Shows the current track with a progress bar'),

    async execute(interaction, kazagumo) {
        const player = kazagumo.players.get(interaction.guild.id);
        if (!player || !player.queue.current) {
            return interaction.reply('❌ Nothing is currently playing!');
        }

        const track = player.queue.current;
        const position = typeof player.position === 'number' ? player.position : 0;
        const length = track.length || 0;

        const bar = buildProgressBar(position, length, 20);
        const ratioLine = length > 0
            ? `\`${formatTime(position)}\` ${bar} \`${formatTime(length)}\``
            : `\`${formatTime(position)}\` 🔴 LIVE`;

        const loopMode = player._loopMode || 'none';
        const flags = [];
        if (player.paused) flags.push('⏸️ Paused');
        if (player._autoplay) flags.push('🔄 Autoplay');
        if (loopMode !== 'none') flags.push(loopMode === 'track' ? '🔂 Loop track' : '🔁 Loop queue');
        if (player._twentyFourSeven) flags.push('🌙 24/7');

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎵 Now playing')
            .setDescription(`**[${track.title}](${track.uri})**\n\n${ratioLine}`)
            .addFields(
                { name: '👤 Requested by', value: track.requester ? `${track.requester}` : 'Autoplay', inline: true },
                { name: '🔊 Volume', value: `${player.volume ?? 100}%`, inline: true },
                { name: '📋 Queue', value: `${player.queue.length} upcoming`, inline: true }
            )
            .setThumbnail(track.thumbnail || null)
            .setTimestamp();
        if (flags.length > 0) embed.setFooter({ text: flags.join(' • ') });

        await interaction.reply({ embeds: [embed] });
    }
};

function buildProgressBar(position, length, size = 20) {
    if (!length || length <= 0) return '─'.repeat(size);
    const ratio = Math.min(1, Math.max(0, position / length));
    const filled = Math.round(ratio * size);
    return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}
