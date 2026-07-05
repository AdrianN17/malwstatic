#!/bin/sh
set -e

# ── Must be on main ───────────────────────────────────────────────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "✗ Must be on main branch (currently on '$BRANCH')"
  exit 1
fi

# ── Read version from package.json ────────────────────────────────────────────
VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -1)
TAG="v${VERSION}"

# ── Avoid duplicate tags ──────────────────────────────────────────────────────
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "✗ Tag $TAG already exists locally — bump the version first"
  exit 1
fi

echo "→ Tagging $TAG and pushing to origin…"
git tag "$TAG"
git push origin "$TAG"
echo "✓ Released $TAG"
