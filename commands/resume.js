import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resumes playback (or restores yesterday\'s session if disconnected)'),

    async execute(interaction, kazagumo) {
        const guildId = interaction.guild.id;
        const member = interaction.member;
        const voiceChannel = member.voice?.channel;
        let player = kazagumo.players.get(guildId);

        // Case 1: player exists and is paused → simple unpause
        if (player) {
            if (!voiceChannel || player.voiceId !== voiceChannel.id) {
                return interaction.reply('❌ You must be in the same voice channel as the bot!');
            }
            if (!player.paused) {
                return interaction.reply('❌ Playback is not paused!');
            }
            await player.pause(false);
            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('▶️ Playback resumed')
                .setDescription(`Playing: **${player.queue.current?.title ?? 'Unknown'}**`)
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        // Case 2: no live player → try to restore from saved state
        const statePath = join(__dirname, '..', 'state', `${guildId}.json`);
        if (!existsSync(statePath)) {
            return interaction.reply('❌ Nothing to resume — no music is playing and no saved session was found.');
        }

        await interaction.deferReply();

        let state;
        try {
            state = JSON.parse(readFileSync(statePath, 'utf-8'));
        } catch (err) {
            console.error('Error reading state file:', err);
            return interaction.editReply('❌ Saved session is corrupted, cannot restore.');
        }

        if (!voiceChannel) {
            return interaction.editReply('❌ Join a voice channel first, then run `/resume` again.');
        }

        if (!state.current?.uri) {
            return interaction.editReply('❌ Saved session has no current track to resume.');
        }

        // Find a connected node
        const connectedNodes = [...kazagumo.shoukaku.nodes.values()].filter(n => n.state === 1);
        if (connectedNodes.length === 0) {
            return interaction.editReply('❌ No Lavalink nodes are online. Try again in a moment.');
        }

        // Build player on the new voice channel (use the user's current channel, not the saved one)
        let createdPlayer;
        for (const node of connectedNodes) {
            try {
                createdPlayer = await kazagumo.createPlayer({
                    guildId,
                    voiceId: voiceChannel.id,
                    textId: interaction.channel.id,
                    deaf: true,
                    nodeName: node.name
                });
                console.log(`▶️  /resume: created player via node ${node.name}`);
                break;
            } catch (err) {
                console.error(`▶️  /resume: node ${node.name} failed: ${err.message}`);
            }
        }
        if (!createdPlayer) {
            return interaction.editReply('❌ Failed to create a player on any node.');
        }

        // Resolve the current track
        const currentSearch = await kazagumo.search(state.current.uri, { requester: interaction.user })
            .catch(err => { console.error('Resume search failed:', err); return null; });
        const currentTrack = currentSearch?.tracks?.[0];
        if (!currentTrack) {
            try { await createdPlayer.destroy(); } catch (e) {}
            return interaction.editReply('❌ Could not re-resolve the saved track. The source may be unavailable.');
        }

        // Restore settings
        if (typeof state.volume === 'number') {
            try { await createdPlayer.setVolume(state.volume); } catch (e) {}
        }
        createdPlayer._autoplay = Boolean(state.autoplay);
        createdPlayer._loopMode = state.loop || 'none';
        createdPlayer._twentyFourSeven = Boolean(state.twentyFourSeven);
        if (createdPlayer._loopMode !== 'none' && typeof createdPlayer.setLoop === 'function') {
            try { createdPlayer.setLoop(createdPlayer._loopMode); } catch (e) {}
        }

        await createdPlayer.queue.add(currentTrack);
        await createdPlayer.play();
        // Seek to saved position (if more than 5s in)
        const seekTo = Math.max(0, Math.min(state.current.position || 0, currentTrack.length - 5000));
        if (seekTo > 5000 && currentTrack.length > seekTo) {
            await new Promise(r => setTimeout(r, 800));
            try { await createdPlayer.seek(seekTo); } catch (e) { console.error('Seek failed:', e); }
        }

        const initialEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('▶️ Session restored')
            .setDescription(`Resuming: **[${currentTrack.title}](${currentTrack.uri})**${seekTo > 5000 ? ` from ${formatTime(seekTo)}` : ''}`)
            .addFields({ name: '📋 Queue to restore', value: `${state.queue?.length ?? 0} tracks` })
            .setTimestamp();
        await interaction.editReply({ embeds: [initialEmbed] });

        // Restore the rest of the queue in the background
        if (Array.isArray(state.queue) && state.queue.length > 0) {
            (async () => {
                let added = 0;
                for (const t of state.queue.slice(0, 100)) {
                    if (!t?.uri) continue;
                    try {
                        const r = await kazagumo.search(t.uri, { requester: interaction.user });
                        if (r?.tracks?.[0]) {
                            await createdPlayer.queue.add(r.tracks[0]);
                            added += 1;
                        }
                    } catch (err) { /* skip failed track */ }
                }
                console.log(`▶️  /resume: restored ${added}/${state.queue.length} queue tracks`);
            })();
        }
    }
};

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
