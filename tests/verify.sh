#!/bin/sh

# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: MIT

# Full verification of a generated project.
# Usage: ./tests/verify.sh [java|typescript|config]
set -eu

VARIANT="${1:-java}"
case "$VARIANT" in
java | typescript | config) ;;
*)
  echo "usage: $0 [java|typescript|config]" >&2
  exit 2
  ;;
esac

# lint-staged's shell row needs shfmt; CI runners do not provision it.
"$(dirname "$0")/install-shfmt.sh"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "Generating $VARIANT project into $WORK..."
uv run --group dev copier copy --trust --defaults \
  --data template_type="$VARIANT" \
  --data project_name=sample \
  . "$WORK/sample" >/dev/null

cd "$WORK/sample"
echo "Installing dependencies..."
pnpm install --reporter=silent
uv sync --quiet

# reuse needs a committed tree to honor nested ignored dirs (git 2.56
# drops them from ls-files --ignored when untracked siblings exist)
echo "Committing the render (lint-staged annotates headers)..."
git init --quiet
git add -A
pnpm exec lint-staged
git -c user.name=verify -c user.email=verify@localhost commit -qm "verify render"

echo "Running prettier check..."
pnpm lint:prettier

echo "Running reuse lint..."
pnpm lint:reuse

if [ "$VARIANT" = java ]; then
  echo "Running maven verify..."
  ./mvnw -q verify
elif [ "$VARIANT" = typescript ]; then
  echo "Running typecheck..."
  pnpm typecheck
  echo "Running tests..."
  pnpm test
else
  echo "Running check..."
  pnpm check
fi

echo "All $VARIANT checks passed."
