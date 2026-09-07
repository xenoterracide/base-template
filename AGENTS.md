<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# share

Shared configuration, git hooks, and tooling repository. Uses Node.js-based
developer tools (Prettier, lint-staged, git-conventional-commits) managed via
Yarn PnP, with Python scripting via `uv`.

Hooks in `git/hooks/` are installed directly via git `core.hooksPath` (see
`yarn contribute`). Hooks run as native git hooks (for example, `post-checkout`
receives scope and checkout type as positional arguments).

The `post-checkout` hook runs `sync-tooling` after checkout; downstream
consumers update tooling when they pull the latest subtree or submodule.

## Build and Test

- Lint/format: `yarn lint`
- Prettier check: `yarn lint:prettier`
- REUSE compliance: `yarn lint:reuse`
- Setup after clone: `yarn contribute`

## Source of Truth

- Tool versions → `.tool-versions`
- Node scripts and dev dependencies → `package.json`
- Python dependencies → `pyproject.toml`, `uv.lock`
- Conventional commit types → `git-conventional-commits.yaml`
- Renovate configuration → `.github/renovate.json5`
- Git hooks → `git/hooks/`
- lint-staged configuration → `.lintstagedrc.cjs`

## Conventions

- All files MUST have SPDX license headers.
- lint-staged enforces formatting and license annotation on staged files.
- Git hooks live in `git/hooks/` and are installed by `yarn contribute`.

## Maintenance

Update this file when you change workflows or conventions it describes.
