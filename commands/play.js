const { QueryType } = require('discord-player');

function isSpotifyUrl(query) {
  return /^https?:\/\/open\.spotify\.com\//i.test(query);
}

function queryTypeFor(query) {
  return isSpotifyUrl(query) ? QueryType.AUTO : QueryType.YOUTUBE_SEARCH;
}

module.exports = {
  name: 'play',
  description: 'Search YouTube/Spotify and play or queue a song',
  async execute(message, args, player) {
    const channel = message.member?.voice?.channel;
    if (!channel) {
      return message.reply('❌ You need to be in a voice channel first.');
    }

    const query = args.join(' ');
    if (!query) {
      return message.reply('❌ Give me something to play, e.g. `!play never gonna give you up`');
    }

    const sourceLabel = isSpotifyUrl(query) ? 'Spotify' : 'YouTube';
    await message.channel.send(`🔎 Searching ${sourceLabel} for: **${query}**`);

    let result = await player.search(query, {
      requestedBy: message.author,
      searchEngine: queryTypeFor(query),
    });

    // Fallback to automatic search if the primary source returns nothing
    if (!result || !result.hasTracks()) {
      console.log(`${sourceLabel} search returned nothing, trying auto search...`);
      result = await player.search(query, {
        requestedBy: message.author,
        searchEngine: QueryType.AUTO,
      });
    }

    if (!result || !result.hasTracks()) {
      return message.reply(`❌ No results found on ${sourceLabel}.`);
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
