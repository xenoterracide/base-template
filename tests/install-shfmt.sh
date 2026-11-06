#!/bin/sh

# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: MIT

# Installs the .tool-versions shfmt pin when missing. CI runners provision
# pnpm, uv, node, and java but not shfmt, and lint-staged's shell row needs
# it. No-ops when shfmt is already on PATH. Run from anywhere.

set -eu

cd "$(dirname "$0")/.."

command -v shfmt >/dev/null 2>&1 && exit 0

version=$(awk '$1 == "shfmt" { print $2 }' .tool-versions)
[ -n "$version" ] || {
  echo "install-shfmt: no shfmt pin in .tool-versions" >&2
  exit 1
}
case "$(uname -m)" in
x86_64) arch=amd64 ;;
aarch64) arch=arm64 ;;
*)
  echo "install-shfmt: unsupported arch $(uname -m)" >&2
  exit 1
  ;;
esac

mkdir -p "$HOME/.local/bin"
curl -fsSL \
  "https://github.com/mvdan/sh/releases/download/v${version}/shfmt_v${version}_linux_${arch}" \
  -o "$HOME/.local/bin/shfmt"
chmod +x "$HOME/.local/bin/shfmt"
echo "install-shfmt: installed shfmt ${version}"
