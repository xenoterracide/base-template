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
# the pre-push exercise's lint:shellcheck needs shellcheck likewise
"$(dirname "$0")/install-shellcheck.sh"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "Generating $VARIANT project into $WORK..."
uv run --group dev copier copy --vcs-ref HEAD --trust --defaults \
  --data template_type="$VARIANT" \
  --data project_name=sample \
  . "$WORK/sample" >/dev/null

cd "$WORK/sample"
echo "Installing dependencies..."
pnpm install --reporter=silent
uv sync --quiet

# reuse needs a committed tree to honor nested ignored dirs (git 2.56
# drops them from ls-files --ignored when untracked siblings exist)
echo "Committing the render (the pre-commit hook annotates and seeds LICENSES)..."
# CI='' simulates a developer commit: the hook's guard skips it under a
# real CI=true, where GitHub runs the checks instead of the hooks.
git init --quiet
git add -A
CI='' sh .config/git/hooks/pre-commit
git -c user.name=verify -c user.email=verify@localhost commit -qm "verify render"

echo "Running prettier check..."
pnpm lint:prettier

echo "Running reuse lint..."
pnpm lint:reuse

if [ "$VARIANT" = java ]; then
  echo "Running maven verify..."
  ./mvnw -q verify
elif [ "$VARIANT" = typescript ]; then
  echo "Running eslint..."
  pnpm lint:eslint
  echo "Running typecheck..."
  pnpm typecheck
  echo "Running tests..."
  pnpm test
else
  echo "Running check..."
  pnpm check
fi

echo "Running the pre-push hook..."
# CI='' simulates a developer push: the hook's guard skips a real CI=true
CI='' sh .config/git/hooks/pre-push

echo "All $VARIANT checks passed."
