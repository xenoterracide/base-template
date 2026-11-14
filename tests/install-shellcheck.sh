#!/bin/sh

# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: MIT

# Installs the .tool-versions shellcheck pin when missing. The copier
# verify runners provision shfmt but not shellcheck, and the pre-push
# exercise's lint:shellcheck needs it. No-ops when shellcheck is already
# on PATH. Run from anywhere.

set -eu

cd "$(dirname "$0")/.."

command -v shellcheck >/dev/null 2>&1 && exit 0

version=$(awk '$1 == "shellcheck" { print $2 }' .tool-versions)
[ -n "$version" ] || {
  echo "install-shellcheck: no shellcheck pin in .tool-versions" >&2
  exit 1
}
case "$(uname -m)" in
x86_64 | aarch64) arch=$(uname -m) ;;
*)
  echo "install-shellcheck: unsupported arch $(uname -m)" >&2
  exit 1
  ;;
esac

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL \
  "https://github.com/koalaman/shellcheck/releases/download/v${version}/shellcheck-v${version}.linux.${arch}.tar.xz" |
  tar -xJ -C "$tmp"
mkdir -p "$HOME/.local/bin"
mv "$tmp/shellcheck-v${version}/shellcheck" "$HOME/.local/bin/shellcheck"
chmod +x "$HOME/.local/bin/shellcheck"
echo "install-shellcheck: installed shellcheck ${version}"
