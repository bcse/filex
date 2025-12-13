#!/bin/bash
set -e

# Filex Docker Entrypoint
# Handles UID/GID mapping to match host user permissions

PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "----------------------------------------"
echo "Filex Docker Container"
echo "----------------------------------------"
echo "User UID: $PUID"
echo "User GID: $PGID"
echo "----------------------------------------"

# Get current filex user info
CURRENT_UID=$(id -u filex)
CURRENT_GID=$(id -g filex)

# Update group if needed
if [ "$PGID" != "$CURRENT_GID" ]; then
    echo "Updating filex group to GID $PGID..."
    groupmod -o -g "$PGID" filex
fi

# Update user if needed
if [ "$PUID" != "$CURRENT_UID" ]; then
    echo "Updating filex user to UID $PUID..."
    usermod -o -u "$PUID" filex
fi

# Fix ownership of app directories
echo "Adjusting permissions..."
chown -R filex:filex /app/data

# If /data exists and is a mount point, only adjust if we own it
if [ -d "/data" ]; then
    # Try to chown /data, but don't fail if we can't (e.g., read-only mount)
    chown filex:filex /data 2>/dev/null || true
fi

echo "Starting Filex..."
echo "----------------------------------------"

# Drop privileges and run the application
exec gosu filex "$@"
