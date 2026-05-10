import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Shows bot, Discord, and Lavalink node status'),

    async execute(interaction, kazagumo) {
        const client = interaction.client;
        const shoukaku = kazagumo.shoukaku;

        const wsPing = client.ws.ping;
        const allNodes = [...shoukaku.nodes.values()];
        const connectedNodes = allNodes.filter(n => n.state === 1);

        // Player on the current guild (if any)
        const player = kazagumo.players.get(interaction.guild.id);
        const playerNodeName = player?.node?.name ?? player?.shoukaku?.name ?? null;

        // Node list
        const nodeLines = allNodes.length === 0
            ? '_(no nodes registered)_'
            : allNodes.map(n => {
                const stateLabel = n.state === 1 ? '🟢' : n.state === 2 ? '🟡' : '🔴';
                const ping = typeof n.stats?.ping === 'number' ? `${n.stats.ping}ms` : '—';
                const players = typeof n.stats?.players === 'number' ? n.stats.players : '?';
                const isActive = playerNodeName === n.name ? '  ⬅️ active here' : '';
                return `${stateLabel} **${n.name}** · ping ${ping} · ${players} players${isActive}`;
            }).join('\n');

        // Memory
        const mem = process.memoryUsage();
        const fmtMB = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

        // Uptime
        const upSec = Math.floor(process.uptime());
        const days = Math.floor(upSec / 86400);
        const hours = Math.floor((upSec % 86400) / 3600);
        const minutes = Math.floor((upSec % 3600) / 60);
        const seconds = upSec % 60;
        const uptimeStr = [
            days > 0 ? `${days}d` : null,
            hours > 0 ? `${hours}h` : null,
            minutes > 0 ? `${minutes}m` : null,
            `${seconds}s`
        ].filter(Boolean).join(' ');

        const embed = new EmbedBuilder()
            .setColor(connectedNodes.length > 0 ? 0x57F287 : 0xED4245)
            .setTitle('📊 Bot status')
            .addFields(
                { name: '🤖 Bot',           value: `${client.user.tag}\n${client.guilds.cache.size} guilds · ${kazagumo.players.size} active players`, inline: true },
                { name: '📡 Discord',       value: `WS ping: **${wsPing}ms**`, inline: true },
                { name: '⏱️ Uptime',        value: uptimeStr, inline: true },
                { name: '🎵 Lavalink nodes', value: `${connectedNodes.length}/${allNodes.length} connected\n${nodeLines}`, inline: false },
                { name: '💾 Memory',        value: `RSS: **${fmtMB(mem.rss)}**\nHeap: ${fmtMB(mem.heapUsed)} / ${fmtMB(mem.heapTotal)}`, inline: true },
                { name: '🟢 Node.js',       value: process.version, inline: true }
            )
            .setTimestamp();

        if (player) {
            const cur = player.queue.current;
            embed.addFields({
                name: '🎶 This guild',
                value: cur
                    ? `Playing: **${cur.title}**\nNode: \`${playerNodeName ?? 'unknown'}\` · Queue: ${player.queue.length} upcoming`
                    : 'Connected, idle',
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed] });
    }
};
