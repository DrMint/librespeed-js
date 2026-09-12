#!/usr/bin/env sh
set -e

# Keep lockfile aligned with package.json, then verify.
npm install
npm run check

# Include lockfile / auto-fixes for paths already in this commit.
git add package-lock.json package.json
git diff --cached --name-only --diff-filter=ACMR | while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -e "$f" ] || continue
  git add -- "$f"
done
