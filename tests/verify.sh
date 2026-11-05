#!/bin/sh

# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: MIT

# Full verification of a generated project.
# Usage: ./tests/verify.sh [java|typescript|config]
set -eu

VARIANT="${1:-java}"
TMPDIR=$(mktemp -d /tmp/opencode/verify.XXXXXXXX)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Generating $VARIANT project into $TMPDIR..."
uv run --group dev copier copy --trust --defaults \
  --data template_type="$VARIANT" \
  --data project_name=sample \
  . "$TMPDIR/sample" >/dev/null

cd "$TMPDIR/sample"
echo "Installing dependencies..."
pnpm install --reporter=silent
uv sync --quiet

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
