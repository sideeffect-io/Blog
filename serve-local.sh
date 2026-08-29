#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if [ ! -x "node_modules/.bin/astro" ]; then
  echo "Installing dependencies..."
  npm ci
fi

npm run build

ASTRO_PREVIEW_HOST=${ASTRO_PREVIEW_HOST:-127.0.0.1}
ASTRO_PREVIEW_PORT=${ASTRO_PREVIEW_PORT:-4321}

echo "Serving the generated website at http://${ASTRO_PREVIEW_HOST}:${ASTRO_PREVIEW_PORT}"
exec npm run preview -- --host "$ASTRO_PREVIEW_HOST" --port "$ASTRO_PREVIEW_PORT"
