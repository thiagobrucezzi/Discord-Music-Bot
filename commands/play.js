import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays a song or adds to queue')
        .addStringOption(option =>
            option.setName('song')
                .setDescription('Song name or URL')
                .setRequired(true)
        ),
    
    async execute(interaction, kazagumo) {
        await interaction.deferReply();

        // Try both 'song' and 'cancion' to support both old and new command registrations
        const query = interaction.options.getString('song') || interaction.options.getString('cancion');
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        console.log(`🎵 Play command | Guild: ${interaction.guild.id} | User: ${interaction.user.tag} | Query: ${query}`);

        if (!voiceChannel) {
            return interaction.editReply('❌ You must be in a voice channel to use this command!');
        }

        // Use the shared cleanup helper from index.js (wipes kazagumo + shoukaku
        // map entries even when destroy() throws partway through).
        const cleanup = (gid) => kazagumo._forceCleanupPlayer
            ? kazagumo._forceCleanupPlayer(gid)
            : Promise.resolve();

        let _retried = false;
        const skipNodes = new Set(); // nodes that returned stale-session 404 this attempt
        let _lastUsedNode = null;
        const attemptPlay = async () => {
        try {
            // Check if player already exists for this guild
            let player = kazagumo.players.get(interaction.guild.id);

            // Verify bot is actually in the voice channel
            const guild = interaction.guild;
            const botMember = guild.members.cache.get(interaction.client.user.id);
            const botVoiceChannel = botMember?.voice?.channel;

            if (player) {
                // Check if bot is actually connected to a voice channel
                if (!botVoiceChannel) {
                    // Bot is not in any channel, but player exists - wipe it.
                    // forceCleanupPlayer handles the case where player.destroy() throws
                    // (stuck DESTROYING state from a prior network failure).
                    console.log('Bot not in voice channel but player exists, cleaning up');
                    await cleanup(interaction.guild.id);
                    player = null;
                } else if (player.voiceId !== voiceChannel.id) {
                    // Player exists but is in different channel - move it
                    try {
                        await player.setVoiceChannel(voiceChannel.id);
                    } catch (error) {
                        console.error('Error moving player to new channel:', error);
                        // If move fails, wipe old player and create new one
                        await cleanup(interaction.guild.id);
                        player = null;
                    }
                }
                
                // Update text channel if player still exists
                if (player) {
                    player.setTextChannel(interaction.channel.id);
                }
            }

            // Create new player if it doesn't exist or was destroyed
            if (!player) {
                const triedNodes = new Set();

                // Build ordered list: all connected nodes first, then iterate all of them.
                // skipNodes excludes nodes that returned a stale-session 404 earlier
                // this attempt (so we don't redial the same broken node).
                const allNodes = [...kazagumo.shoukaku.nodes.values()];
                const connectedNodes = allNodes.filter(n => n.state === 1 && !skipNodes.has(n.name));

                console.log(`   └─ Nodes available: ${allNodes.length} total, ${connectedNodes.length} connected${skipNodes.size ? ` (skipping ${skipNodes.size} stale)` : ''}`);
                allNodes.forEach(n => console.log(`      • ${n.name} state=${n.state}${skipNodes.has(n.name) ? ' [skipped: stale]' : ''}`));

                if (connectedNodes.length === 0) {
                    console.warn(`   └─ No connected nodes at all`);
                    return interaction.editReply('❌ No Lavalink nodes are online right now. Please wait a moment and try again!');
                }

                // Try every connected node until one works
                for (const node of connectedNodes) {
                    if (triedNodes.has(node.name)) continue;
                    triedNodes.add(node.name);

                    try {
                        const playerOptions = {
                            guildId: interaction.guild.id,
                            voiceId: voiceChannel.id,
                            textId: interaction.channel.id,
                            deaf: true,
                            nodeName: node.name
                        };

                        console.log(`   └─ Trying node: ${node.name} (${triedNodes.size}/${connectedNodes.length})`);
                        player = await kazagumo.createPlayer(playerOptions);
                        _lastUsedNode = node.name;
                        console.log(`   └─ ✅ Connected via node: ${node.name}`);
                        break; // success
                    } catch (createError) {
                        console.error(`   └─ ❌ Node ${node.name} failed: ${createError.message}`);
                        await cleanup(interaction.guild.id);
                        await new Promise(r => setTimeout(r, 500));
                    }
                }

                if (!player) {
                    console.warn(`   └─ All ${connectedNodes.length} nodes failed`);
                    return interaction.editReply('❌ Could not connect to voice channel. All nodes failed. Please try again!');
                }
            }

            // Track the player's node so the catch can recycle + skip it on retry.
            _lastUsedNode = player?.shoukaku?.node?.name ?? _lastUsedNode;

            // Parallel search across all connected nodes: hit them simultaneously
            // and take the first one that returns non-empty tracks. A stalled node
            // (primary can take 2+ minutes to return 0 results when its YT plugin
            // is blocked) no longer poisons the wait — fast nodes win the race.
            // Hard per-node timeout means even a fully hung node drops out after
            // SEARCH_TIMEOUT_MS instead of hanging the entire user request.
            const SEARCH_TIMEOUT_MS = 12000;
            const connectedNodes = [...kazagumo.shoukaku.nodes.values()].filter(n => n.state === 1);
            console.log(`   └─ Searching for: ${query} across ${connectedNodes.length} nodes in parallel`);

            const searchOnNode = (nodeName) => new Promise((resolve) => {
                const t = setTimeout(() => resolve({ node: nodeName, tracks: [], timedOut: true }), SEARCH_TIMEOUT_MS);
                kazagumo.search(query, { requester: interaction.user, nodeName })
                    .then(r => { clearTimeout(t); resolve({ node: nodeName, tracks: r?.tracks ?? [], type: r?.type, playlistName: r?.playlistName }); })
                    .catch(err => { clearTimeout(t); resolve({ node: nodeName, tracks: [], error: err.message }); });
            });

            // Promise.any rejects when every promise rejects. Wrap so empty/timeout
            // counts as reject (we only want first NON-EMPTY winner).
            let winner = null;
            try {
                winner = await Promise.any(connectedNodes.map(n =>
                    searchOnNode(n.name).then(r => r.tracks.length ? r : Promise.reject(r))
                ));
            } catch (_) { /* all empty — fall through to scsearch */ }

            let result = winner
                ? { tracks: winner.tracks, type: winner.type, playlistName: winner.playlistName }
                : { tracks: [] };
            if (winner) console.log(`   └─ ✅ First-to-find: ${winner.node} → ${winner.tracks[0].title}`);

            // Last resort for plain text queries: SoundCloud on the player's node.
            const isUrl = /^https?:\/\//i.test(query);
            if (!result.tracks.length && !isUrl) {
                try {
                    console.log(`   └─ 🔄 SoundCloud fallback: scsearch:${query}`);
                    const sc = await player.search(`scsearch:${query}`, { requester: interaction.user });
                    if (sc?.tracks?.length) {
                        console.log(`   └─ ✅ SoundCloud hit: ${sc.tracks[0].title}`);
                        result = sc;
                    }
                } catch (err) {
                    console.warn(`   └─ SoundCloud fallback failed: ${err.message}`);
                }
            }

            if (!result.tracks.length) {
                console.log(`   └─ ❌ No results found (tried all nodes in parallel + scsearch)`);
                return interaction.editReply('❌ No results found for your search!');
            }

            const isPlaylist = result.type === 'PLAYLIST';
            const tracksToAdd = isPlaylist ? result.tracks : [result.tracks[0]];
            const track = tracksToAdd[0];
            const queueLengthBefore = player.queue.length;
            const isCurrentlyPlaying = player.playing || player.paused;
            const currentTrack = player.queue.current;

            if (isPlaylist) {
                console.log(`   └─ Playlist: ${result.playlistName ?? 'Unknown'} (${tracksToAdd.length} tracks)`);
            } else {
                console.log(`   └─ Found: ${track.title}`);
            }
            console.log(`   └─ Queue before: ${queueLengthBefore} tracks | Currently playing: ${isCurrentlyPlaying ? currentTrack?.title : 'Nothing'}`);

            for (const t of tracksToAdd) {
                await player.queue.add(t);
            }

            // Update autoplay context when a song is manually added
            if (player._autoplay) {
                player._autoplayContext = track;
                console.log(`   └─ 🔄 Updated autoplay context to: ${track.title}`);
            }

            const queueLengthAfter = player.queue.length;
            console.log(`   └─ ✅ Added to queue | Queue now: ${queueLengthAfter} tracks`);

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setThumbnail(track.thumbnail || null)
                .setTimestamp();

            if (isPlaylist) {
                embed.setTitle('📋 Playlist added')
                    .setDescription(`**${result.playlistName ?? 'Playlist'}** — ${tracksToAdd.length} songs added to queue`)
                    .addFields({ name: '👤 Requested by', value: `${interaction.user}`, inline: true });
            } else {
                embed.setTitle('🎵 Song added')
                    .setDescription(`**[${track.title}](${track.uri})**`)
                    .addFields(
                        { name: '👤 Requested by', value: `${interaction.user}`, inline: true },
                        { name: '⏱️ Duration', value: track.length > 0 ? formatTime(track.length) : 'Live', inline: true }
                    );
            }

            // If nothing was playing, kick off playback. The "Now playing" message
            // is sent by the playerStart event handler in index.js (with control
            // buttons), so we don't duplicate it here.
            if (!player.playing && !player.paused) {
                try {
                    console.log(`   └─ Starting playback: ${track.title}`);
                    await player.play();
                    console.log(`   └─ ✅ Now playing: ${track.title}`);
                } catch (playError) {
                    console.error(`   └─ ❌ Error starting playback:`, playError);
                }
            } else {
                console.log(`   └─ Added to queue (${queueLengthAfter} total). Currently playing: ${currentTrack?.title}`);
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in play:', error);

            // Session expired after Lavalink node restart — destroy stale player and retry once.
            // Heuristic: 404 from a /v4/sessions/.../players path = the node's session ID
            // is stale on the Lavalink side. The fix is to (a) skip that node for the
            // retry so we pick a different one, and (b) recycle it so it gets a fresh
            // session for future requests.
            const errPath = String(error?.path ?? '');
            const isSessionError = error.status === 404 ||
                error.message?.includes('Session not found') ||
                /\/v4\/sessions\/[^/]+\/players/.test(errPath);
            if (isSessionError && !_retried) {
                _retried = true;
                console.warn('   └─ 🔄 Stale session detected, cleaning up and retrying on a different node...');
                if (_lastUsedNode) {
                    skipNodes.add(_lastUsedNode);
                    if (typeof kazagumo._recycleNode === 'function') {
                        kazagumo._recycleNode(_lastUsedNode);
                    }
                }
                await cleanup(interaction.guild.id);
                await new Promise(r => setTimeout(r, 800));
                return attemptPlay();
            }

            // More specific error messages
            let errorMessage = '❌ There was an error playing the song!';
            if (error.message?.includes('404') || error.status === 404) {
                errorMessage = '❌ Connection error. Please try again in a moment!';
            } else if (error.message?.includes('429') || error.status === 429) {
                errorMessage = '❌ Too many requests. Please wait a moment and try again!';
            } else if (error.message?.includes('timeout') || error.message?.includes('handshake')) {
                errorMessage = '❌ Connection timeout. Please try again!';
            }

            await interaction.editReply(errorMessage);
        }
        }; // end attemptPlay
        return attemptPlay();
    }
};

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
