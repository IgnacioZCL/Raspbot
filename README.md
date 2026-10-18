# RaspBot

A simple, self-hosted Discord music bot for Raspberry Pi. No subscription services required — it streams audio from YouTube using `discord-player`.

## Features

- `!play <query>` — search YouTube and play/queue audio
- `!pause` — pause or resume playback
- `!skip` — skip the current song
- `!queue` — show the current queue

## Running locally

```bash
npm install
npm start
```

## Running with Docker on Raspberry Pi

### 1. Prerequisites

Install Docker and Docker Compose on your Raspberry Pi:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
sudo apt-get install -y docker-compose-plugin
```

Log out and back in for the group change to take effect.

### 2. Configure the bot

Make sure `config.json` exists in the project root with your Discord bot token and prefix:

```json
{
  "prefix": "!",
  "token": "YOUR_BOT_TOKEN_HERE"
}
```

> `config.json` is ignored by Git and Docker so your token never leaves your Pi.

### 3. Build and run

```bash
docker compose up -d --build
```

### 4. View logs

```bash
docker compose logs -f raspbot
```

### 5. Stop the bot

```bash
docker compose down
```

## Updating the bot

Pull or edit the code, then rebuild and restart:

```bash
docker compose up -d --build
```

## Discord bot permissions

In the Discord Developer Portal, enable these Gateway Intents for your bot:

- Guilds
- GuildMessages
- MessageContent
- GuildVoiceStates

Invite the bot with the `bot` scope and permissions to connect and speak in voice channels.
