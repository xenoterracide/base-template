<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Contributing

## Setup

    git clone https://github.com/xenoterracide/base-template
    cd base-template
    npm run contribute

## Lint

    pnpm lint

`git push` runs `pnpm lint` first (pre-push hook); `git push --no-verify`
bypasses it.

## Adding template files

- Shared config, identical in every consumer: keep the plain authoring file
  (its own SPDX header licenses this repo) and add a headerless `.jinja`
  twin so consumers render no headers.
- Answer-dependent file: write a headerless `*.jinja`. Do not list the target
  name in `_exclude`. The render wins.
- License assignment lives only in `.lintstagedrc.cjs`; the authoring
  `REUSE.toml` mass-licenses `.jinja` sources (`**/*.jinja` → CC0-1.0).
- Variant-only: gate the filename with `{% if template_type == '…' %}`.

## Pull requests

- Conventional commits. `git-conventional-commits.yaml` lists the types.
- The agent token cannot push `.github/workflows/**`. A human pushes those.
- Update `README.md` when user-facing behavior changes.
- Update `AGENTS.md` when build processes or tooling change.
