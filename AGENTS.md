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
| Formatting rules               | `.editorconfig`, `.prettierrc.cjs` |
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
```

## Conventions

- Every file carries an SPDX header. `.jinja` sources bake headers as
  whole-line moustaches.
- Variant-only files gate through conditional path parts:
  `{% if template_type == 'java' %}…{% endif %}`.
- Hooks heal the toolchain. `.envrc`, `contribute`, and the post hooks call
  `.config/git/hooks/heal.sh`. A failed heal never breaks a checkout.
- Renovate pins move weekly. Expect `develop` to move.

## Maintenance

Update this file when conventions change.
