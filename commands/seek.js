import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Jumps to a specific time in the current track')
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Time to seek to (e.g. 1:30, 90s, 1h2m, 90)')
                .setRequired(true)),

    async execute(interaction, kazagumo) {
        const player = kazagumo.players.get(interaction.guild.id);
        if (!player || !player.queue.current) {
            return interaction.reply('❌ Nothing is currently playing!');
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel || player.voiceId !== voiceChannel.id) {
            return interaction.reply('❌ You must be in the same voice channel as the bot!');
        }

        const track = player.queue.current;
        if (!track.length || track.length <= 0) {
            return interaction.reply('❌ Cannot seek in a live stream.');
        }

        const input = interaction.options.getString('time');
        const ms = parseTime(input);
        if (ms === null) {
            return interaction.reply('❌ Invalid time. Examples: `1:30`, `90s`, `1h2m`, `90`');
        }
        if (ms < 0 || ms > track.length) {
            return interaction.reply(`❌ Time out of range. Track length is ${formatTime(track.length)}.`);
        }

        try {
            await player.seek(ms);
        } catch (err) {
            console.error('Seek failed:', err);
            return interaction.reply('❌ Seek failed.');
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('⏩ Jumped')
            .setDescription(`Seeked to **${formatTime(ms)}** / ${formatTime(track.length)}\nTrack: **${track.title}**`)
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
};

// Accepts: "1:30", "1:30:45", "90s", "1m30s", "1h2m", "90" (seconds)
function parseTime(input) {
    if (!input) return null;
    const s = input.trim().toLowerCase();
    // mm:ss or hh:mm:ss
    if (/^\d+(:\d{1,2}){1,2}$/.test(s)) {
        const parts = s.split(':').map(Number);
        let total = 0;
        if (parts.length === 2) total = parts[0] * 60 + parts[1];
        else if (parts.length === 3) total = parts[0] * 3600 + parts[1] * 60 + parts[2];
        return total * 1000;
    }
    // 1h2m3s style
    const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (m && (m[1] || m[2] || m[3])) {
        const h = parseInt(m[1] || '0', 10);
        const min = parseInt(m[2] || '0', 10);
        const sec = parseInt(m[3] || '0', 10);
        return (h * 3600 + min * 60 + sec) * 1000;
    }
    // bare number = seconds
    if (/^\d+$/.test(s)) return parseInt(s, 10) * 1000;
    return null;
}

function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
}
