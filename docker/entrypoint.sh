#!/bin/bash
set -e

# FileManager Docker Entrypoint
# Handles UID/GID mapping to match host user permissions

PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "----------------------------------------"
echo "FileManager Docker Container"
echo "----------------------------------------"
echo "User UID: $PUID"
echo "User GID: $PGID"
echo "----------------------------------------"

# Get current filemanager user info
CURRENT_UID=$(id -u filemanager)
CURRENT_GID=$(id -g filemanager)

# Update group if needed
if [ "$PGID" != "$CURRENT_GID" ]; then
    echo "Updating filemanager group to GID $PGID..."
    groupmod -o -g "$PGID" filemanager
fi

# Update user if needed
if [ "$PUID" != "$CURRENT_UID" ]; then
    echo "Updating filemanager user to UID $PUID..."
    usermod -o -u "$PUID" filemanager
fi

# Fix ownership of app directories
echo "Adjusting permissions..."
chown -R filemanager:filemanager /app/data

# If /data exists and is a mount point, only adjust if we own it
if [ -d "/data" ]; then
    # Try to chown /data, but don't fail if we can't (e.g., read-only mount)
    chown filemanager:filemanager /data 2>/dev/null || true
fi

echo "Starting FileManager..."
echo "----------------------------------------"

# Drop privileges and run the application
exec gosu filemanager "$@"
