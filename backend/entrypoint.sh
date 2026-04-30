#!/bin/sh
set -e

# Wait for MongoDB
until nc -z db 27017; do
  echo "Waiting for MongoDB..."
  sleep 2
done

# Wait for Redis
until nc -z redis 6379; do
  echo "Waiting for Redis..."
  sleep 2
done

# Seed data if first run
if [ ! -f /data/seeded ]; then
  echo "Running seed data..."
  python seed_data.py
  touch /data/seeded
fi

# Run main command
exec "$@"
