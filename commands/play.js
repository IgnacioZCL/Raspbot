const { QueryType } = require('discord-player');

module.exports = {
  name: 'play',
  description: 'Search YouTube and play or queue a song',
  async execute(message, args, player) {
    const channel = message.member?.voice?.channel;
    if (!channel) {
      return message.reply('❌ You need to be in a voice channel first.');
    }

    const query = args.join(' ');
    if (!query) {
      return message.reply('❌ Give me something to play, e.g. `!play never gonna give you up`');
    }

    await message.channel.send(`🔎 Searching YouTube for: **${query}**`);

    let result = await player.search(query, {
      requestedBy: message.author,
      searchEngine: QueryType.YOUTUBE_SEARCH,
    });

    // Fallback to automatic search if YouTube returns nothing
    if (!result || !result.hasTracks()) {
      console.log('YouTube search returned nothing, trying auto search...');
      result = await player.search(query, {
        requestedBy: message.author,
        searchEngine: QueryType.AUTO,
      });
    }

    if (!result || !result.hasTracks()) {
      return message.reply('❌ No results found on YouTube.');
    }

    const track = result.tracks[0];

    await player.play(channel, result, {
      nodeOptions: {
        metadata: {
          channel: message.channel,
          author: message.author,
        },
        volume: 80,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 300000,
        leaveOnEnd: true,
        leaveOnEndCooldown: 300000,
      },
    });

    const queue = player.nodes.get(message.guild.id);
    const isFirst = queue && queue.tracks.length === 0 && queue.currentTrack === track;
    if (!isFirst) {
      await message.channel.send(`✅ Added to queue: **${track.title}** (${track.duration})`);
    }
  },
};
