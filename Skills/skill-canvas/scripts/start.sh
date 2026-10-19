#!/bin/sh
# Usage: start.sh [workspace-dir] [port]
# Thin wrapper: needs Node 16+. Creates/refreshes the workspace and serves the board.
command -v node >/dev/null 2>&1 || { echo "Node.js is required (https://nodejs.org)"; exit 1; }
exec node "$(dirname "$0")/skillviz.js" serve "${1:-./skill-viz}" --port "${2:-8765}"
