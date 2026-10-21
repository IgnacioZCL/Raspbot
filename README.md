# RaspBot

A simple, self-hosted Discord music bot for Raspberry Pi. No subscription services required — it streams audio from YouTube and Spotify using `discord-player`.

## Features

### Music
- `!play <query>` — search YouTube/Spotify and play/queue audio
- `!pause` — pause or resume playback
- `!skip` — skip the current song
- `!queue` — show the current queue

### Economy
- `!balance` — check your wallet and next `!claim` availability
- `!claim` — claim $1000 every hour
- `!history [limit]` — show your recent transactions

### Fun
- `!dice [faces]` — roll a die with the given number of faces (default 6)

### D&D 3.5e
- `!dnd create <name> <race> <class>` — create a character in this server
- `!dnd assign str=14 dex=12 ...` — assign stats during creation
- `!dnd sheet` — show your character sheet
- `!dnd roll <str|dex|con|int|wis|cha>` — roll a d20 + ability modifier
- `!dnd attack` — roll an attack
- `!dnd save <fort|ref|will>` — roll a saving throw
- `!dnd skill <skill name>` — roll a skill check
- `!dnd skills` — list available skills
- `!dnd hp <+/-amount>` — adjust your HP
- `!dnd rest` — recover HP and spell slots
- `!dnd inventory` — show inventory
- `!dnd add [qty] <item>` — add item
- `!dnd remove [qty] <item>` — remove item
- `!dnd spells` — list known spells
- `!dnd cast <spell name>` — cast a spell
- `!dnd dc <spell-level>` — show your spell save DC (for casters)
- `!dnd classes` / `!dnd races` — list options

Party and encounters:
- `!dnd party create <name>` — create a party
- `!dnd party join <party-id>` — join a party
- `!dnd party leave` — leave your party
- `!dnd party status` — show party members
- `!dnd party list` — list active parties
- `!dnd party disband` — disband your party (leader only)
- `!dnd monsters [easy|medium|hard|boss]` — list available monsters with their CR
- `!dnd encounter <monster-key>` — start a fight; shows CR, EL and encounter difficulty vs the party
- `!dnd attack-monster` — attack the active encounter
- `!dnd monster-status` — show encounter health and participants
- `!dnd end-encounter` — end the encounter (admin only)

**Encounter math:** each monster has a **Challenge Rating (CR)**. The bot computes an **Encounter Level (EL)** from the monster(s) and compares it to the party's average level to label the fight (Very Easy → Deadly). When multiple players defeat a monster, XP is split and boosted by 15%.

Admin commands: `!dnd heal`, `!dnd damage`, `!dnd give`, `!dnd give-spell`, `!dnd setxp`, `!dnd retire`.

### Games
- `!blackjack <bet>` — play blackjack (min bet $100, split allowed)

## Running locally

Create a `.env` file from the example and add your token:

```bash
cp .env.example .env
# edit .env and set DISCORD_TOKEN
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

Copy the example environment file and add your Discord bot token:

```bash
cp .env.example .env
nano .env
```

```env
DISCORD_TOKEN=YOUR_BOT_TOKEN_HERE
```

> `.env` is ignored by Git so your token is never published. Keep it only on your Pi.
> The economy database is stored in `data/economy.db` (also ignored by Git) and mounted as a Docker volume so it persists across container rebuilds.

The optional `config.json` file can still be used for the command prefix (default is `!`).

For Spotify support, also add your Spotify client credentials to `.env` (optional but recommended for playlists/albums):

```env
SPOTIFY_CLIENT_ID=YOUR_SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET=YOUR_SPOTIFY_CLIENT_SECRET
```

Create a Spotify app at https://developer.spotify.com/dashboard to get these values.

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
