import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { unlinkSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stops playback, clears queue, and forgets the saved session'),

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

        // Delete the persisted state — explicit /stop means "don't /resume me later"
        try {
            const statePath = join(__dirname, '..', 'state', `${interaction.guild.id}.json`);
            if (existsSync(statePath)) unlinkSync(statePath);
        } catch (err) {
            console.error('Error deleting state file:', err);
        }

        try {
            player.queue.clear();
            await player.destroy();
        } catch (err) {
            console.error('Error stopping player:', err);
        }

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('⏹️ Playback stopped')
            .setDescription('The queue has been cleared and the bot has disconnected.')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
