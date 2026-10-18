FROM node:20-bookworm-slim

# Install ffmpeg and build tools for native Node modules
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        make \
        g++ \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package*.json ./

# Install production dependencies and compile native modules.
# Use npm install instead of npm ci because lockfile native platform packages
# may not match the container's architecture.
RUN npm install --legacy-peer-deps --omit=dev

# Copy application code
COPY . .

# Remove package-lock.json if it was copied, since npm install regenerated it
# and we don't want platform-specific lockfiles to confuse future builds.
RUN rm -f package-lock.json

# Create a non-root user to run the bot
RUN groupadd -r raspbot && useradd -r -g raspbot raspbot && \
    chown -R raspbot:raspbot /app
USER raspbot

CMD ["node", "index.js"]
