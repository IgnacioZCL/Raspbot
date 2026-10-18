const { QueryType } = require('discord-player');

const SPOTIFY_TRACK_RE = /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\//i;
const SPOTIFY_PLAYLIST_RE = /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\//i;
const SPOTIFY_ALBUM_RE = /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?album\//i;
const SPOTIFY_URL_RE = /^https?:\/\/open\.spotify\.com\//i;

function isSpotifyUrl(query) {
  return SPOTIFY_URL_RE.test(query);
}

function spotifyQueryType(query) {
  if (SPOTIFY_TRACK_RE.test(query)) return QueryType.SPOTIFY_SONG;
  if (SPOTIFY_PLAYLIST_RE.test(query)) return QueryType.SPOTIFY_PLAYLIST;
  if (SPOTIFY_ALBUM_RE.test(query)) return QueryType.SPOTIFY_ALBUM;
  return QueryType.SPOTIFY_SEARCH;
}

function queryTypeFor(query) {
  return isSpotifyUrl(query) ? spotifyQueryType(query) : QueryType.YOUTUBE_SEARCH;
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

    let result;
    try {
      result = await player.search(query, {
        requestedBy: message.author,
        searchEngine: queryTypeFor(query),
      });
    } catch (error) {
      console.error(`Error searching ${sourceLabel}:`, error);
      return message.reply(`❌ Error searching ${sourceLabel}: ${error.message || error}`);
    }

    // Fallback to automatic search if the primary source returns nothing
    if (!result || !result.hasTracks()) {
      console.log(`${sourceLabel} search returned nothing, trying auto search...`);
      try {
        result = await player.search(query, {
          requestedBy: message.author,
          searchEngine: QueryType.AUTO,
        });
      } catch (error) {
        console.error('Error during auto search fallback:', error);
        return message.reply(`❌ Error during fallback search: ${error.message || error}`);
      }
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
