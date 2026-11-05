<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Contributing

## Setup

    git clone https://github.com/xenoterracide/base-template
    cd base-template
    pnpm contribute

## Lint

    pnpm lint

## Adding template files

- Shared config, identical in every consumer: place it verbatim at the root.
  Inline SPDX headers. CC0 for configs, MIT for scripts.
- Shared but answer-dependent: write `*.jinja` with baked whole-line SPDX
  moustaches. Do not list the target name in `_exclude`. The render wins.
- Variant-only: gate the filename with `{% if template_type == '…' %}`.

## Pull requests

- Conventional commits. `git-conventional-commits.yaml` lists the types.
- The agent token cannot push `.github/workflows/**`. A human pushes those.
- Update `README.md` when user-facing behavior changes.
- Update `AGENTS.md` when build processes or tooling change.
