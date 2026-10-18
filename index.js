const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { Player } = require('discord-player');
const { YoutubeExtractor } = require('discord-player-youtube');
const fs = require('fs');
const path = require('path');

// Load .env file if present (useful for local development; Docker uses env_file)
if (fs.existsSync(path.join(__dirname, '.env'))) {
  require('dotenv').config();
}

const config = require('./config.json');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || config.token;
if (!DISCORD_TOKEN) {
  console.error('Error: DISCORD_TOKEN is not set. Provide it via environment variable or config.json.');
  process.exit(1);
}

function loadYouTubeCookies() {
  // If you ever need YouTube cookies, put them in a file named yt-cookies.txt
  // in the project root (gitignored) or set the YOUTUBE_COOKIES env variable.
  // Do NOT paste cookies into source code.
  if (process.env.YOUTUBE_COOKIES) {
    return process.env.YOUTUBE_COOKIES;
  }
  const cookiePath = path.join(__dirname, 'yt-cookies.txt');
  if (fs.existsSync(cookiePath)) {
    return fs.readFileSync(cookiePath, 'utf-8').trim();
  }
  return undefined;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.name, command);
}

const player = new Player(client, {
  useLegacyFFmpeg: false,
});

const youtubeCookies = loadYouTubeCookies();
const extractorOptions = youtubeCookies ? { cookie: youtubeCookies } : {};

player.extractors.register(YoutubeExtractor, extractorOptions).catch(err => {
  console.error('Failed to register YouTube extractor:', err);
});

player.events.on('playerStart', (queue, track) => {
  queue.metadata.channel.send(`▶️ Now playing: **${track.title}**`);
});

player.events.on('playerError', (queue, error) => {
  console.error('Player error:', error);
  queue.metadata.channel.send('❌ Player error. Skipping...');
  queue.node.skip();
});

player.events.on('error', (queue, error) => {
  console.error('Queue error:', error);
  queue.metadata.channel.send('❌ Queue error.');
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName);
  if (!command) return;

  try {
    await command.execute(message, args, player);
  } catch (error) {
    console.error(error);
    await message.reply('❌ There was an error executing that command.');
  }
});

client.login(DISCORD_TOKEN);
