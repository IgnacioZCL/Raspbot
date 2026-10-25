const play = require('./play');

module.exports = {
  name: 'again',
  description: 'Repeat the last song that was played',
  async execute(message, args, player) {
    if (!player.lastQueries || !player.lastQueries.has(message.guild.id)) {
      return message.reply('❌ No previous song found for this server.');
    }

    const lastQuery = player.lastQueries.get(message.guild.id);
    await message.channel.send(`🔁 Repeating last song: **${lastQuery}**`);
    return play.execute(message, [lastQuery], player);
  },
};
