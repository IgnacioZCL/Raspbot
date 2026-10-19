module.exports = {
  name: 'techstack',
  description: 'Detect the tech stack used by a website',
  async execute(message, args) {
    const url = args[0];
    if (!url) {
      return message.reply('❌ Provide a URL, e.g. `!techstack https://example.com`');
    }

    const apiUrl = 'https://api.eu.apyhub.com/chisleroff/detect-tech-stack';
    const token = process.env.APY_TOKEN;
    if (!token) {
      return message.reply('❌ APY_TOKEN is not configured.');
    }

    try {
      await message.channel.send(`🔍 Analyzing tech stack for: ${url}`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'apy-token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('[techstack] response:', JSON.stringify(data, null, 2));

      // ApyHub responses vary; handle common shapes.
      let technologies = [];
      if (Array.isArray(data)) {
        technologies = data;
      } else if (data.data && Array.isArray(data.data)) {
        technologies = data.data;
      } else if (data.technologies && Array.isArray(data.technologies)) {
        technologies = data.technologies;
      } else if (data.result && Array.isArray(data.result)) {
        technologies = data.result;
      } else if (typeof data === 'object' && data !== null) {
        technologies = Object.entries(data).map(([key, value]) => ({ name: key, value }));
      }

      if (technologies.length === 0) {
        return message.reply('ℹ️ No tech stack detected or the API returned an empty response.');
      }

      const lines = technologies.map((item, index) => {
        if (typeof item === 'string') return `${index + 1}. ${item}`;
        const name = item.name || item.technology || item.title || item.slug || 'Unknown';
        const version = item.version || item.versions || '';
        const category = item.category || item.type || '';
        const extra = [category, version].filter(Boolean).join(' ');
        return `${index + 1}. ${name}${extra ? ` (${extra})` : ''}`;
      });

      let text = `**Tech stack for ${url}**\n\n`;
      text += lines.join('\n');

      if (text.length > 2000) {
        text = text.slice(0, 1990) + '\n...';
      }

      await message.channel.send(text);
    } catch (error) {
      console.error('Tech stack command error:', error);
      await message.reply(`❌ Failed to detect tech stack: ${error.message || error}`);
    }
  },
};
