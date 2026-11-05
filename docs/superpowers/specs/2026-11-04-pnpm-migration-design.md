<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# pnpm migration — design

> Moved from xenoterracide/java-commons on 2026-11-05. That repo's history
> keeps its adoption commit; the template now ships these decisions.

Migrate java-commons from yarn 4 (Plug'n'Play) to pnpm 12.16.1, the
package manager github and agent-skills already run.

## Why

The shared workflows from xenoterracide/github are pnpm-based, so a yarn
repo's prettier and devtool-regression checks stay red until it runs pnpm.

## Goals

- pnpm 12.16.1 via the `packageManager` pin; corepack shims in
  `~/.local/bin` serve it locally, `pnpm/action-setup` in CI.
- Lockfile from `pnpm import`; `pnpm install --frozen-lockfile` passes.
- Git hooks run pnpm; `.share` remnants and dead scripts removed.
- CI green on the pnpm-based shared workflows.

## Non-goals

Dependency bumps (renovate owns them), node or java version changes,
Maven changes.

## Anti-goals

Leftover `yarn.lock` or PnP files — pnpm 12 preloads a leftover
`.pnp.cjs` into `pnpm exec` and `pnpm run`, so deleting them is
required. A red window on develop: the workflow repin rides in the
migration commit.

## Approaches

- **A — github pattern (chosen):** move post-checkout and post-merge
  into `.config/git/hooks`, convert all four hooks to pnpm, delete
  `.share/`, drop the dead `merge:*`, `test`, and `setup:yarn`
  scripts, repoint `contribute` and `.envrc` to `.config/git/hooks`.
  Matches the local `core.hooksPath` and the `.lintstagedrc.cjs` glob.
- **B — agent-skills pattern:** keep `.share/git/hooks` in place.
  Rejected: leaves a one-directory subtree remnant that lint-staged and
  prettier already skip.
- **C — minimal:** convert both hook sets, keep duplicates and dead
  scripts. Rejected: keeps the mess.

## Decisions

- One commit, `chore: migrate to pnpm`, carrying the workflow repin so
  CI never mixes package managers.
- `.envrc` follows the self-healing pattern — corepack into
  `~/.local/bin`, `pnpm install --frozen-lockfile`, `uv sync --frozen`,
  `git config core.hooksPath .config/git/hooks`.
- `.lintstagedrc.cjs`'s `withoutYarn` becomes `withoutGenerated`,
  filtering `pnpm-lock.yaml`.
