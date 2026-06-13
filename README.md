<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# share / template-main

Shared configuration and developer tooling for projects in the
`xenoterracide` ecosystem.

This repository is intended to be consumed as either a **git submodule** or a
**git subtree**. If you are reading this file at the root of a repository, you
are viewing the standalone project. If it appears inside a subdirectory, it has
been included as a git subtree.

## What it provides

- **Git hooks** in `git/hooks/` for conventional commits, lint-staged, and
  automatic dependency syncing.
- **Formatting and linting** via Prettier and REUSE.
- **Conventional commit validation** via `git-conventional-commits`.
- **GitHub Actions workflows** for license, prettier, and node-cli checks.
- **Renovate configuration** for automated dependency updates.

## Setup

```bash
# Install Node.js and Python tools listed in .tool-versions
asdf install

# Install dependencies, sync Python environment, and configure git hooks
yarn contribute
```

## Usage in another repository

### Git subtree

```bash
git subtree add --prefix .share https://github.com/xenoterracide/subtree-share.git develop --squash
```

### Git submodule

```bash
git submodule add https://github.com/xenoterracide/subtree-share.git .share
```

## See also

- [`AGENTS.md`](./AGENTS.md) — instructions for AI coding agents working in
  this repository.
