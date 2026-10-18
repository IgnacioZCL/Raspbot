module.exports = {
  name: 'skip',
  description: 'Skip the current song',
  async execute(message, args, player) {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.isPlaying()) {
      return message.reply('❌ Nothing is playing right now.');
    }

    const current = queue.currentTrack;
    queue.node.skip();
    return message.reply(`⏭️ Skipped **${current.title}**.`);
  },
};
