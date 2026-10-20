#!/bin/bash
set -e

# The container starts as root so it can fix permissions on the host-mounted volume.
mkdir -p /app/data
chown -R raspbot:raspbot /app/data

# Also ensure the app files are readable by the runtime user.
chown -R raspbot:raspbot /app

# Drop to the non-root user before running the bot.
exec gosu raspbot node index.js
