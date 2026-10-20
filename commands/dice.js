const DEFAULT_FACES = 6;
const MAX_FACES = 1_000_000;

function roll(faces) {
  return Math.floor(Math.random() * faces) + 1;
}

module.exports = {
  name: 'dice',
  description: 'Roll a die with a custom number of faces. Usage: !dice [faces]',
  async execute(message, args) {
    let faces = DEFAULT_FACES;

    if (args.length > 0) {
      const input = parseInt(args[0], 10);
      if (Number.isNaN(input) || input < 2) {
        return message.reply('❌ Please provide a valid number of faces (minimum 2).');
      }
      if (input > MAX_FACES) {
        return message.reply(`❌ Maximum number of faces is ${MAX_FACES.toLocaleString()}.`);
      }
      faces = input;
    }

    const result = roll(faces);
    await message.channel.send(`🎲 Rolled a **${result}** on a ${faces.toLocaleString()}-sided die.`);
  },
};
