module.exports = {
  name: 'cat',
  description: 'Get a random cat picture',
  async execute(message) {
    try {
      const response = await fetch('https://api.thecatapi.com/v1/images/search');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const cat = data[0];
      if (!cat || !cat.url) {
        throw new Error('No cat image found in response');
      }
      await message.channel.send({ content: '🐱 Meow!', files: [cat.url] });
    } catch (error) {
      console.error('Cat command error:', error);
      await message.reply('❌ Could not fetch a cat picture right now. Try again later.');
    }
  },
};
