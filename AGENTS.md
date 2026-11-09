<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# base-template

Copier template for Java and TypeScript projects. This repo wears two hats:
authoring checkout and template source. Every shared file serves both.

## Source of Truth

Read these files instead of trusting a copy of their contents here.

| For                            | See                                |
| ------------------------------ | ---------------------------------- |
| Install, update, usage         | `README.md`                        |
| Tool versions                  | `.tool-versions`                   |
| pnpm version                   | `packageManager` in `package.json` |
| Node dev dependencies          | `package.json`, `pnpm-lock.yaml`   |
| Python dependencies            | `pyproject.toml`, `uv.lock`        |
| Formatting rules               | `.editorconfig`, `.prettierrc.yml` |
| Conventional commit types      | `git-conventional-commits.yaml`    |
| Pre-commit rules               | `.lintstagedrc.cjs`                |
| License headers                | `REUSE.toml`, `.lintstagedrc.cjs`  |
| Git hooks                      | `.config/git/hooks`                |
| Template questions and answers | `copier.yml`                       |
| Design decisions               | `docs/superpowers/specs/`          |
| CI workflows                   | `.github/workflows/`               |
| Renovate config                | `.github/renovate.json5`           |

## Build and Test

```bash
pnpm contribute # bootstrap once after clone: tools, deps, hooks
pnpm lint # prettier + REUSE
uv run --group dev pytest tests/ -q # render all variants, assert structure
./tests/verify.sh config # full check of a generated project (java|typescript|config)
```

## Conventions

- Read `.editorconfig` before editing. Every text file ends with a newline,
  including `.jinja` sources, which prettier cannot check.
- The template bakes SPDX headers with lineage year ranges: each file's
  copyright starts when its expression first appeared in the holder's
  history, established by archaeology across the family repos. In
  consumers, `reuse annotate` extends the ranges on commit, and Renovate
  bumps the end year from this repo's calver tags. JSON files cannot carry
  comments, so they stay annotation-covered with the range in
  `REUSE.toml`.
- Variant-only files gate through conditional path parts:
  `{% if template_type == 'java' %}…{% endif %}`.
- Hooks heal the toolchain. `.envrc`, `contribute`, and the post hooks call
  `.config/git/hooks/heal.sh`. A failed heal never breaks a checkout.
- Renovate pins move weekly. Expect `develop` to move.
- Release tags are calver, `vYY.MM.micro`: a dated checkpoint, not a
  compatibility contract. Tags carry the `v`. Manifests carry the bare
  version. Bump micro for a second release in the same month.

## Maintenance

Update this file when conventions change.
