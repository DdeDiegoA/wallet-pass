#!/bin/sh
# SessionEnd hook: safely close dev ports if any process in this repo is listening
# POSIX-compatible (no bash, jq, or python required). Safe no-op when nothing listening.

# Get the repo root (assuming this script is in scripts/)
repo_root="$(cd "$(dirname "$0")/.." && pwd)" || exit 0

# Try to find and kill processes listening on typical dev ports (3000-5000, 8000-8100).
# Use only POSIX tools (lsof if available, otherwise exit cleanly).
if command -v lsof >/dev/null 2>&1; then
  lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -E "3000|4000|5000|8000|8080|9000" | while read -r line; do
    pid=$(echo "$line" | awk '{print $2}')
    if [ -n "$pid" ]; then
      cwd=$(lsof -p "$pid" -a -d cwd 2>/dev/null | tail -1 | awk '{print $NF}')
      if [ -n "$cwd" ] && [ "$cwd" = "$repo_root" ]; then
        kill -0 "$pid" 2>/dev/null && kill "$pid" 2>/dev/null
      fi
    fi
  done
fi

exit 0
