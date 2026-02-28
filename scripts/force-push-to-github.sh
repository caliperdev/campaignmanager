#!/bin/bash
# Force-push local state to GitHub, overwriting remote.
# Use when Vercel deployment is out of sync and you want GitHub to match local exactly.
#
# Run: ./scripts/force-push-to-github.sh
set -e
cd "$(dirname "$0")/.."
git add -A
git status
git diff --cached --stat
echo ""
echo "To force-push (overwrites GitHub with local):"
echo "  git commit -m 'Sync local to GitHub' && git push --force origin main"
