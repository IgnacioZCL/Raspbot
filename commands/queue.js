module.exports = {
  name: 'queue',
  description: 'Show the current queue',
  async execute(message, args, player) {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.isPlaying()) {
      return message.reply('❌ Nothing is playing right now.');
    }

    const current = queue.currentTrack;
    const upcoming = queue.tracks.toArray();

    let text = `**Now playing:** ${current.title} — ${current.author} (${current.duration})\n`;

    if (upcoming.length === 0) {
      text += '\nNo songs in the queue.';
    } else {
      text += `\n**Up next (${upcoming.length}):**\n`;
      text += upcoming
        .slice(0, 10)
        .map((track, i) => `${i + 1}. ${track.title} — ${track.author} (${track.duration})`)
        .join('\n');
      if (upcoming.length > 10) {
        text += `\n...and ${upcoming.length - 10} more.`;
      }
    }

    return message.reply(text);
  },
};
