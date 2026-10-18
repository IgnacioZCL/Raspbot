module.exports = {
  name: 'pause',
  description: 'Pause or resume the current song',
  async execute(message, args, player) {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.isPlaying()) {
      return message.reply('❌ Nothing is playing right now.');
    }

    if (queue.node.isPaused()) {
      queue.node.resume();
      return message.reply('▶️ Resumed.');
    } else {
      queue.node.pause();
      return message.reply('⏸️ Paused.');
    }
  },
};
