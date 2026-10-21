FROM node:20-bookworm-slim

# Install ffmpeg, build tools for native Node modules, and gosu to drop privileges.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        make \
        g++ \
        ca-certificates \
        gosu && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create a non-root user to run the bot.
RUN groupadd -r raspbot && useradd -r -g raspbot raspbot

# Copy dependency manifests first for better layer caching.
COPY package*.json ./

# Install production dependencies and compile native modules.
# Use npm install instead of npm ci because lockfile native platform packages
# may not match the container's architecture.
RUN npm install --legacy-peer-deps --omit=dev

# Copy application code.
COPY . .

# Remove package-lock.json if it was copied, since npm install regenerated it
# and we don't want platform-specific lockfiles to confuse future builds.
RUN rm -f package-lock.json

# Ensure the data directory exists at runtime for SQLite and is writable.
ENV ECONOMY_DB_PATH=/app/data/economy.db

# Copy and enable the entrypoint that fixes volume permissions before dropping to raspbot.
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "index.js"]
