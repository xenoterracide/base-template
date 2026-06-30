<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Distribute Git Hooks via pre-commit

**Date:** 2026-06-18
**Status:** Design approved

## Goal

Enable downstream repositories to install `subtree-share` git hooks by adding
this repository as a pre-commit source. This avoids `postinstall` scripts and
keeps the existing `git/hooks/*.sh` shell scripts as the canonical
implementation.

## Context

`subtree-share` currently provides git hooks in `git/hooks/`:

- `commit-msg` — validates conventional commit messages
- `pre-commit` — runs `lint-staged`
- `post-checkout` — syncs tooling after branch checkout
- `post-merge` — syncs tooling after merge

Developers opt in via `yarn contribute`, which sets `core.hooksPath` to
`git/hooks`. This works for this repository, but it does not help other
projects consume the same hooks from a git URL dependency without copying files
manually.

pre-commit is a widely-used hook package manager. It can install hooks from git
repositories, supports multiple hook stages, and does not require a
`postinstall` step in the consumer's package manager.

## Design

### Share repository changes

Add a `.pre-commit-hooks.yaml` manifest at the root of `subtree-share`. Each
entry points to the corresponding shell script in `git/hooks/`.

```yaml
---
- id: share-commit-msg
  name: Validate conventional commit message
  entry: git/hooks/commit-msg
  language: script
  stages: [commit-msg]

- id: share-pre-commit
  name: Run lint-staged
  entry: git/hooks/pre-commit
  language: script
  stages: [pre-commit]

- id: share-post-checkout
  name: Sync tooling after checkout
  entry: git/hooks/post-checkout
  language: script
  always_run: true
  pass_filenames: false
  stages: [post-checkout]

- id: share-post-merge
  name: Sync tooling after merge
  entry: git/hooks/post-merge
  language: script
  always_run: true
  pass_filenames: false
  stages: [post-merge]
```

The `post-checkout` and `post-merge` hooks operate on repository state rather
than individual files, so they use `always_run: true` and `pass_filenames:
false`.

Optionally add a wrapper command (e.g. `yarn install-hooks`) that runs:

```bash
pre-commit install \
  --hook-type commit-msg \
  --hook-type pre-commit \
  --hook-type post-checkout \
  --hook-type post-merge
```

### Consumer workflow

1. Add `pre-commit` to the consumer's development dependencies (for example,
   via `uv add --group dev pre-commit`).
2. Create `.pre-commit-config.yaml`:

   ```yaml
   ---
   repos:
     - repo: https://github.com/xenoterracide/subtree-share
       rev: vX.Y.Z
       hooks:
         - id: share-commit-msg
         - id: share-pre-commit
         - id: share-post-checkout
         - id: share-post-merge
   ```

3. Run `pre-commit install --hook-type commit-msg --hook-type pre-commit
--hook-type post-checkout --hook-type post-merge`.

### Hook-by-hook mapping

| Local hook      | pre-commit stage | Notes                                       |
| --------------- | ---------------- | ------------------------------------------- |
| `commit-msg`    | `commit-msg`     | Receives commit message file path           |
| `pre-commit`    | `pre-commit`     | Keeps delegating to `lint-staged`           |
| `post-checkout` | `post-checkout`  | `always_run: true`, `pass_filenames: false` |
| `post-merge`    | `post-merge`     | `always_run: true`, `pass_filenames: false` |

### pre-commit hook behavior

The `pre-commit` hook currently runs `yarn lint-staged`. Under pre-commit, it
will continue to do so. This preserves the existing staged-file linting
behavior without re-implementing it as individual pre-commit hooks.

## Documentation updates

- `CONTRIBUTING.md` — mention the pre-commit distribution path.
- `AGENTS.md` — update if hook installation workflows change.
- `README.md` — add a section for consumers who want to install hooks via
  pre-commit.

## Trade-offs

| Approach                   | Pros                                                       | Cons                                                                        |
| -------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| pre-commit package manager | Existing ecosystem, handles hook updates, no `postinstall` | Adds pre-commit dependency, post-checkout/post-merge support is less common |
| Custom vendoring installer | Full control, exact shell hooks                            | Installer must be maintained                                                |
| Standalone hook package    | Clean separation                                           | Another package to maintain                                                 |

This design chooses the pre-commit approach because it is a small change to the
existing shell hooks and fits the "install from git URL without postinstall"
constraint.

## Risks

- pre-commit must be installed in the consumer environment.
- `post-checkout` and `post-merge` hooks are repository-level hooks in
  pre-commit; they must be configured with `always_run: true` and
  `pass_filenames: false`.
- Hook script paths inside the package must remain stable relative to the
  repository root.

## Open questions

1. Should `subtree-share` also expose individual pre-commit hooks for
   `prettier` and `reuse` instead of a single `lint-staged` wrapper?
2. Should a wrapper command like `yarn install-hooks` be added to
   `subtree-share`, or should consumers run `pre-commit install` directly?

## Next step

Create an implementation plan for adding `.pre-commit-hooks.yaml` and updating
project documentation.
